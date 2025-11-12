require('dotenv').config({ path: 'tb.env' });
const https = require('https');

// 模拟 Step0 的逻辑
async function testStep0() {
  console.log('\n=== 测试 Step0 状态流 ===\n');

  // 1. 获取访问令牌
  console.log('1. 获取访问令牌...');
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

  console.log('✅ 访问令牌获取成功');

  // 2. 获取指定商品记录
  const productId = 'C25117160';
  console.log(`\n2. 查找商品 ${productId}...`);

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

  console.log(`✅ 获取到 ${records.length} 条记录`);

  // 3. 查找目标记录
  const targetRecord = records.find(r => r.fields['商品ID'] === productId);

  if (!targetRecord) {
    console.log(`\n❌ 未找到商品ID为 ${productId} 的记录`);
    return;
  }

  console.log(`\n✅ 找到记录: ${targetRecord.record_id}`);

  // 4. 检查当前状态
  const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
  const currentStatus = targetRecord.fields[statusField];
  const checkingValue = process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测';
  const pendingValue = process.env.FEISHU_STATUS_PENDING_VALUE || '待上传';
  const doneValue = process.env.FEISHU_STATUS_DONE_VALUE || '已上传到淘宝';
  const errorValue = process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败';

  console.log(`\n3. 当前状态: "${currentStatus || '空'}"`);

  // 5. 状态转换逻辑
  if (!currentStatus || currentStatus === '') {
    console.log(`\n4. 状态为空，更新为"${checkingValue}"...`);

    // 更新状态
    await new Promise((resolve, reject) => {
      const path = `/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${targetRecord.record_id}`;
      const data = JSON.stringify({
        fields: {
          [statusField]: checkingValue
        }
      });

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
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const response = JSON.parse(body);
          if (response.code === 0) {
            console.log(`✅ 状态已更新为"${checkingValue}"`);
            resolve();
          } else {
            reject(new Error(response.msg));
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    // 继续查重逻辑
    console.log(`\n5. 状态为"${checkingValue}"，开始查重检查...`);
    console.log(`🔍 开始检查商品是否存在: ${productId}`);
    console.log(`📁 存储状态文件: ${process.env.STORAGE_STATE_PATH}`);
    console.log(`🌐 无头模式: ${process.env.HEADLESS !== 'false' ? '是' : '否'}`);

    // 模拟查重结果（商品不存在）
    const exists = false;  // 假设商品不存在

    if (exists) {
      console.log(`\n✅ 商品 ${productId} 已存在于淘宝，更新状态为"${doneValue}"`);

      // 更新为已上传
      await new Promise((resolve, reject) => {
        const path = `/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${targetRecord.record_id}`;
        const data = JSON.stringify({
          fields: {
            [statusField]: doneValue,
            [process.env.FEISHU_DURATION_FIELD || '执行时长']: '0秒',
            [process.env.FEISHU_REPORT_FIELD || '报告文件']: `查重命中 - ${new Date().toLocaleString()}`
          }
        });

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
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            const response = JSON.parse(body);
            if (response.code === 0) {
              console.log(`✅ 状态已更新为"${doneValue}"`);
              resolve();
            } else {
              reject(new Error(response.msg));
            }
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });

      console.log('\n✅ 商品已存在，跳过上传流程');

    } else {
      console.log(`\n❌ 商品 ${productId} 不存在于淘宝，更新状态为"${pendingValue}"`);

      // 更新为待上传
      await new Promise((resolve, reject) => {
        const path = `/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${targetRecord.record_id}`;
        const data = JSON.stringify({
          fields: {
            [statusField]: pendingValue
          }
        });

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
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            const response = JSON.parse(body);
            if (response.code === 0) {
              console.log(`✅ 状态已更新为"${pendingValue}"`);
              resolve();
            } else {
              reject(new Error(response.msg));
            }
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });

      console.log(`\n6. 更新状态为"处理中"`);

      // 更新为处理中
      await new Promise((resolve, reject) => {
        const path = `/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${targetRecord.record_id}`;
        const data = JSON.stringify({
          fields: {
            [statusField]: process.env.FEISHU_STATUS_RUNNING_VALUE || '处理中'
          }
        });

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
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            const response = JSON.parse(body);
            if (response.code === 0) {
              console.log(`✅ 状态已更新为"处理中"`);
              resolve();
            } else {
              reject(new Error(response.msg));
            }
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });

      console.log('\n✅ 任务初始化完成，继续后续流程');
    }
  } else {
    console.log(`\n❌ 当前状态为"${currentStatus}"，跳过处理`);
  }
}

testStep0().catch(error => {
  console.error('\n❌ 错误:', error.message);
  console.error(error.stack);
});