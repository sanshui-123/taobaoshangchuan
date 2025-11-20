/**
 * 批量将飞书表格中所有"待上传"状态的记录改为"待检测"
 */
require('dotenv').config({ path: './tb.env' });
const { feishuClient } = require('./feishu/client');

async function changePendingToChecking() {
  console.log('🔍 开始批量修改状态：待上传 → 待检测');
  console.log('='.repeat(60));

  try {
    // 获取所有记录
    console.log('\n📋 正在获取飞书表格数据...');
    const allRecordsResponse = await feishuClient.getRecords(1000, null);
    const allRecords = allRecordsResponse.records || allRecordsResponse.items || [];
    console.log(`✅ 获取到 ${allRecords.length} 条记录`);

    // 字段配置
    const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
    const pendingValue = process.env.FEISHU_STATUS_PENDING_VALUE || '待上传';
    const checkingValue = process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测';
    const productIdField = process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID';

    console.log(`\n🔍 筛选状态为"${pendingValue}"的记录...`);

    // 筛选出状态为"待上传"的记录
    const pendingRecords = allRecords.filter(record => {
      const status = record.fields[statusField];
      return status === pendingValue;
    });

    console.log(`✅ 找到 ${pendingRecords.length} 条"${pendingValue}"状态的记录`);

    if (pendingRecords.length === 0) {
      console.log('\n⚠️  没有需要更新的记录');
      return;
    }

    // 显示将要更新的商品列表
    console.log('\n📝 将要更新的商品:');
    pendingRecords.forEach((record, index) => {
      const productId = record.fields[productIdField];
      const brandField = process.env.FEISHU_BRAND_FIELD || '品牌名';
      const brand = record.fields[brandField] || '未知';
      console.log(`  ${index + 1}. ${productId} (${brand})`);
    });

    // 确认更新
    console.log(`\n⚠️  即将更新 ${pendingRecords.length} 条记录：${pendingValue} → ${checkingValue}`);
    console.log('开始更新...\n');

    // 批量更新
    const updateRecords = pendingRecords.map(record => ({
      record_id: record.record_id,
      fields: {
        [statusField]: checkingValue
      }
    }));

    const response = await feishuClient.batchUpdateRecords(updateRecords);

    if (response && (response.code === 0 || response.records)) {
      console.log(`\n✅ 成功更新 ${pendingRecords.length} 条记录`);
      console.log('='.repeat(60));
      console.log('\n📊 更新统计:');
      console.log(`  原状态: ${pendingValue}`);
      console.log(`  新状态: ${checkingValue}`);
      console.log(`  更新数量: ${pendingRecords.length} 条`);
      console.log('\n🎉 批量更新完成！');
    } else {
      console.log('\n❌ 批量更新失败');
      console.error('响应:', response);
    }

  } catch (error) {
    console.error('\n❌ 更新失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
    process.exit(1);
  }
}

changePendingToChecking();
