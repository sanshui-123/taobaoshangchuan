require('dotenv').config({ path: 'tb.env' });
const https = require('https');

async function testApiVersions() {
  console.log('=== 测试不同的API版本 ===\n');

  const recordId = 'recv2fMGxgxJsd';

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

  console.log('✅ Token获取成功');

  // 测试不同的API版本路径
  const paths = [
    // v1 API
    `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}`,
    // v1.0 API (新版本)
    `/open-apis/bitable/v1.0/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}`,
    // 带user_id_type的v1
    `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}?user_id_type=user_id`,
    // 带user_id_type的v1.0
    `/open-apis/bitable/v1.0/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}?user_id_type=user_id`,
  ];

  for (const path of paths) {
    console.log(`\n测试路径: ${path}`);

    const data = JSON.stringify({
      fields: {
        '上传状态': '待检测'
      }
    });

    const options = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: path,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    try {
      const result = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            console.log(`   响应状态: ${res.statusCode}`);
            console.log(`   响应头:`, res.headers);

            if (body.startsWith('<!')) {
              console.log('   响应内容: HTML (404页面)');
              resolve({ success: false, error: 'HTML 404' });
            } else if (body.trim() === '') {
              console.log('   响应内容: 空');
              resolve({ success: false, error: 'Empty response' });
            } else {
              try {
                const response = JSON.parse(body);
                if (response.code === 0) {
                  console.log('   ✅ 成功!');
                  console.log('   响应:', JSON.stringify(response, null, 2));
                  resolve({ success: true, data: response });
                } else {
                  console.log('   ❌ 失败:', response.msg);
                  console.log('   错误码:', response.code);
                  if (response.error) {
                    console.log('   错误详情:', response.error);
                  }
                  resolve({ success: false, error: response.msg, code: response.code });
                }
              } catch (e) {
                console.log('   JSON解析错误');
                console.log('   原始响应:', body);
                resolve({ success: false, error: 'JSON parse error' });
              }
            }
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });

      if (result.success) {
        console.log('\n🎉 找到正确的API路径!');
        console.log('✅ 更新记录成功!');
        return;
      }
    } catch (error) {
      console.log(`   请求错误: ${error.message}`);
    }
  }

  console.log('\n❌ 所有路径都失败了，可能需要检查：');
  console.log('1. app_token (多维表格应用token) 是否正确');
  console.log('2. table_id 是否正确');
  console.log('3. record_id 是否正确');
  console.log('4. 权限是否足够');
}

testApiVersions().catch(console.error);