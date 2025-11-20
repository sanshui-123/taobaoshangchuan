#!/usr/bin/env node
/**
 * 测试脚本：验证库存状态检查功能
 * 查询飞书中"库存状态=都缺货"的商品
 */

const { feishuClient } = require('./scripts/feishu/client');
require('dotenv').config({ path: './tb.env' });

(async () => {
  try {
    console.log('🔍 开始测试库存状态检查功能...\n');

    // 获取所有记录
    const allRecords = await feishuClient.getAllRecords();
    console.log(`📊 从飞书获取到 ${allRecords.length} 条记录（状态为"待检测"或"待上传"）\n`);

    // 筛选出库存状态为"都缺货"的记录
    const stockStatusField = process.env.FEISHU_STOCK_STATUS_FIELD || '库存状态';
    const outOfStockValue = process.env.FEISHU_OUT_OF_STOCK_VALUE || '都缺货';

    const outOfStockRecords = allRecords.filter(r => {
      const stockStatus = r.fields[stockStatusField];
      return stockStatus === outOfStockValue;
    });

    console.log(`📦 找到 ${outOfStockRecords.length} 条"${outOfStockValue}"的商品：\n`);

    if (outOfStockRecords.length > 0) {
      outOfStockRecords.forEach((record, index) => {
        const productId = record.fields['商品ID'];
        const brand = record.fields['品牌名'];
        const category = record.fields['衣服分类'];
        const status = record.fields['上传状态'];

        console.log(`${index + 1}. 商品ID: ${productId}`);
        console.log(`   品牌: ${brand}`);
        console.log(`   分类: ${category}`);
        console.log(`   上传状态: ${status}`);
        console.log(`   库存状态: ${outOfStockValue}`);
        console.log('');
      });

      console.log('💡 提示：这些商品在 Step0 处理时会自动标记为"缺货无需上传"并跳过上传流程。');
    } else {
      console.log('✅ 当前没有"都缺货"的待处理商品。');
    }

    console.log('\n✅ 测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
})();
