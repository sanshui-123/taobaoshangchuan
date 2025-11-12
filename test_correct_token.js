const https = require('https');

// 获取token
const tokenData = JSON.stringify({
  app_id: 'cli_a871862032b2900d',
  app_secret: 'jC6o0dMadbyAh8AJHvNljghoUeBFaP2h'
});

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
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const tokenRes = JSON.parse(body);
    if (tokenRes.code === 0) {
      const token = tokenRes.tenant_access_token;

      // 使用APP_TOKEN而不是BITTABLE_TOKEN
      const path = '/open-apis/bitable/v1/apps/OlU0bHLUVa6LSLsTkn2cPUHunZa/tables/tblhBepAOlCyhfoN/records?page_size=5';

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
        let body2 = '';
        res2.on('data', chunk => body2 += chunk);
        res2.on('end', () => {
          const response = JSON.parse(body2);
          if (response.code === 0) {
            console.log('✅ 使用APP_TOKEN成功获取记录');
            console.log('记录数量:', response.data.items.length);

            // 查找空状态记录
            const emptyRecords = response.data.items.filter(r => {
              const status = r.fields['上传状态'];
              return !status || status === '';
            });
            console.log('空状态记录数量:', emptyRecords.length);
          } else {
            console.log('错误:', response.msg);
          }
        });
      });

      recordReq.end();
    }
  });
});

tokenReq.on('error', (e) => console.error('错误:', e.message));
tokenReq.write(tokenData);
tokenReq.end();