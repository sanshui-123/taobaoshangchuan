/**
 * 批量更新飞书中指定商品的状态为"待检测"
 */
require('dotenv').config({ path: './tb.env' });
const { feishuClient } = require('./feishu/client');

async function batchUpdateStatus() {
  // 指定的9个商品ID
  const productIds = [
    'C25217104',
    'C25216104',
    'C25217107',
    'C25217106',
    'C25216180',
    'C25233182',
    'C25233183',
    'C25226181',
    'C25217182'
  ];

  console.log(`🔍 开始更新 ${productIds.length} 个商品的状态为"待检测"...`);
  console.log(`商品列表: ${productIds.join(', ')}`);

  try {
    // 获取所有记录
    console.log('\n📋 获取飞书表格数据...');
    const allRecords = await feishuClient.getAllRecords();
    console.log(`✅ 获取到 ${allRecords.length} 条记录`);

    // 查找目标记录
    const targetRecords = [];
    const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
    const checkingValue = process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测';

    for (const productId of productIds) {
      const record = allRecords.find(r => {
        const pid = r.fields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'];
        if (Array.isArray(pid)) {
          return pid.includes(productId);
        } else {
          return pid === productId;
        }
      });

      if (record) {
        targetRecords.push({
          productId,
          record_id: record.record_id,
          currentStatus: record.fields[statusField]
        });
        console.log(`✅ 找到商品 ${productId}，当前状态: ${record.fields[statusField] || '空'}`);
      } else {
        console.log(`❌ 未找到商品 ${productId}`);
      }
    }

    if (targetRecords.length === 0) {
      console.log('\n⚠️ 没有找到任何目标记录');
      return;
    }

    console.log(`\n📝 准备更新 ${targetRecords.length} 条记录为"${checkingValue}"状态...`);

    // 批量更新
    const updateRecords = targetRecords.map(r => ({
      record_id: r.record_id,
      fields: {
        [statusField]: checkingValue
      }
    }));

    const response = await feishuClient.batchUpdateRecords(updateRecords);

    if (response && response.code === 0) {
      console.log(`\n✅ 成功更新 ${targetRecords.length} 条记录为"${checkingValue}"状态`);
      console.log('\n更新详情:');
      targetRecords.forEach(r => {
        console.log(`  - ${r.productId}: ${r.currentStatus || '空'} → ${checkingValue}`);
      });
    } else {
      console.log('\n❌ 批量更新失败');
      console.error('响应:', response);
    }

  } catch (error) {
    console.error('\n❌ 更新失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

batchUpdateStatus();