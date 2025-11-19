/**
 * 测试脚本：验证飞书状态更新功能
 * 用于测试Step 12（实际是step13-submit-product.js）完成后是否能正确更新飞书状态
 */
require('dotenv').config();
const { feishuClient } = require('./scripts/feishu/client');

async function testFeishuUpdate() {
  console.log('🧪 开始测试飞书状态更新功能');
  console.log('================================\n');

  // 1. 检查环境变量配置
  console.log('📋 环境变量检查：');
  const requiredEnvVars = [
    'FEISHU_APP_ID',
    'FEISHU_APP_SECRET',
    'FEISHU_BITTABLE_TOKEN',
    'FEISHU_TABLE_ID',
    'FEISHU_STATUS_FIELD'
  ];

  let configValid = true;
  for (const envVar of requiredEnvVars) {
    const value = process.env[envVar];
    if (value) {
      console.log(`✅ ${envVar}: 已配置 (${envVar === 'FEISHU_STATUS_FIELD' ? value : '***'})`);
    } else {
      console.log(`❌ ${envVar}: 未配置`);
      configValid = false;
    }
  }

  if (!configValid) {
    console.log('\n❌ 环境变量配置不完整，请检查 .env 文件');
    process.exit(1);
  }

  console.log('\n📋 字段映射配置：');
  console.log(`- 状态字段: ${process.env.FEISHU_STATUS_FIELD || '上传状态'}`);
  console.log(`- 错误日志字段: ${process.env.FEISHU_ERROR_LOG_FIELD || 'error_log'}`);
  console.log(`- 商品链接字段: ${process.env.FEISHU_URL_FIELD || '商品链接'}`);
  console.log(`- 商品ID字段: ${process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'}`);

  try {
    // 2. 测试获取访问令牌
    console.log('\n🔑 测试获取访问令牌...');
    const token = await feishuClient.getAccessToken();
    console.log('✅ 成功获取访问令牌');

    // 3. 测试获取记录
    console.log('\n📊 测试获取飞书表格记录...');
    console.log(`- App Token: ${process.env.FEISHU_BITTABLE_TOKEN}`);
    console.log(`- Table ID: ${process.env.FEISHU_TABLE_ID}`);

    // 不使用过滤，获取所有记录
    const path = `/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records?page_size=5`;
    console.log(`- 请求路径: ${path}`);

    const records = await feishuClient.request(path);
    console.log(`- 响应数据:`, records);

    if (records && records.records && records.records.length > 0) {
      console.log(`✅ 成功获取 ${records.records.length} 条记录`);

      // 显示第一条记录的结构
      const firstRecord = records.records[0];
      console.log('\n📝 记录示例：');
      console.log(`- Record ID: ${firstRecord.record_id}`);
      console.log('- 字段列表:');
      Object.keys(firstRecord.fields).forEach(field => {
        const value = firstRecord.fields[field];
        const displayValue = Array.isArray(value) ? `[${value.length}项]` :
                           typeof value === 'object' ? JSON.stringify(value).substring(0, 50) + '...' :
                           String(value).substring(0, 50);
        console.log(`  - ${field}: ${displayValue}`);
      });

      // 4. 测试更新记录（使用第一条记录做测试）
      console.log('\n🔄 测试更新记录功能...');
      const testRecordId = firstRecord.record_id;
      const currentStatus = firstRecord.fields[process.env.FEISHU_STATUS_FIELD || '上传状态'];

      console.log(`当前状态: ${currentStatus || '(空)'}`);

      // 创建测试更新数据
      const testUpdateFields = {
        [process.env.FEISHU_STATUS_FIELD || '上传状态']: '测试中',
        [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `测试时间: ${new Date().toLocaleString('zh-CN')}`
      };

      console.log('更新字段:', testUpdateFields);

      // 执行更新
      await feishuClient.updateRecord(testRecordId, testUpdateFields);
      console.log('✅ 测试更新成功');

      // 5. 模拟实际的提交成功场景
      console.log('\n🎯 模拟商品提交成功场景...');
      const successUpdateFields = {
        [process.env.FEISHU_STATUS_FIELD || '上传状态']: '已上传',
        [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: '提交成功',
        [process.env.FEISHU_URL_FIELD || '商品链接']: 'https://item.taobao.com/item.htm?id=123456789',
        [process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID']: '123456789'
      };

      console.log('模拟更新字段:', successUpdateFields);
      await feishuClient.updateRecord(testRecordId, successUpdateFields);
      console.log('✅ 模拟更新成功');

      // 6. 恢复原状态
      if (currentStatus) {
        console.log('\n🔄 恢复原始状态...');
        await feishuClient.updateRecord(testRecordId, {
          [process.env.FEISHU_STATUS_FIELD || '上传状态']: currentStatus,
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: ''
        });
        console.log('✅ 已恢复原始状态');
      }

      console.log('\n✅ 所有测试通过！飞书更新功能正常');
      console.log('\n📌 说明：');
      console.log('- Step 12 提交成功后，会自动更新状态为"已上传"');
      console.log('- 同时会记录商品链接和ID（如果能获取到）');
      console.log('- 如果提交失败，状态会更新为"发布失败"并记录错误信息');

    } else {
      console.log('⚠️ 未找到任何记录，请确认表格中有数据');
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('错误详情:', error);
    process.exit(1);
  }
}

// 运行测试
testFeishuUpdate().catch(console.error);