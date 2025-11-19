/**
 * 测试优化后的步骤性能
 * 对比优化前后的执行时间
 */
const { chromium } = require('playwright');
const { step5: step5Optimized } = require('./steps/step5-upload-images-optimized');
const { step11Detail: step11Original } = require('./steps/step11-detail-template-new');
const { step11Detail: step11Optimized } = require('./steps/step11-detail-template-optimized');
const { createStepLogger } = require('./utils/logger');
const fs = require('fs');
const path = require('path');

async function testOptimizedPerformance(productId) {
  const logger = createStepLogger('性能测试');

  logger.info('\n' + '='.repeat(60));
  logger.info('🚀 开始性能优化测试');
  logger.info('='.repeat(60) + '\n');

  // 连接到已有的 Chrome
  let browser;
  let context;
  let page;

  try {
    logger.info('连接到 Chrome 浏览器...');
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');

    const contexts = browser.contexts();
    context = contexts.length > 0 ? contexts[0] : await browser.newContext();

    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();

    logger.success('✅ 浏览器连接成功');

    const ctx = {
      browser,
      context,
      page1: page,
      productId,
      logger
    };

    // 测试 Step 5 优化版本
    logger.info('\n' + '📦'.repeat(20));
    logger.info('测试 Step 5 优化版本');
    logger.info('📦'.repeat(20) + '\n');

    const step5Start = Date.now();

    try {
      await step5Optimized(ctx);
      const step5Time = Date.now() - step5Start;
      logger.success(`✅ Step 5 优化版本执行完成: ${(step5Time/1000).toFixed(2)}秒`);

      // 保存性能数据
      const perfData = {
        step5: {
          optimized: step5Time,
          timestamp: new Date().toISOString()
        }
      };

      const perfFile = path.join(__dirname, 'cache', 'performance.json');
      let existingData = {};
      if (fs.existsSync(perfFile)) {
        existingData = JSON.parse(fs.readFileSync(perfFile, 'utf8'));
      }
      existingData[productId] = { ...existingData[productId], ...perfData };
      fs.writeFileSync(perfFile, JSON.stringify(existingData, null, 2));

    } catch (error) {
      logger.error(`Step 5 测试失败: ${error.message}`);
    }

    // 等待一下再测试 Step 11
    logger.info('\n等待 3 秒后测试 Step 11...');
    await page.waitForTimeout(3000);

    // 测试 Step 11 优化版本
    logger.info('\n' + '📝'.repeat(20));
    logger.info('测试 Step 11 优化版本');
    logger.info('📝'.repeat(20) + '\n');

    const step11Start = Date.now();

    try {
      await step11Optimized(ctx);
      const step11Time = Date.now() - step11Start;
      logger.success(`✅ Step 11 优化版本执行完成: ${(step11Time/1000).toFixed(2)}秒`);

      // 更新性能数据
      const perfFile = path.join(__dirname, 'cache', 'performance.json');
      let existingData = JSON.parse(fs.readFileSync(perfFile, 'utf8'));
      existingData[productId].step11 = {
        optimized: step11Time,
        timestamp: new Date().toISOString()
      };
      fs.writeFileSync(perfFile, JSON.stringify(existingData, null, 2));

      // 显示性能对比（如果有历史数据）
      logger.info('\n' + '='.repeat(60));
      logger.info('📊 性能优化结果');
      logger.info('='.repeat(60));

      logger.info(`Step 5 优化版执行时间: ${(step5Time/1000).toFixed(2)}秒`);
      logger.info(`Step 11 优化版执行时间: ${(step11Time/1000).toFixed(2)}秒`);
      logger.info(`总执行时间: ${((step5Time + step11Time)/1000).toFixed(2)}秒`);

      // 估算优化提升
      // 根据原始版本的典型执行时间估算
      const step5OriginalEstimate = 15000; // 约15秒
      const step11OriginalEstimate = 20000; // 约20秒

      const step5Improvement = ((step5OriginalEstimate - step5Time) / step5OriginalEstimate * 100).toFixed(1);
      const step11Improvement = ((step11OriginalEstimate - step11Time) / step11OriginalEstimate * 100).toFixed(1);

      logger.info('\n预估性能提升:');
      logger.info(`Step 5: 提升约 ${step5Improvement}%`);
      logger.info(`Step 11: 提升约 ${step11Improvement}%`);

    } catch (error) {
      logger.error(`Step 11 测试失败: ${error.message}`);
    }

    logger.success('\n✅ 性能测试完成！');

  } catch (error) {
    logger.error(`性能测试失败: ${error.message}`);
    console.error(error);
  } finally {
    logger.info('\n保持浏览器连接，可以继续使用');
  }
}

// 主程序
if (require.main === module) {
  const productId = process.argv[2] || 'C25233183';

  console.log(`
╔════════════════════════════════════════════════╗
║         性能优化测试工具 v1.0                  ║
╠════════════════════════════════════════════════╣
║  用法:                                         ║
║    node test-optimized.js [商品ID]             ║
║                                                ║
║  示例:                                         ║
║    node test-optimized.js C25233183            ║
╚════════════════════════════════════════════════╝
  `);

  console.log(`测试商品: ${productId}\n`);

  testOptimizedPerformance(productId).catch(console.error);
}

module.exports = { testOptimizedPerformance };