const https = require('https');
const { FEISHU_CONFIG } = require('./scripts/config');

function getRequiredFeishuConfig() {
  const appId = FEISHU_CONFIG.APP_ID || process.env.FEISHU_APP_ID || '';
  const appSecret = FEISHU_CONFIG.APP_SECRET || process.env.FEISHU_APP_SECRET || '';
  const appToken = FEISHU_CONFIG.BITTABLE_TOKEN || FEISHU_CONFIG.APP_TOKEN || process.env.FEISHU_BITTABLE_TOKEN || process.env.FEISHU_APP_TOKEN || '';
  const tableId = FEISHU_CONFIG.TABLE_ID || process.env.FEISHU_TABLE_ID || '';

  if (!appId || !appSecret || !appToken || !tableId) {
    throw new Error('缺少飞书配置：请在 tb.env / tb.env.test 中配置 FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_BITTABLE_TOKEN(或 FEISHU_APP_TOKEN) 以及 FEISHU_TABLE_ID');
  }

  return { appId, appSecret, appToken, tableId };
}

function getToken(appId, appSecret) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    });

    const req = https.request({
      hostname: 'open.feishu.cn',
      port: 443,
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.code === 0) {
            resolve(response.tenant_access_token);
          } else {
            reject(new Error(response.msg));
          }
        } catch (e) {
          reject(new Error('解析 token 响应失败'));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getRecords(token, appToken, tableId, pageSize = 20) {
  return new Promise((resolve, reject) => {
    const path = `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=${pageSize}`;

    const req = https.request({
      hostname: 'open.feishu.cn',
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.code === 0) {
            resolve(response.data.items);
          } else {
            reject(new Error(response.msg));
          }
        } catch (e) {
          reject(new Error('解析 records 响应失败'));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    const { appId, appSecret, appToken, tableId } = getRequiredFeishuConfig();
    const token = await getToken(appId, appSecret);
    console.log('✅ Token获取成功\n');

    const records = await getRecords(token, appToken, tableId, 20);
    console.log(`📋 找到 ${records.length} 条记录\n`);

    records.forEach((record, index) => {
      const status = record.fields['上传状态'];
      const productId = record.fields['商品ID'];
      const title = record.fields['商品标题'];

      console.log(`${index + 1}. 商品ID: ${productId}`);
      console.log(`   标题: ${title ? title.substring(0, 30) + '...' : '无'}`);
      console.log(`   上传状态: \"${status || '空'}\"`);
      console.log('');
    });

    const emptyRecords = records.filter(r => !r.fields['上传状态'] || r.fields['上传状态'] === '');
    console.log(`\n🔍 空状态记录: ${emptyRecords.length} 条`);

    const testRecord = records.find(r => r.fields['商品ID'] === 'TEST_CHECK01');
    if (testRecord) {
      console.log('\n✅ 找到TEST_CHECK01记录');
      console.log('记录ID:', testRecord.record_id);
      console.log('当前状态:', testRecord.fields['上传状态'] || '空');
    } else {
      console.log('\n❌ 未找到TEST_CHECK01记录');
      console.log('请先在飞书中创建该记录');
    }
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
