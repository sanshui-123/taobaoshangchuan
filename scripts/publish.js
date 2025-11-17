const path = require('path');
const { validateConfig, TAOBAO_CONFIG, FEISHU_CONFIG, printConfig } = require('./config');
const { Command } = require('commander');
const { steps } = require('./steps');
const { createStepLogger } = require('./utils/logger');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('./utils/cache');
const { uploadImages } = require('./tools/upload-material-folder');

// 步骤名称映射
const stepNames = [
  '任务初始化',
  '下载图片',
  '翻译内容',
  '登录验证',
  '打开发布页',
  '上传主图',
  '选择品牌',
  '填写货号性别',
  '填写颜色',
  '填写尺码',
  '填写价格库存',
  '裁剪图片',
  '填写详情',
  '提交商品',
  '日志通知'
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
    if (isNaN(stepId) || stepId < 0 || stepId > 14) {
      throw new Error(`无效的步骤ID: ${value}`);
    }
    return previous ? [...previous, stepId] : [stepId];
  })
  .option('--from <number>', '起始步骤（包含）', (value) => {
    const stepId = parseInt(value);
    if (isNaN(stepId) || stepId < 0 || stepId > 14) {
      throw new Error(`无效的起始步骤: ${value}`);
    }
    return stepId;
  })
  .option('--to <number>', '结束步骤（包含）', (value) => {
    const stepId = parseInt(value);
    if (isNaN(stepId) || stepId < 0 || stepId > 14) {
      throw new Error(`无效的结束步骤: ${value}`);
    }
    return stepId;
  })
  .option('--dry-run', '试运行模式，只打印要执行的步骤')
  .option('--verbose', '详细日志输出')
  .option('--screenshot', '每个步骤完成后自动截图');

async function runSteps(options) {
  const { product: productId, batch: batchIds } = options;

  // 确定要执行的步骤范围
  let stepsToRun = [];
  if (options.step && options.step.length > 0) {
    stepsToRun = options.step;
  } else if (options.from !== undefined && options.to !== undefined) {
    for (let i = options.from; i <= options.to; i++) {
      stepsToRun.push(i);
    }
  } else {
    for (let i = 0; i <= 14; i++) {
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
  const stepStatus = {
    0: taskCache.stepStatus[0] || 'pending',
    1: taskCache.stepStatus[1] || 'pending',
    2: taskCache.stepStatus[2] || 'pending',
    3: taskCache.stepStatus[3] || 'pending',
    4: taskCache.stepStatus[4] || 'pending',
    5: taskCache.stepStatus[5] || 'pending',
    6: taskCache.stepStatus[6] || 'pending',
    7: taskCache.stepStatus[7] || 'pending',
    8: taskCache.stepStatus[8] || 'pending',
    9: taskCache.stepStatus[9] || 'pending',
    10: taskCache.stepStatus[10] || 'pending',
    11: taskCache.stepStatus[11] || 'pending',
    12: taskCache.stepStatus[12] || 'pending',
    13: taskCache.stepStatus[13] || 'pending',
    14: taskCache.stepStatus[14] || 'pending'
  };

  // 确定要执行的步骤（已在前面声明）
  if (options.step && options.step.length > 0) {
    // 指定了特定步骤
    stepsToRun = options.step;
  } else if (options.from !== undefined && options.to !== undefined) {
    // 指定了范围
    for (let i = options.from; i <= options.to; i++) {
      stepsToRun.push(i);
    }
  } else {
    // 执行所有步骤
    for (let i = 0; i <= 14; i++) {
      stepsToRun.push(i);
    }
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
    stepStatus
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

  // 执行步骤
  for (const stepId of stepsToRun) {
    try {
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
    } catch (error) {
      await afterStep(stepId, 'failed', error);
      console.error(`\n💥 步骤 ${stepId} 执行失败，终止流程`);
      process.exit(1);
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