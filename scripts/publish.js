const path = require('path');
const { validateConfig, TAOBAO_CONFIG, FEISHU_CONFIG, printConfig } = require('./config');
const { Command } = require('commander');
const { steps } = require('./steps');
const { createStepLogger } = require('./utils/logger');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('./utils/cache');
const { feishuClient } = require('./feishu/client');
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
  .option('--gender <name>', '只处理指定性别')
  .option('--no-material-upload', '跳过 Step3.5 素材库上传（用于复跑后续步骤）')
  .option('--force-step5', '强制重跑 Step5 主图上传（即使缓存已 done）')
  .option('--force-partial', '即便素材上传失败也强制回写“前三步已更新”')
  .option('--allow-done', '允许拉取已完成/失败/空状态记录（默认会过滤）');

async function runSteps(options) {
  const { product: productId, batch: batchIds } = options;

  // 🛡️ 保护：--product 只允许单个商品ID
  // 误把一串ID（含空格/换行）传入会导致：飞书查不到记录、缓存/日志目录异常（甚至 ENAMETOOLONG）
  if (productId && /[\s,]/.test(String(productId).trim())) {
    console.error('❌ 错误：--product 只支持单个商品ID。检测到你传入了多个ID（包含空格/换行/逗号）。');
    console.error('   解决方式：请逐个执行，或使用 zsh 数组循环。示例：');
    console.error('   IDS=(2625260903 2624272137 ...)');
    console.error('   for id in $IDS; do TAOBAO_STORE=male NODE_ENV=production node scripts/publish.js --product=$id --to=13 --verbose; done');
    process.exit(1);
  }

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

  // 日志目录提示（无论自动取单还是手动）
  if (productId) {
    console.log(`🗂️  日志目录: logs/${productId}`);
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

      // Step3（登录验证）完成后，自动调用素材库上传（仅成功一次）
      if (stepId === 3) {
        const currentCache = loadTaskCache(resolveProductId());
        if (stepStatus[stepId] === 'skipped' || options.noMaterialUpload || sharedContext.skipMaterialUpload || currentCache.skipMaterialUpload) {
          console.log('🚫 已配置跳过素材库上传，忽略 Step3.5');
          return;
        }
        console.log('\n--- [Step 3.5 - 素材库上传] 开始 ---');

        // 如果已成功上传过素材，跳过重复上传
        if (currentCache.materialUploadDone) {
          console.log('🚫 已检测到素材库上传成功记录，跳过重复上传');
          return;
        }

        let uploadResult = null;
        try {
          uploadResult = await uploadImages(currentProductId);

          if (uploadResult.success) {
            console.log(`✅ [Step 3.5 - 素材库上传] 完成 - ${uploadResult.message}`);
            if (options.verbose) {
              console.log(`   上传文件数: ${uploadResult.uploadedFiles}`);
            }

            // 标记缓存，避免后续重跑重复上传
            currentCache.materialUploadDone = true;
            saveTaskCache(currentProductId, currentCache);
          } else {
            console.log(`⚠️  [Step 3.5 - 素材库上传] 失败: ${uploadResult.message}`);
            console.log('   继续执行后续步骤...');
          }
        } catch (uploadError) {
          console.error(`❌ [Step 3.5 - 素材库上传] 异常: ${uploadError.message}`);
          console.log('   继续执行后续步骤...');
        }

        // 三步完成后，回写飞书状态为“部分完成”（避免下次重复跑1-3步）
        try {
          const partialValue = process.env.FEISHU_STATUS_PARTIAL_VALUE || '前三步已更新';
          const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
          const shouldMarkPartial = options.forcePartial || (uploadResult && uploadResult.success);
          // 兼容未执行 Step0 的场景：从缓存补足 feishuRecordId
          const cacheForId = loadTaskCache(resolveProductId());
          const recordId = sharedContext.feishuRecordId || cacheForId?.feishuRecordId;

          if (shouldMarkPartial && recordId) {
            await feishuClient.updateRecord(recordId, {
              [statusField]: partialValue
            });
            console.log(`✅ 已回写飞书状态为"${partialValue}"，下次将从Step4开始`);
          } else if (shouldMarkPartial && !recordId) {
            console.log('⚠️ 未找到飞书记录ID，无法回写“前三步已更新”');
          } else if (!shouldMarkPartial) {
            console.log('⏸️  素材上传失败，未回写“前三步已更新”；下次仍会执行前置步骤');
          }
        } catch (err) {
          console.log(`⚠️ 回写飞书部分状态失败: ${err.message}`);
        }
      }

      // Step0 完成后，刷新跳过状态到内存
      if (stepId === 0) {
        const refreshedCache = loadTaskCache(resolveProductId());
        if (refreshedCache && refreshedCache.stepStatus) {
          Object.assign(stepStatus, refreshedCache.stepStatus);
          console.log('🔄 已同步 Step0 更新的步骤状态到内存，用于后续跳过判断');

          // 如果标记了 skipPhaseA，确保 1/2/3 为 skipped 并保存
          if (refreshedCache.skipPhaseA) {
            [1, 2, 3].forEach(s => stepStatus[s] = 'skipped');
            const currentProductId = resolveProductId();
            const cacheToSave = loadTaskCache(currentProductId) || {};
            cacheToSave.stepStatus = { ...cacheToSave.stepStatus, ...stepStatus };
            saveTaskCache(currentProductId, cacheToSave);
            console.log('⏭️  检测到前三步已更新，自动跳过步骤1-3');

            // 从计划中剔除 1/2/3，直接从后续步骤开始
            stepsToRun = stepsToRun.filter(s => stepStatus[s] !== 'skipped');
            console.log(`⏭️  调整执行计划，剩余步骤: ${stepsToRun.join(', ')}`);
          }

          // 如果后续步骤全部为 skipped，则直接终止流程
          const allSkipped = stepsToRun
            .filter(s => s !== 0)
            .every(s => refreshedCache.stepStatus[s] === 'skipped');
          if (allSkipped) {
            console.log('🚫 当前记录状态非待处理，后续步骤全部标记为 skipped，结束流程');
          }
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
    // 如果标记为跳过，直接返回且保持状态
    if (stepStatus[stepId] === 'skipped') {
      console.log(`⏭️  [Step ${stepId}] 已标记为跳过，直接进入下一步`);
      updateStepStatus(resolveProductId(), stepId, 'skipped');
      return;
    }

    await beforeStep(stepId);

    const ctx = createStepContext(stepId);
    // 合并共享上下文，保留之前步骤设置的属性
    Object.assign(ctx, sharedContext);
    await ctx.runStep(stepId);
    // 更新共享上下文，保存当前步骤设置的属性
    Object.assign(sharedContext, {
      page: ctx.page,
      page1: ctx.page1,
      storagePath: ctx.storagePath,
      skipPhaseA: ctx.skipPhaseA,
      skipMaterialUpload: ctx.skipMaterialUpload
    });

    // Step0 执行完成后，提取真实的 productId
    if (stepId === 0 && ctx.productId && ctx.productId !== tempProductId) {
      sharedContext.productId = ctx.productId;
      console.log(`\n✅ 自动取单成功 - ProductID: ${ctx.productId}`);
      console.log(`🗂️  日志目录: logs/${ctx.productId}`);
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
