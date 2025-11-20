require('dotenv').config({ path: 'tb.env' });
const { feishuClient } = require('./scripts/feishu/client');

(async () => {
  try {
    console.log('📊 检查飞书表格记录状态...');

    // 获取所有记录查看状态
    const path = `/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records?page_size=20`;
    const response = await feishuClient.request(path);

    if (response && response.records) {
      console.log(`\n找到 ${response.records.length} 条记录:`);

      response.records.forEach((record, index) => {
        const status = record.fields[process.env.FEISHU_STATUS_FIELD || '上传状态'] || '(空)';
        const name = record.fields['商品名称'] || record.fields['货号'] || '未知';
        console.log(`${index + 1}. ${name} - 状态: ${status}`);
      });

      // 统计各状态数量
      const statusCount = {};
      response.records.forEach(record => {
        const status = record.fields[process.env.FEISHU_STATUS_FIELD || '上传状态'] || '空';
        statusCount[status] = (statusCount[status] || 0) + 1;
      });

      console.log('\n📈 状态统计:');
      Object.entries(statusCount).forEach(([status, count]) => {
        console.log(`  - ${status}: ${count} 条`);
      });

      // 检查是否有空状态的记录
      const emptyRecords = response.records.filter(r => {
        const statusField = r.fields[process.env.FEISHU_STATUS_FIELD || '上传状态'];
        return !statusField || statusField === '';
      });

      if (emptyRecords.length > 0) {
        console.log(`\n✅ 有 ${emptyRecords.length} 条空状态记录可以处理`);
        console.log('\n空状态记录详情:');
        emptyRecords.forEach((record, index) => {
          const name = record.fields['商品名称'] || record.fields['货号'] || '未知';
          console.log(`  ${index + 1}. ${name} (Record ID: ${record.record_id})`);
        });
      } else {
        console.log('\n⚠️ 没有空状态的记录，无法启动发布流程');
        console.log('提示: 需要将某条记录的"上传状态"字段清空才能处理');

        // 提供一个示例命令来清空第一条记录的状态
        if (response.records.length > 0) {
          const firstRecord = response.records[0];
          console.log('\n💡 要清空第一条记录的状态，可以运行:');
          console.log(`   node -e "require('./scripts/feishu/client').feishuClient.updateRecord('${firstRecord.record_id}', {'${process.env.FEISHU_STATUS_FIELD || '上传状态'}': ''})"`);
        }
      }
    } else {
      console.log('未找到任何记录');
    }
  } catch (error) {
    console.error('查询失败:', error.message);
    console.error('错误详情:', error);
  }
})();