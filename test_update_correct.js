require('dotenv').config({ path: 'tb.env' });
const https = require('https');

async function testUpdateRecord() {
  console.log('=== 测试更新记录（正确格式） ===\n');

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

  // 更新记录 - 使用正确的格式
  const updatePath = `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}`;

  // 根据飞书API文档，更新记录需要使用特定的格式
  const updateData = JSON.stringify({
    fields: {
      "上传状态": "待检测"
    }
  });

  console.log('请求路径:', updatePath);
  console.log('请求体:', updateData);

  const options = {
    hostname: 'open.feishu.cn',
    port: 443,
    path: updatePath,
    method: 'PATCH',  // 使用 PATCH 方法
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(updateData)
    }
  };

  try {
    const result = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';

        console.log('响应状态码:', res.statusCode);
        console.log('响应头:', res.headers);

        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.log('响应体长度:', body.length);

          if (body.startsWith('<!')) {
            console.log('收到HTML响应（404页面）');
            resolve({ success: false, html: body.substring(0, 200) });
          } else if (body.trim() === '') {
            console.log('收到空响应');
            resolve({ success: false, error: 'Empty response' });
          } else {
            try {
              const response = JSON.parse(body);
              console.log('JSON响应:', response);

              if (response.code === 0) {
                console.log('\n✅ 更新成功!');
                resolve({ success: true, data: response });
              } else {
                console.log('\n❌ 更新失败:', response.msg);
                if (response.error) {
                  console.log('错误详情:', response.error);
                }
                resolve({ success: false, error: response.msg, code: response.code });
              }
            } catch (e) {
              console.log('JSON解析失败');
              console.log('原始响应:', body);
              resolve({ success: false, error: 'JSON parse error' });
            }
          }
        });
      });

      req.on('error', (error) => {
        console.error('请求错误:', error);
        reject(error);
      });

      req.write(updateData);
      req.end();
    });

    if (result.success) {
      console.log('\n🎉 记录更新成功!');

      // 验证更新结果 - 再次获取记录
      console.log('\n验证更新结果...');
      const verifyPath = `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}`;

      const verifyResult = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'open.feishu.cn',
          port: 443,
          path: verifyPath,
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
              resolve(response.data.record);
            } else {
              reject(new Error(response.msg));
            }
          });
        });
        req.on('error', reject);
        req.end();
      });

      console.log('更新后的状态:', verifyResult.fields['上传状态'] || '空');

    } else {
      console.log('\n❌ 记录更新失败');

      // 尝试其他方法
      console.log('\n尝试使用 batch_update 方法...');

      const batchPath = `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/batch_update`;

      const batchData = JSON.stringify({
        records: [
          {
            record_id: recordId,
            fields: {
              "上传状态": "待检测"
            }
          }
        ]
      });

      console.log('批量更新路径:', batchPath);
      console.log('批量更新数据:', batchData);

      const batchResult = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'open.feishu.cn',
          port: 443,
          path: batchPath,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(batchData)
          }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const response = JSON.parse(body);
              console.log('批量更新响应:', response);
              resolve(response);
            } catch (e) {
              console.log('批量更新原始响应:', body);
              resolve({ error: 'Parse error' });
            }
          });
        });
        req.on('error', reject);
        req.write(batchData);
        req.end();
      });

      if (batchResult.code === 0) {
        console.log('\n✅ 批量更新成功!');
      }
    }

  } catch (error) {
    console.error('\n错误:', error.message);
  }
}

testUpdateRecord().catch(console.error);