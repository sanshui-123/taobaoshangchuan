require('dotenv').config({ path: 'tb.env' });
const https = require('https');

async function testGetRecord() {
  console.log('=== 测试获取单条记录 ===\n');

  const productId = 'C25117160';

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

  // 先获取所有记录
  const listPath = `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records?page_size=10`;

  const listData = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.feishu.cn',
      port: 443,
      path: listPath,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const response = JSON.parse(body);
        if (response.code === 0) {
          resolve(response.data);
        } else {
          reject(new Error(response.msg));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

  console.log('✅ 记录列表获取成功');
  console.log('记录总数:', listData.total);

  // 查找目标记录
  const targetRecord = listData.items.find(r => {
    const pid = r.fields['商品ID'];
    return pid === productId || (Array.isArray(pid) && pid.includes(productId));
  });

  if (!targetRecord) {
    console.log(`❌ 未找到商品ID ${productId}`);
    return;
  }

  console.log('\n找到目标记录:');
  console.log('- record_id:', targetRecord.record_id);
  console.log('- record_id类型:', typeof targetRecord.record_id);
  console.log('- 完整记录:', JSON.stringify(targetRecord, null, 2));

  // 测试使用这个ID获取单条记录
  const getRecordPath = `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${targetRecord.record_id}`;

  console.log('\n测试获取单条记录...');
  console.log('请求路径:', getRecordPath);

  try {
    const singleRecord = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'open.feishu.cn',
        port: 443,
        path: getRecordPath,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.log('响应状态:', res.statusCode);

          if (body.startsWith('<!')) {
            resolve({ success: false, error: '404 HTML' });
          } else {
            try {
              const response = JSON.parse(body);
              if (response.code === 0) {
                console.log('✅ 单条记录获取成功');
                resolve({ success: true, data: response.data });
              } else {
                console.log('❌ 获取失败:', response.msg);
                resolve({ success: false, error: response.msg });
              }
            } catch (e) {
              console.log('原始响应:', body);
              resolve({ success: false, error: 'JSON parse error' });
            }
          }
        });
      });
      req.on('error', reject);
      req.end();
    });

    if (singleRecord.success) {
      console.log('单条记录详情:', JSON.stringify(singleRecord.data, null, 2));
    }
  } catch (error) {
    console.error('获取单条记录错误:', error.message);
  }
}

testGetRecord().catch(console.error);