/**
 * 测试状态流脚本
 * 模拟空状态记录的处理流程
 */
require('dotenv').config({ path: 'tb.env' });
const { feishuClient } = require('./scripts/feishu/client');

async function testStatusFlow() {
  console.log('\n=== 测试状态流 ===\n');

  try {
    // 测试获取记录
    console.log('1. 获取所有待处理记录...');
    const records = await feishuClient.getAllRecords();

    console.log(`找到 ${records.length} 条记录`);

    // 查找空状态的记录
    const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
    const emptyRecords = records.filter(record => {
      const status = record.fields[statusField];
      return !status || status === '';
    });

    console.log(`其中 ${emptyRecords.length} 条为空状态`);

    if (emptyRecords.length > 0) {
      console.log('\n空状态记录:');
      emptyRecords.forEach((record, index) => {
        const productId = record.fields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'];
        console.log(`${index + 1}. Record ID: ${record.record_id}, 商品ID: ${productId}`);
      });

      // 如果找到TEST_CHECK01，模拟更新状态
      const testRecord = emptyRecords.find(record => {
        const productId = record.fields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'];
        return productId === 'TEST_CHECK01';
      });

      if (testRecord) {
        console.log('\n找到TEST_CHECK01，测试状态更新...');
        const checkingValue = process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测';

        await feishuClient.updateRecord(testRecord.record_id, {
          [statusField]: checkingValue
        });

        console.log(`✅ 已更新为"${checkingValue}"`);

        // 再次获取记录验证
        setTimeout(async () => {
          const updatedRecords = await feishuClient.getAllRecords();
          const updatedRecord = updatedRecords.find(r => r.record_id === testRecord.record_id);
          const newStatus = updatedRecord.fields[statusField];
          console.log(`验证: 当前状态为"${newStatus}"`);
        }, 2000);
      } else {
        console.log('\n⚠️ 未找到TEST_CHECK01记录');
        console.log('请在飞书中创建商品ID为TEST_CHECK01的记录，并保持上传状态为空');
      }
    } else {
      console.log('\n没有找到空状态记录');
      console.log('请检查:');
      console.log('1. 飞书表格中是否有空状态的记录');
      console.log('2. FEISHU_TARGET_STATUS配置是否正确:', process.env.FEISHU_TARGET_STATUS);
    }

  } catch (error) {
    console.error('测试失败:', error.message);
    console.error('\n请检查:');
    console.log('1. tb.env中的飞书凭证是否正确');
    console.log('2. 网络连接是否正常');
  }
}

testStatusFlow();