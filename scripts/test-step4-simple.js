#!/usr/bin/env node

/**
 * 简单测试 Step 4 优化版
 */
const { step4 } = require('./steps/step4-open-page-optimized');
const { createStepLogger } = require('./utils/logger');

async function testStep4() {
  const logger = createStepLogger('Step 4 性能测试');

  logger.info('\n' + '='.repeat(60));
  logger.info('🚀 开始测试 Step 4 优化版');
  logger.info('='.repeat(60) + '\n');

  const startTime = Date.now();

  try {
    // 创建上下文
    const ctx = {
      productId: 'C25233183',
      logger
    };

    // 运行 Step 4
    await step4(ctx);

    const duration = Date.now() - startTime;

    logger.info('\n' + '='.repeat(60));
    logger.info('📊 测试结果');
    logger.info('='.repeat(60));
    logger.success(`✅ Step 4 执行成功！`);
    logger.info(`⏱️  执行时间: ${(duration/1000).toFixed(2)}秒`);

    // 对比原版时间
    const originalTime = 41.52;
    const improvement = ((originalTime - duration/1000) / originalTime * 100).toFixed(1);

    logger.info(`📈 原版耗时: ~${originalTime}秒`);
    logger.info(`📈 优化版耗时: ${(duration/1000).toFixed(2)}秒`);
    logger.info(`🚀 性能提升: ${improvement}%`);

    if (improvement > 50) {
      logger.success(`\n🎉 卓越的性能提升！速度提升了 ${improvement}%`);
    } else if (improvement > 30) {
      logger.success(`\n✨ 显著的性能提升！速度提升了 ${improvement}%`);
    } else if (improvement > 10) {
      logger.success(`\n✅ 良好的性能提升！速度提升了 ${improvement}%`);
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`\n❌ Step 4 执行失败: ${error.message}`);
    logger.info(`⏱️  运行时间: ${(duration/1000).toFixed(2)}秒`);
  }
}

// 运行测试
testStep4().catch(console.error);