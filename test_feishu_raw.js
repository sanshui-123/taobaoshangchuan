const https = require('https');

// 先获取token
const tokenData = JSON.stringify({
  app_id: 'cli_a871862032b2900d',
  app_secret: 'jC6o0dMadbyAh8AJHvNljghoUeBFaP2h'
});

console.log('开始获取token...');

const tokenReq = https.request({
  hostname: 'open.feishu.cn',
  port: 443,
  path: '/open-apis/auth/v3/tenant_access_token/internal',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(tokenData)
  }
}, (res) => {
  console.log('Token响应状态:', res.statusCode);
  console.log('Token响应头:', res.headers);

  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Token响应体:', body);

    const tokenRes = JSON.parse(body);
    if (tokenRes.code === 0) {
      const token = tokenRes.tenant_access_token;
      console.log('\n✅ Token获取成功:', token.substring(0, 20) + '...\n');

      // 测试获取记录
      console.log('开始获取记录...');
      const path = '/open-apis/bitable/v1/apps/OlU0bHLUVa6LSLsTkn2cPUHunZa/tables/tblhBepAOlCyhfoN/records?page_size=10';

      const recordReq = https.request({
        hostname: 'open.feishu.cn',
        port: 443,
        path: path,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      }, (res2) => {
        console.log('\n获取记录响应状态:', res2.statusCode);
        console.log('获取记录响应头:', res2.headers);

        let body2 = '';
        res2.on('data', chunk => body2 += chunk);
        res2.on('end', () => {
          console.log('\n获取记录响应体（前500字符）:');
          console.log(body2.substring(0, 500));
          console.log('\n获取记录响应体（后500字符）:');
          if (body2.length > 500) {
            console.log(body2.substring(body2.length - 500));
          } else {
            console.log(body2);
          }
        });
      });

      recordReq.on('error', (e) => {
        console.error('获取记录错误:', e.message);
      });

      recordReq.end();
    }
  });
});

tokenReq.on('error', (e) => {
  console.error('Token获取错误:', e.message);
});

tokenReq.write(tokenData);
tokenReq.end();