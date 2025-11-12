require('dotenv').config({ path: 'tb.env' });
const { feishuClient } = require('./scripts/feishu/client');

async function testStep0Final() {
  console.log('=== Step0 最终测试（使用修复后的client） ===\n');

  const productId = 'C25117160';

  try {
    // 1. 获取所有记录
    console.log('1. 获取飞书记录...');
    const records = await feishuClient.getAllRecords();
    console.log(`   总记录数: ${records.length}`);

    // 查找目标记录
    const targetRecord = records.find(r => {
      const pid = r.fields['商品ID'];
      return pid === productId || (Array.isArray(pid) && pid.includes(productId));
    });

    if (!targetRecord) {
      console.log(`❌ 未找到商品ID ${productId}`);
      return;
    }

    const recordId = targetRecord.record_id;
    const currentStatus = targetRecord.fields['上传状态'] || '';
    console.log(`   找到记录: ${recordId}`);
    console.log(`   当前状态: "${currentStatus}"`);

    // 2. 状态判断和处理
    if (currentStatus === '待检测') {
      console.log('\n2. 状态为"待检测"，执行查重...');

      // 执行查重
      const { checkProductExists } = require('./scripts/utils/taobao-check');
      console.log('   开始查重检查...');
      const exists = await checkProductExists(productId);

      if (exists) {
        console.log('\n   ✅ 发现重复商品');
        console.log(`   标题: ${exists.title}`);
        console.log(`   链接: ${exists.url}`);

        // 更新为已上传状态
        console.log('\n3. 更新状态为"已上传到淘宝"...');
        await feishuClient.updateRecord(recordId, {
          '上传状态': '已上传到淘宝',
          '淘宝链接': exists.url
        });
        console.log('   ✅ 状态更新成功');

      } else {
        console.log('\n   ❌ 未发现重复商品');

        // 更新为待上传状态
        console.log('\n3. 更新状态为"待上传"...');
        await feishuClient.updateRecord(recordId, {
          '上传状态': '待上传'
        });
        console.log('   ✅ 状态更新成功');
      }
    } else {
      console.log(`\n2. 当前状态为"${currentStatus}"，跳过查重`);
    }

    // 3. 验证最终结果
    console.log('\n4. 验证更新结果...');
    const updatedRecords = await feishuClient.getAllRecords();
    const updatedRecord = updatedRecords.find(r => r.record_id === recordId);

    if (updatedRecord) {
      console.log('   验证成功:');
      console.log('   - 上传状态:', updatedRecord.fields['上传状态'] || '空');
      if (updatedRecord.fields['淘宝链接']) {
        console.log('   - 淘宝链接:', updatedRecord.fields['淘宝链接']);
      }
    }

    console.log('\n=== ✅ Step0 测试完成 ===');

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    if (error.stack) {
      console.error('\n堆栈:', error.stack);
    }
  }
}

testStep0Final();