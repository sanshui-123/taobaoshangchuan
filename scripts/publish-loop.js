/**
 * 循环发布控制器
 * 实现连续自动发布多个商品的功能
 */
const { chromium } = require('playwright');
const { steps } = require('./steps');
const { createStepLogger } = require('./utils/logger');
const { loadTaskCache, saveTaskCache } = require('./utils/cache');
const fs = require('fs').promises;
const path = require('path');

/**
 * 获取待发布商品列表
 */
async function getProductList(inputFile) {
  try {
    if (inputFile) {
      // 从文件读取商品列表
      const content = await fs.readFile(inputFile, 'utf-8');
      return content.split('\n').filter(id => id.trim());
    }

    // 从命令行参数获取
    const products = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
    if (products.length > 0) {
      return products;
    }

    // 默认测试商品
    return ['C25233183'];
  } catch (error) {
    console.error('读取商品列表失败:', error);
    return [];
  }
}

/**
 * 执行单个商品的发布流程
 */
async function publishSingleProduct(productId, ctx) {
  const logger = ctx.logger;

  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`🚀 开始发布商品: ${productId}`);
  logger.info(`${'='.repeat(60)}\n`);

  try {
    // 执行步骤 4-12
    const stepsToRun = [4, 5, 6, 7, 8, 9, 10, 11, 12];

    for (const stepNum of stepsToRun) {
      logger.info(`\n--- [Step ${stepNum}] 开始 ---`);

      const stepFunc = steps[stepNum];
      if (!stepFunc) {
        logger.error(`步骤 ${stepNum} 未定义`);
        continue;
      }

      try {
        // 更新上下文的商品ID
        ctx.productId = productId;

        // 执行步骤
        await stepFunc(ctx);
        logger.success(`✅ [Step ${stepNum}] 完成`);

        // 更新缓存状态
        const cache = loadTaskCache(productId) || {};
        cache.stepStatus = cache.stepStatus || {};
        cache.stepStatus[stepNum] = 'done';
        saveTaskCache(productId, cache);

      } catch (stepError) {
        logger.error(`❌ [Step ${stepNum}] 失败: ${stepError.message}`);
        throw stepError;
      }
    }

    logger.success(`\n✅ 商品 ${productId} 发布完成！`);
    return true;

  } catch (error) {
    logger.error(`\n❌ 商品 ${productId} 发布失败: ${error.message}`);
    return false;
  }
}

/**
 * 主循环函数
 */
async function runLoop() {
  const logger = createStepLogger('publish-loop', 'main');

  logger.info('\n' + '🔄'.repeat(30));
  logger.info('启动自动循环发布系统');
  logger.info('🔄'.repeat(30) + '\n');

  // 获取商品列表
  const inputFile = process.argv.find(arg => arg.startsWith('--file='))?.split('=')[1];
  const productList = await getProductList(inputFile);

  if (productList.length === 0) {
    logger.error('没有找到待发布的商品');
    return;
  }

  logger.info(`📋 待发布商品列表: ${productList.length} 个`);
  productList.forEach((id, index) => {
    logger.info(`  ${index + 1}. ${id}`);
  });

  // 启动浏览器
  let browser;
  let context;
  let page;

  try {
    // 连接到已有的 Chrome 实例
    logger.info('\n连接 Chrome 浏览器...');
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');

    // 获取默认上下文
    const contexts = browser.contexts();
    context = contexts.length > 0 ? contexts[0] : await browser.newContext();

    // 获取或创建页面
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();

    logger.success('✅ 浏览器连接成功');

    // 创建共享上下文
    const ctx = {
      browser,
      context,
      page1: page,
      logger
    };

    // 统计信息
    let successCount = 0;
    let failCount = 0;
    const startTime = Date.now();

    // 循环发布每个商品
    for (let i = 0; i < productList.length; i++) {
      const productId = productList[i];
      const currentIndex = i + 1;

      logger.info(`\n${'📦'.repeat(20)}`);
      logger.info(`进度: ${currentIndex}/${productList.length}`);
      logger.info(`${'📦'.repeat(20)}\n`);

      // 发布单个商品
      const success = await publishSingleProduct(productId, ctx);

      if (success) {
        successCount++;

        // 检查是否准备好下一个循环
        if (ctx.readyForNextCycle) {
          logger.info('✅ 系统已准备好处理下一个商品');
          ctx.readyForNextCycle = false;
        }

        // 如果不是最后一个，等待几秒再继续
        if (i < productList.length - 1) {
          logger.info('等待5秒后继续下一个商品...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } else {
        failCount++;

        // 失败后询问是否继续
        if (i < productList.length - 1) {
          logger.warn('商品发布失败，10秒后尝试下一个...');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
    }

    // 输出统计结果
    const endTime = Date.now();
    const duration = Math.floor((endTime - startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    logger.info('\n' + '='.repeat(60));
    logger.info('📊 发布统计');
    logger.info('='.repeat(60));
    logger.info(`总商品数: ${productList.length}`);
    logger.info(`✅ 成功: ${successCount}`);
    logger.info(`❌ 失败: ${failCount}`);
    logger.info(`⏱️  用时: ${minutes}分${seconds}秒`);
    logger.info('='.repeat(60));

    if (successCount === productList.length) {
      logger.success('\n🎉 所有商品发布成功！');
    } else if (successCount > 0) {
      logger.warn(`\n⚠️  部分商品发布成功 (${successCount}/${productList.length})`);
    } else {
      logger.error('\n❌ 所有商品发布失败');
    }

  } catch (error) {
    logger.error(`循环发布出错: ${error.message}`);
    console.error(error);
  } finally {
    // 不关闭浏览器，保持连接
    logger.info('\n保持浏览器连接，可以继续使用');
  }
}

// 错误处理
process.on('unhandledRejection', (error) => {
  console.error('未处理的异常:', error);
  process.exit(1);
});

// 运行主循环
if (require.main === module) {
  console.log(`
╔════════════════════════════════════════════════╗
║         淘宝商品自动循环发布系统 v1.0         ║
╠════════════════════════════════════════════════╣
║  用法:                                         ║
║    node publish-loop.js [商品ID列表]           ║
║    node publish-loop.js --file=products.txt   ║
║                                                ║
║  示例:                                         ║
║    node publish-loop.js C001 C002 C003        ║
║    node publish-loop.js --file=list.txt       ║
╚════════════════════════════════════════════════╝
  `);

  runLoop().catch(console.error);
}

module.exports = { runLoop, publishSingleProduct };
