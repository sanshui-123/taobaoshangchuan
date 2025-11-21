const path = require('path');
const { validateConfig, TAOBAO_CONFIG, FEISHU_CONFIG, printConfig } = require('./config');
const { Command } = require('commander');
const { steps } = require('./steps');
const { createStepLogger } = require('./utils/logger');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('./utils/cache');
const { uploadImages } = require('./tools/upload-material-folder');

// 步骤名称映射
const stepNames = [
  '任务初始化',          // 0
  '下载图片',            // 1
  '翻译内容',            // 2
  '登录验证',            // 3
  '打开发布页',          // 4
  '上传主图',            // 5
  '标题分类',            // 6
  '选择品牌',            // 7
  '填写货号性别',        // 8
  '填写价格库存',        // 9
  '裁剪3:4主图',         // 10
  '填写详情模板',        // 11
  '提交商品',            // 12
  '日志通知'             // 13
];

function getStepName(stepId) {
  return stepNames[stepId] || `步骤${stepId}`;
}

const program = new Command();

program
  .name('publish')
  .description('淘宝商品发布管线')
  .option('-p, --product <id>', '商品ID（单个商品）')
  .option('-b, --batch <ids>', '批量处理商品ID（用逗号分隔，例如：C25217104,C25216104）')
  .option('-s, --step <number>', '指定要执行的步骤（可多次使用）', (value, previous = []) => {
    const stepId = parseInt(value);
    const maxStep = stepNames.length - 1;
    if (isNaN(stepId) || stepId < 0 || stepId > maxStep) {
      throw new Error(`无效的步骤ID: ${value}（有效范围: 0-${maxStep}）`);
    }
    return previous ? [...previous, stepId] : [stepId];
  })
  .option('--from <number>', '起始步骤（包含）', (value) => {
    const stepId = parseInt(value);
    const maxStep = stepNames.length - 1;
    if (isNaN(stepId) || stepId < 0 || stepId > maxStep) {
      throw new Error(`无效的起始步骤: ${value}（有效范围: 0-${maxStep}）`);
    }
    return stepId;
  })
  .option('--to <number>', '结束步骤（包含）', (value) => {
    const stepId = parseInt(value);
    const maxStep = stepNames.length - 1;
    if (isNaN(stepId) || stepId < 0 || stepId > maxStep) {
      throw new Error(`无效的结束步骤: ${value}（有效范围: 0-${maxStep}）`);
    }
    return stepId;
  })
  .option('--dry-run', '试运行模式，只打印要执行的步骤')
  .option('--verbose', '详细日志输出')
  .option('--screenshot', '每个步骤完成后自动截图')
  .option('--brand <name>', '只处理指定品牌')
  .option('--category <name>', '只处理指定品类')
  .option('--gender <name>', '只处理指定性别');

