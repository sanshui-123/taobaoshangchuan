require('dotenv').config({ path: 'tb.env' });
const https = require('https');

async function testUpdateStatus() {
  console.log('环境变量:');
  console.log('FEISHU_APP_TOKEN:', process.env.FEISHU_APP_TOKEN);
  console.log('FEISHU_TABLE_ID:', process.env.FEISHU_TABLE_ID);

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

  console.log('\nToken:', token.substring(0, 20) + '...');

  // 构造URL
  const recordId = 'recv2fMGxgxJsd';
  const path = `/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}`;
  console.log('\n请求URL:', 'https://open.feishu.cn' + path);

  // 更新状态
  const data = JSON.stringify({
    fields: {
      '上传状态': '待检测'
    }
  });

  console.log('\n请求数据:', data);

  const response = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.feishu.cn',
      port: 443,
      path: path,
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      console.log('\n响应状态码:', res.statusCode);
      console.log('响应头:', res.headers);

      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('\n响应体:', body);
        try {
          const response = JSON.parse(body);
          resolve(response);
        } catch (e) {
          reject(new Error('JSON解析失败: ' + body));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });

  console.log('\n更新结果:', response);
}

testUpdateStatus().catch(console.error);