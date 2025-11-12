/**
 * 获取飞书多维表格字段列表
 */
require('dotenv').config({ path: '../tb.env' });
const { FeishuClient } = require('./client');

async function listFields() {
  const client = new FeishuClient();

  try {
    // 获取表格信息
    const response = await client.request('GET', `/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/fields`);

    if (response.data.success) {
      console.log('✅ 成功获取字段列表:\n');

      const fields = response.data.data.items;

      fields.forEach(field => {
        console.log(`字段名: ${field.field_name}`);
        console.log(`类型: ${field.type}`);
        console.log(`是否必填: ${field.property.required || false}`);
        console.log('---');
      });

      // 查找可能的字段名
      console.log('\n🔍 查找相关字段:');

      const statusFields = fields.filter(f => f.field_name.includes('状态') || f.field_name.includes('上传'));
      const durationFields = fields.filter(f => f.field_name.includes('时长') || f.field_name.includes('时间'));
      const reportFields = fields.filter(f => f.field_name.includes('报告') || f.field_name.includes('结果'));

      if (statusFields.length > 0) {
        console.log('\n📊 状态相关字段:');
        statusFields.forEach(f => console.log(`  - ${f.field_name}`));
      }

      if (durationFields.length > 0) {
        console.log('\n⏱️ 时长相关字段:');
        durationFields.forEach(f => console.log(`  - ${f.field_name}`));
      }

      if (reportFields.length > 0) {
        console.log('\n📄 报告相关字段:');
        reportFields.forEach(f => console.log(`  - ${f.field_name}`));
      }

    } else {
      console.error('❌ 获取字段失败:', response.data);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

listFields();