async function runSteps(options) {
  const { product: productId, batch: batchIds } = options;

  // 确定要执行的步骤范围
  const maxStep = stepNames.length - 1;
  let stepsToRun = [];
  if (options.step && options.step.length > 0) {
    stepsToRun = options.step;
  } else if (options.from !== undefined && options.to !== undefined) {
    for (let i = options.from; i <= options.to; i++) {
      stepsToRun.push(i);
    }
  } else {
    for (let i = 0; i <= maxStep; i++) {
      stepsToRun.push(i);
    }
  }

  // 参数验证：只有在不包含 Step0 且没有商品ID时才报错
  const includesStep0 = stepsToRun.includes(0);

  if (!productId && !batchIds && !includesStep0) {
    console.error('❌ 错误：必须指定 --product 或 --batch 参数，或者执行范围包含 Step0（自动取单模式）');
    process.exit(1);
  }

  if (productId && batchIds) {
    console.error('❌ 错误：--product 和 --batch 参数不能同时使用');
    process.exit(1);
  }

  // 验证配置
  if (!validateConfig()) {
    process.exit(1);
  }

  // 批量处理模式
  if (batchIds) {
    const productIds = batchIds.split(',').map(id => id.trim());
    console.log(`\n🚀 开始批量执行商品发布流程 - ${productIds.length} 个商品`);
    console.log('='.repeat(60));
    console.log(`📋 商品列表: ${productIds.join(', ')}`);

    // 详细模式下显示配置信息
    if (options.verbose) {
      printConfig();
    }

    // 调用批量处理
    const { runBatch } = require('./steps/step0-task-init');
    await runBatch(productIds);
    return;
  }

  // 单商品模式（原有逻辑）
  // 自动取单模式：如果包含 Step0 且没有指定 productId，则先用临时标识
  const tempProductId = productId || 'auto_fetching';
  console.log(`\n🚀 开始执行商品发布流程${productId ? ' - ProductID: ' + productId : ' - 自动取单模式'}`);
  console.log('='.repeat(60));

  // 详细模式下显示配置信息
  if (options.verbose) {
    printConfig();
  }

  // 加载或创建任务缓存（自动模式下使用临时ID）
  const taskCache = loadTaskCache(tempProductId);

  // 初始化步骤状态
  const stepStatus = {};
  for (let i = 0; i <= maxStep; i++) {
    stepStatus[i] = taskCache.stepStatus[i] || 'pending';
  }

  console.log(`\n📋 将执行步骤: ${stepsToRun.join(', ')}`);

  // 试运行模式
  if (options.dryRun) {
    console.log('\n🔍 试运行模式 - 不会实际执行步骤');
    for (const step of stepsToRun) {
      console.log(`  [步骤${step}] ${getStepName(step)}`);
    }
    console.log('\n✅ 试运行完成');
    return;
  }

  // 创建共享上下文（在所有步骤之间共享）
  const sharedContext = {
    productId: productId || null,  // 自动模式下初始为 null
    taskCache,
    stepStatus,
    options  // 传递命令行参数（包括 brand、category 等筛选条件）
  };

  // 辅助函数：解析当前真实的 productId
  const resolveProductId = () => {
    // 如果已有 productId，直接返回
    if (productId) return productId;

    // 否则从共享上下文获取（Step0 会设置）
    return sharedContext.productId || tempProductId;
  };

  // 创建步骤上下文
  const createStepContext = (stepId) => {
    const currentProductId = resolveProductId();
    const logger = createStepLogger(currentProductId, stepId.toString());

    return {
      productId: currentProductId,
      taskCache,
      logger,
      stepStatus,
      async runStep(step) {
        const stepHandler = steps[step];
        if (!stepHandler) {
          throw new Error(`未找到步骤 ${step} 的处理器`);
        }
        await stepHandler(this);
      }
    };
  };

  // 步骤前置钩子
  const beforeStep = async (stepId) => {
    console.log(`\n--- [Step ${stepId}] 开始 ---`);
  };

  // 步骤后置钩子
  const afterStep = async (stepId, status, error) => {
    // 动态解析 productId
    const currentProductId = resolveProductId();

    // 更新状态
    stepStatus[stepId] = status;
    updateStepStatus(currentProductId, stepId, status);

    if (status === 'done') {
      console.log(`✅ [Step ${stepId}] 完成`);

      // Step3（登录验证）完成后，自动调用素材库上传
      if (stepId === 3) {
        console.log('\n--- [Step 3.5 - 素材库上传] 开始 ---');
        try {
          const uploadResult = await uploadImages(currentProductId);

          if (uploadResult.success) {
            console.log(`✅ [Step 3.5 - 素材库上传] 完成 - ${uploadResult.message}`);
            if (options.verbose) {
              console.log(`   上传文件数: ${uploadResult.uploadedFiles}`);
            }
          } else {
            console.log(`⚠️  [Step 3.5 - 素材库上传] 失败: ${uploadResult.message}`);
            console.log('   继续执行后续步骤...');
          }
        } catch (uploadError) {
          console.error(`❌ [Step 3.5 - 素材库上传] 异常: ${uploadError.message}`);
          console.log('   继续执行后续步骤...');
        }
      }
    } else {
      console.error(`❌ [Step ${stepId}] 失败: ${error?.message}`);
    }

    // 保存缓存
    const currentCache = loadTaskCache(currentProductId);
    currentCache.stepStatus = stepStatus;
    saveTaskCache(currentProductId, currentCache);
  };

  // 阶段定义
  const PHASE_A_END = 3;   // 阶段 A: Step 0-3 (取单、下载、翻译、登录)
  const PHASE_B_START = 4; // 阶段 B: Step 4-12 (打开发布页到提交成功)
  const PHASE_B_END = 12;  // 阶段 B 结束于提交商品

  // 执行单个步骤的辅助函数
  const executeStep = async (stepId) => {
    await beforeStep(stepId);

    const ctx = createStepContext(stepId);
    // 合并共享上下文，保留之前步骤设置的属性
    Object.assign(ctx, sharedContext);
    await ctx.runStep(stepId);
    // 更新共享上下文，保存当前步骤设置的属性
    Object.assign(sharedContext, { page: ctx.page, page1: ctx.page1, storagePath: ctx.storagePath });

    // Step0 执行完成后，提取真实的 productId
    if (stepId === 0 && ctx.productId && ctx.productId !== tempProductId) {
      sharedContext.productId = ctx.productId;
      console.log(`\n✅ 自动取单成功 - ProductID: ${ctx.productId}`);
    }

    await afterStep(stepId, 'done');
  };

  // 阶段执行函数（带重试）
  const runPhase = async (phaseName, phaseSteps, maxRetries = 1) => {
    if (phaseSteps.length === 0) return;

    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        // 如果是重试，打印提示
        if (retryCount > 0) {
          console.log(`\n🔄 正在重新执行阶段 ${phaseName}（第 ${retryCount} 次重试）`);
          console.log(`   重试步骤: ${phaseSteps.join(', ')}`);
        }

        // 执行阶段内所有步骤
        for (const stepId of phaseSteps) {
          await executeStep(stepId);
        }

        // 成功完成，退出重试循环
        return;
      } catch (error) {
        const failedStep = phaseSteps.find(s => stepStatus[s] === 'failed') || phaseSteps[phaseSteps.length - 1];
        await afterStep(failedStep, 'failed', error);

        // 🔒 检查防重试标志：如果商品已提交成功，不再重试阶段B
        if (sharedContext.disablePhaseBRetry && phaseName === 'B') {
          console.log(`\n🔒 商品已提交成功，阻止阶段B重试，避免重复提交`);
          console.log(`   后续步骤 ${failedStep} 出错不影响提交结果`);
          return; // 直接返回，不抛错，不重试
        }

        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`\n⚠️  阶段 ${phaseName} 执行失败（步骤 ${failedStep}），准备重试...`);

          // 重置阶段内所有步骤状态为 pending
          for (const stepId of phaseSteps) {
            stepStatus[stepId] = 'pending';
          }
        } else {
          console.error(`\n💥 阶段 ${phaseName} 重试 ${maxRetries} 次后仍然失败，终止流程`);
          throw error;
        }
      }
    }
  };

  // 根据 stepsToRun 划分阶段
  const phaseASteps = stepsToRun.filter(s => s <= PHASE_A_END);
  const phaseBSteps = stepsToRun.filter(s => s >= PHASE_B_START && s <= PHASE_B_END);
  const finalSteps = stepsToRun.filter(s => s > PHASE_B_END); // 日志通知

  // 执行阶段 A（如果有步骤在该阶段）
  if (phaseASteps.length > 0) {
    console.log(`\n📦 阶段 A: 准备工作 (步骤 ${phaseASteps.join(', ')})`);
    try {
      await runPhase('A', phaseASteps, 1);
    } catch (error) {
      console.error(`\n💥 阶段 A 执行失败，终止流程`);
      process.exit(1);
    }
  }

  // 执行阶段 B（如果有步骤在该阶段）
  if (phaseBSteps.length > 0) {
    console.log(`\n📦 阶段 B: 发布流程 (步骤 ${phaseBSteps.join(', ')})`);
    try {
      await runPhase('B', phaseBSteps, 1);
    } catch (error) {
      console.error(`\n💥 阶段 B 执行失败，终止流程`);
      process.exit(1);
    }
  }

  // 执行最终步骤（日志通知，不重试）
  if (finalSteps.length > 0) {
    console.log(`\n📦 最终步骤: 日志汇总 (步骤 ${finalSteps.join(', ')})`);
    for (const stepId of finalSteps) {
      try {
        await executeStep(stepId);
      } catch (error) {
        await afterStep(stepId, 'failed', error);
        console.error(`\n💥 步骤 ${stepId} 执行失败，终止流程`);
        process.exit(1);
      }
    }
  }

  console.log('\n🎉 所有步骤执行完成！');
  console.log('\n📊 执行结果:');
  for (const stepId of stepsToRun) {
    const status = stepStatus[stepId];
    const statusIcon = status === 'done' ? '✅' : status === 'failed' ? '❌' : '⏸️';
    console.log(`  ${statusIcon} Step ${stepId}: ${status}`);
  }

  // 在开发模式下，保持浏览器窗口打开
  if (process.env.NODE_ENV === 'development') {
    console.log('\n📌 开发模式：保持浏览器窗口打开，按 Ctrl+C 退出');
    // 不退出，让进程继续运行以保持浏览器
  } else {
    // Production模式下，处理完成后退出，让批量脚本继续下一个商品
    process.exit(0);
  }
}

// 解析命令行参数并运行
program.parse();

const options = program.opts();

// 运行流程
runSteps(options).catch((error) => {
  console.error('\n💥 执行失败:', error);
  // 在开发模式下，不立即退出以保持浏览器窗口
  if (process.env.NODE_ENV === 'development') {
    console.log('\n📌 开发模式：保持浏览器窗口打开，按 Ctrl+C 退出');
    // 不调用 process.exit()，让进程继续运行
  } else {
    process.exit(1);
  }
});
