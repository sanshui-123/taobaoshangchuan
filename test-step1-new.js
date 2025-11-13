const { step1 } = require('./scripts/steps/step1-download-images');
const { logger } = require('./scripts/utils/logger');

// 测试新的图片下载逻辑
async function testStep1() {
  console.log('测试新的Step1图片下载逻辑\n');

  // 模拟上下文
  const ctx = {
    productId: 'C25117160', // 使用一个现有的商品ID进行测试
    logger: logger
  };

  try {
    await step1(ctx);
    console.log('\n测试完成！');
  } catch (error) {
    console.error('\n测试失败:', error.message);
  }
}

testStep1();