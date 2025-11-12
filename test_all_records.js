require('dotenv').config({ path: 'tb.env' });
const { feishuClient } = require('./scripts/feishu/client');

// 创建新的客户端实例
const client = new feishuClient.constructor(
  process.env.FEISHU_APP_ID,
  process.env.FEISHU_APP_SECRET,
  process.env.FEISHU_BITTABLE_TOKEN,
  process.env.FEISHU_TABLE_ID
);

(async () => {
  try {
    console.log('获取所有记录（无过滤）...');

    // 直接调用getRecords，不传过滤参数
    const response = await client.getRecords(1000, null);

    // 从response中获取records
    const records = response.records || response.items || [];
    console.log('记录总数:', records.length);

    // 查找C25117160
    const targetRecord = records.find(r => {
      const productId = r.fields['商品ID'];
      if (Array.isArray(productId)) {
        return productId.includes('C25117160');
      }
      return productId === 'C25117160';
    });

    if (targetRecord) {
      console.log('\n✅ 找到记录:');
      console.log('- Record ID:', targetRecord.record_id);
      console.log('- 商品ID:', targetRecord.fields['商品ID']);
      console.log('- 状态:', targetRecord.fields['上传状态'] || '空');

      // 如果状态为空，测试更新
      const status = targetRecord.fields['上传状态'];
      if (!status || status === '') {
        console.log('\n状态为空，测试更新...');
        await client.updateRecord(targetRecord.record_id, {
          '上传状态': '待检测'
        });
        console.log('✅ 更新成功');
      }
    } else {
      console.log('\n❌ 未找到C25117160');

      // 显示前3条记录的结构
      console.log('\n前3条记录示例:');
      records.slice(0, 3).forEach((record, i) => {
        console.log(`\n记录 ${i + 1}:`);
        console.log('- record_id:', record.record_id);
        console.log('- fields:', Object.keys(record.fields));
        if (record.fields['商品ID']) {
          console.log('- 商品ID:', record.fields['商品ID']);
        }
      });
    }
  } catch (error) {
    console.error('错误:', error.message);
    if (error.stack) {
      console.error('\n堆栈:', error.stack);
    }
  }
})();