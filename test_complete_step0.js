require('dotenv').config({ path: 'tb.env' });
const { feishuClient } = require('./scripts/feishu/client');
const https = require('https');

async function testCompleteStep0() {
  console.log('=== 完整测试 Step0 流程 ===\n');

  const productId = 'C25117160';
  let recordId = null;

  try {
    // 1. 获取所有记录
    console.log('1. 获取飞书记录...');
    const response = await feishuClient.getRecords(1000, null);
    const records = response.records || response.items || [];

    // 2. 查找目标记录
    const targetRecord = records.find(r => {
      const pid = r.fields['商品ID'];
      return pid === productId || (Array.isArray(pid) && pid.includes(productId));
    });

    if (!targetRecord) {
      console.log(`❌ 未找到商品ID ${productId}`);
      return;
    }

    recordId = targetRecord.record_id;
    const currentStatus = targetRecord.fields['上传状态'] || '';
    console.log(`✅ 找到记录: ${recordId}`);
    console.log(`   当前状态: "${currentStatus}"`);

    // 3. 如果状态为空，更新为"待检测"
    if (!currentStatus || currentStatus === '') {
      console.log('\n2. 状态为空，更新为"待检测"...');

      // 直接使用HTTPS请求测试
      const token = await feishuClient.getAccessToken();
      const data = JSON.stringify({
        fields: {
          '上传状态': '待检测'
        }
      });

      const options = {
        hostname: 'open.feishu.cn',
        port: 443,
        path: `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}`,
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      console.log('   请求路径:', options.path);

      const result = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const response = JSON.parse(body);
              console.log('   响应状态:', res.statusCode);
              console.log('   响应数据:', JSON.stringify(response, null, 2));
              resolve(response);
            } catch (e) {
              console.log('   原始响应:', body);
              reject(e);
            }
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });

      if (result.code === 0) {
        console.log('   ✅ 状态更新成功');
      } else {
        console.log('   ❌ 状态更新失败:', result.msg);
        return;
      }
    }

    // 4. 执行查重
    console.log('\n3. 执行淘宝查重...');
    const { checkProductExists } = require('./scripts/utils/taobao-check');
    const exists = await checkProductExists(productId);

    if (exists) {
      console.log('   ✅ 发现重复商品');
      console.log(`   标题: ${exists.title}`);
      console.log(`   链接: ${exists.url}`);

      // 更新为"已上传到淘宝"
      const token = await feishuClient.getAccessToken();
      const data = JSON.stringify({
        fields: {
          '上传状态': '已上传到淘宝',
          '淘宝链接': exists.url
        }
      });

      const options = {
        hostname: 'open.feishu.cn',
        port: 443,
        path: `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}`,
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const response = JSON.parse(body);
              if (response.code === 0) {
                console.log('   ✅ 状态已更新为"已上传到淘宝"');
                resolve(response);
              } else {
                console.log('   ❌ 更新失败:', response.msg);
                reject(new Error(response.msg));
              }
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });

    } else {
      console.log('   ❌ 未发现重复商品');

      // 更新为"待上传"
      const token = await feishuClient.getAccessToken();
      const data = JSON.stringify({
        fields: {
          '上传状态': '待上传'
        }
      });

      const options = {
        hostname: 'open.feishu.cn',
        port: 443,
        path: `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/${recordId}`,
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const response = JSON.parse(body);
              if (response.code === 0) {
                console.log('   ✅ 状态已更新为"待上传"');
                resolve(response);
              } else {
                console.log('   ❌ 更新失败:', response.msg);
                reject(new Error(response.msg));
              }
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });
    }

    console.log('\n=== 测试完成！流程正常 ===');

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    if (error.stack) {
      console.error('\n堆栈:', error.stack);
    }
  }
}

testCompleteStep0();