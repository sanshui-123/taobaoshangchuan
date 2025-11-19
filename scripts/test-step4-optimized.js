/**
 * 测试 Step 4 优化版性能
 */
const { step4: step4Original } = require('./steps/step4-open-page');
const { step4: step4Optimized } = require('./steps/step4-open-page-optimized');
const { createStepLogger } = require('./utils/logger');
const { chromium } = require('playwright');

async function testStep4Performance() {
  const logger = createStepLogger('Step 4 性能对比');

  logger.info('\n' + '='.repeat(60));
  logger.info('🚀 开始 Step 4 性能对比测试');
  logger.info('='.repeat(60) + '\n');

  try {
    // 连接到已有的 Chrome
    logger.info('连接 Chrome 浏览器...');
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');

    const contexts = browser.contexts();
    const context = contexts.length > 0 ? contexts[0] : await browser.newContext();

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    logger.success('✅ 浏览器连接成功');

    // 创建测试上下文
    const ctx = {
      browser,
      context,
      page1: page,
      productId: 'C25233183',
      logger
    };

    // 测试优化版
    logger.info('\n' + '📊'.repeat(20));
    logger.info('测试优化版 Step 4');
    logger.info('📊'.repeat(20) + '\n');

    const startTime = Date.now();

    try {
      await step4Optimized(ctx);
      const duration = Date.now() - startTime;

      logger.success(`✅ Step 4 优化版执行成功！`);
      logger.info(`⏱️  执行时间: ${(duration/1000).toFixed(2)}秒`);

      // 显示优化效果
      logger.info('\n' + '='.repeat(60));
      logger.info('📈 性能优化分析');
      logger.info('='.repeat(60));

      // 原版平均耗时（根据之前的测试数据）
      const originalTime = 41.52; // 秒
      const optimizedTime = duration / 1000;
      const improvement = ((originalTime - optimizedTime) / originalTime * 100).toFixed(1);

      logger.info(`原版耗时: ~${originalTime}秒`);
      logger.info(`优化版耗时: ${optimizedTime.toFixed(2)}秒`);
      logger.info(`性能提升: ${improvement}%`);

      if (improvement > 30) {
        logger.success(`🎉 显著性能提升！减少了 ${(originalTime - optimizedTime).toFixed(1)}秒`);
      } else if (improvement > 10) {
        logger.success(`✅ 良好的性能提升`);
      } else {
        logger.info(`📊 轻微性能提升`);
      }

    } catch (error) {
      logger.error(`Step 4 优化版执行失败: ${error.message}`);
      console.error(error);
    }

    logger.info('\n保持浏览器连接，可继续使用');

  } catch (error) {
    logger.error(`测试失败: ${error.message}`);
    console.error(error);
  }
}

// 运行测试
if (require.main === module) {
  console.log(`
╔════════════════════════════════════════════════╗
║         Step 4 性能优化测试 v1.0               ║
╠════════════════════════════════════════════════╣
║  优化重点:                                     ║
║    ✨ 3秒等待 → 500ms                         ║
║    ✨ 2秒等待 → 500ms                         ║
║    ✨ 1秒等待 → 100-200ms                     ║
║    ✨ networkidle → 条件等待                  ║
║                                                ║
║  预期提升: 50-70%                              ║
╚════════════════════════════════════════════════╝
  `);

  testStep4Performance().catch(console.error);
}

module.exports = { testStep4Performance };