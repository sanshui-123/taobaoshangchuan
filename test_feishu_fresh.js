require('dotenv').config({ path: 'tb.env' });
const { feishuClient } = require('./scripts/feishu/client');

console.log('测试飞书客户端获取记录...\n');

// 强制重新导入客户端模块
delete require.cache[require.resolve('./scripts/feishu/client')];
const { feishuClient: freshClient } = require('./scripts/feishu/client');

console.log('客户端配置:');
console.log('appToken:', freshClient.appToken ? freshClient.appToken.substring(0, 20) + '...' : '未设置');
console.log('tableId:', freshClient.tableId);

freshClient.getAllRecords()
  .then(records => {
    console.log('\n✅ 获取记录成功，数量:', records.length);

    // 查找空状态记录
    const emptyRecords = records.filter(record => {
      const status = record.fields['上传状态'];
      return !status || status === '';
    });

    console.log('空状态记录数量:', emptyRecords.length);

    if (emptyRecords.length > 0) {
      console.log('\n第一条空状态记录:');
      console.log('- 记录ID:', emptyRecords[0].record_id);
      console.log('- 商品ID:', emptyRecords[0].fields['商品ID']);
      console.log('- 标题:', emptyRecords[0].fields['商品标题'] ? emptyRecords[0].fields['商品标题'].substring(0, 30) + '...' : '无');
      console.log('- 上传状态:', '空');
    }
  })
  .catch(error => {
    console.error('\n❌ 错误:', error.message);
    if (error.stack) {
      console.error('\n堆栈信息:', error.stack);
    }
  });