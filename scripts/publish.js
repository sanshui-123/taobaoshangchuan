const path = require('path');
const { validateConfig, TAOBAO_CONFIG, FEISHU_CONFIG, printConfig } = require('./config');
const { Command } = require('commander');
const { steps } = require('./steps');
const { createStepLogger } = require('./utils/logger');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('./utils/cache');

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
  .requiredOption('-p, --product <id>', '商品ID')
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
  const { product: productId } = options;

  // 验证配置
  if (!validateConfig()) {
    process.exit(1);
  }

  console.log(`\n🚀 开始执行商品发布流程 - ProductID: ${productId}`);
  console.log('='.repeat(60));

  // 详细模式下显示配置信息
  if (options.verbose) {
    printConfig();
  }

  // 加载或创建任务缓存
  const taskCache = loadTaskCache(productId);

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

  // 确定要执行的步骤
  let stepsToRun = [];
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

  // 创建步骤上下文
  const createStepContext = (stepId) => {
    const logger = createStepLogger(productId, stepId.toString());

    return {
      productId,
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
    // 更新状态
    stepStatus[stepId] = status;
    updateStepStatus(productId, stepId, status);

    if (status === 'done') {
      console.log(`✅ [Step ${stepId}] 完成`);
    } else {
      console.error(`❌ [Step ${stepId}] 失败: ${error?.message}`);
    }

    // 保存缓存
    const currentCache = loadTaskCache(productId);
    currentCache.stepStatus = stepStatus;
    saveTaskCache(productId, currentCache);
  };

  // 执行步骤
  for (const stepId of stepsToRun) {
    try {
      await beforeStep(stepId);

      const ctx = createStepContext(stepId);
      await ctx.runStep(stepId);

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