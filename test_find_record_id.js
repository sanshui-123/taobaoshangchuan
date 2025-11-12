require('dotenv').config({ path: 'tb.env' });
const https = require('https');

async function test() {
  // 获取token
  const tokenData = JSON.stringify({
    app_id: process.env.FEISHU_APP_ID,
    app_secret: process.env.FEISHU_APP_SECRET
  });

  const token = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.feishu.cn',
      port: 443,
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(tokenData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const response = JSON.parse(body);
        if (response.code === 0) {
          resolve(response.tenant_access_token);
        } else {
          reject(new Error(response.msg));
        }
      });
    });
    req.on('error', reject);
    req.write(tokenData);
    req.end();
  });

  // 获取记录
  const productId = 'C25117160';
  const records = await new Promise((resolve, reject) => {
    const path = `/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records?page_size=100`;

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
        const response = JSON.parse(body);
        if (response.code === 0) {
          resolve(response.data.items);
        } else {
          reject(new Error(response.msg));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

  const targetRecord = records.find(r => r.fields['商品ID'] === productId);

  if (targetRecord) {
    console.log('找到记录:');
    console.log('record_id:', targetRecord.record_id);
    console.log('id:', targetRecord.id);
    console.log('fields:', JSON.stringify(targetRecord.fields, null, 2).substring(0, 200));
  } else {
    console.log('未找到记录');
  }
}

test();