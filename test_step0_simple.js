require('dotenv').config({ path: 'tb.env' });
const { feishuClient } = require('./scripts/feishu/client');
const { checkProductExists } = require('./scripts/utils/taobao-check');

async function testStep0() {
  console.log('=== 测试 Step0: 任务初始化 ===\n');

  try {
    // 1. 获取记录
    console.log('1. 获取飞书记录...');
    const records = await feishuClient.getAllRecords();
    console.log(`   找到 ${records.length} 条记录`);

    // 查找商品ID C25117160
    const productId = 'C25117160';
    const record = records.find(r => r.fields['商品ID'] === productId);

    if (!record) {
      console.log(`   ❌ 未找到商品ID ${productId}`);
      return;
    }

    const recordId = record.record_id;
    const currentStatus = record.fields['上传状态'] || '';
    console.log(`   找到记录: ${recordId}`);
    console.log(`   当前状态: "${currentStatus}"`);

    // 2. 状态判断
    const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
    const checkingValue = process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测';
    const pendingValue = process.env.FEISHU_STATUS_PENDING_VALUE || '待上传';
    const doneValue = process.env.FEISHU_STATUS_DONE_VALUE || '已上传到淘宝';

    if (!currentStatus || currentStatus === '') {
      // 状态为空，更新为"待检测"并立即查重
      console.log(`\n2. 状态为空，更新为"${checkingValue}"并立即查重...`);

      await feishuClient.updateRecord(recordId, {
        [statusField]: checkingValue
      });
      console.log('   ✅ 状态已更新');

      // 立即执行查重
      console.log('\n3. 执行淘宝查重...');
      const exists = await checkProductExists(productId);

      if (exists) {
        console.log('   ✅ 发现重复商品');
        console.log(`   标题: ${exists.title}`);
        console.log(`   链接: ${exists.url}`);

        // 更新为已上传状态
        await feishuClient.updateRecord(recordId, {
          [statusField]: doneValue,
          '淘宝链接': exists.url
        });
        console.log('   ✅ 状态已更新为"已上传到淘宝"');
      } else {
        console.log('   ❌ 未发现重复商品');

        // 更新为待上传状态
        await feishuClient.updateRecord(recordId, {
          [statusField]: pendingValue
        });
        console.log('   ✅ 状态已更新为"待上传"');
      }

    } else if (currentStatus === checkingValue) {
      console.log(`\n2. 状态为"${checkingValue}"，执行查重...`);

      // 执行查重
      console.log('\n3. 执行淘宝查重...');
      const exists = await checkProductExists(productId);

      if (exists) {
        console.log('   ✅ 发现重复商品');
        console.log(`   标题: ${exists.title}`);
        console.log(`   链接: ${exists.url}`);

        // 更新为已上传状态
        await feishuClient.updateRecord(recordId, {
          [statusField]: doneValue,
          '淘宝链接': exists.url
        });
        console.log('   ✅ 状态已更新为"已上传到淘宝"');
      } else {
        console.log('   ❌ 未发现重复商品');

        // 更新为待上传状态
        await feishuClient.updateRecord(recordId, {
          [statusField]: pendingValue
        });
        console.log('   ✅ 状态已更新为"待上传"');
      }

    } else {
      console.log(`\n2. 状态为"${currentStatus}"，跳过处理`);
    }

    console.log('\n=== 测试完成 ===');

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    if (error.stack) {
      console.error('\n堆栈:', error.stack);
    }
  }
}

testStep0();