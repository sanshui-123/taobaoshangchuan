require('dotenv').config({ path: 'tb.env' });
const https = require('https');

async function testUpdateAlt() {
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

  console.log('Token:', token.substring(0, 20) + '...');

  // 尝试不同的更新路径
  const recordId = 'recv2fMGxgxJsd';

  // 方法1：使用 apps/{app_token}/bitable/{table_token}/records/{record_id}
  const path1 = `/open-apis/apps/${process.env.FEISHU_APP_TOKEN}/bitables/${process.env.FEISHU_TABLE_ID}/records/${recordId}`;
  console.log('\n尝试路径1:', path1);

  const data1 = JSON.stringify({
    fields: {
      '上传状态': '待检测'
    }
  });

  try {
    const response1 = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'open.feishu.cn',
        port: 443,
        path: path1,
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data1)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.log('响应状态码:', res.statusCode);
          try {
            const response = JSON.parse(body);
            resolve({ status: res.statusCode, data: response });
          } catch (e) {
            resolve({ status: res.statusCode, error: body });
          }
        });
      });
      req.on('error', reject);
      req.write(data1);
      req.end();
    });

    console.log('\n路径1结果:', response1);
  } catch (e) {
    console.log('\n路径1错误:', e.message);
  }
}

testUpdateAlt().catch(console.error);