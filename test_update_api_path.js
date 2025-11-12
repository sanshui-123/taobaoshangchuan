require('dotenv').config({ path: 'tb.env' });
const { feishuClient } = require('./scripts/feishu/client');
const https = require('https');

async function testUpdatePath() {
  console.log('=== 测试正确的更新API路径 ===\n');

  const recordId = 'recv2fMGxgxJsd';

  try {
    // 获取token
    const token = await feishuClient.getAccessToken();
    console.log('✅ Token获取成功');

    // 测试不同的API路径
    const paths = [
      `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}`,
      `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}?user_id_type=user_id`,
      `/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}`,
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

              if (body.startsWith('<!')) {
                console.log('   响应内容: HTML (可能是错误页面)');
                resolve({ success: false, error: 'HTML response' });
              } else {
                try {
                  const response = JSON.parse(body);
                  if (response.code === 0) {
                    console.log('   ✅ 成功!');
                    console.log('   响应:', response);
                    resolve({ success: true, data: response });
                  } else {
                    console.log('   ❌ 失败:', response.msg);
                    console.log('   错误码:', response.code);
                    resolve({ success: false, error: response.msg, code: response.code });
                  }
                } catch (e) {
                  console.log('   原始响应:', body.substring(0, 200));
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
          console.log('\n✅ 找到正确的API路径!');
          break;
        }
      } catch (error) {
        console.log(`   请求错误: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
  }
}

testUpdatePath();