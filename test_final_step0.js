require('dotenv').config({ path: 'tb.env' });
const { feishuClient } = require('./scripts/feishu/client');
const https = require('https');

async function testFinalStep0() {
  console.log('=== Step0 完整流程测试 ===\n');

  const productId = 'C25117160';
  let recordId = null;
  let token = null;

  try {
    // 1. 获取token
    console.log('1. 获取访问token...');
    token = await feishuClient.getAccessToken();
    console.log('   ✅ Token获取成功');

    // 2. 获取记录
    console.log('\n2. 获取飞书记录...');
    const response = await feishuClient.getRecords(1000, null);
    const records = response.records || response.items || [];

    // 查找目标记录
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
    console.log(`   找到记录: ${recordId}`);
    console.log(`   当前状态: "${currentStatus}"`);

    // 3. 如果状态为空，更新为"待检测"
    if (!currentStatus || currentStatus === '') {
      console.log('\n3. 状态为空，更新为"待检测"...');

      // 使用批量更新
      const updateData = JSON.stringify({
        records: [
          {
            record_id: recordId,
            fields: {
              "上传状态": "待检测"
            }
          }
        ]
      });

      const updatePath = `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/batch_update`;

      const updateResult = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'open.feishu.cn',
          port: 443,
          path: updatePath,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(updateData)
          }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            const response = JSON.parse(body);
            if (response.code === 0) {
              console.log('   ✅ 状态更新成功');
              resolve(response);
            } else {
              reject(new Error(response.msg));
            }
          });
        });
        req.on('error', reject);
        req.write(updateData);
        req.end();
      });

      // 继续执行查重
    }

    // 4. 执行淘宝查重
    console.log('\n4. 执行淘宝查重...');
    const { checkProductExists } = require('./scripts/utils/taobao-check');
    const exists = await checkProductExists(productId);

    let finalStatus = '';
    let finalFields = {};

    if (exists) {
      console.log('   ✅ 发现重复商品');
      console.log(`   标题: ${exists.title}`);
      console.log(`   链接: ${exists.url}`);

      finalStatus = '已上传到淘宝';
      finalFields = {
        "上传状态": finalStatus,
        "淘宝链接": exists.url
      };
    } else {
      console.log('   ❌ 未发现重复商品');

      finalStatus = '待上传';
      finalFields = {
        "上传状态": finalStatus
      };
    }

    // 5. 更新最终状态
    console.log(`\n5. 更新状态为"${finalStatus}"...`);

    const finalData = JSON.stringify({
      records: [
        {
          record_id: recordId,
          fields: finalFields
        }
      ]
    });

    const finalResult = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'open.feishu.cn',
        port: 443,
        path: `/open-apis/bitable/v1/apps/${process.env.FEISHU_BITTABLE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records/batch_update`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(finalData)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const response = JSON.parse(body);
          if (response.code === 0) {
            console.log('   ✅ 最终状态更新成功');
            resolve(response);
          } else {
            reject(new Error(response.msg));
          }
        });
      });
      req.on('error', reject);
      req.write(finalData);
      req.end();
    });

    console.log('\n=== 🎉 Step0 流程完成! ===');
    console.log(`商品ID: ${productId}`);
    console.log(`记录ID: ${recordId}`);
    console.log(`最终状态: ${finalStatus}`);
    if (exists) {
      console.log(`淘宝链接: ${exists.url}`);
    }

    // 6. 验证最终结果
    console.log('\n6. 验证更新结果...');
    const verifyRecord = await feishuClient.getRecords(1000, null);
    const verifyTarget = verifyRecord.records.find(r => r.record_id === recordId);

    if (verifyTarget) {
      console.log('验证成功:');
      console.log('- 上传状态:', verifyTarget.fields['上传状态'] || '空');
      if (verifyTarget.fields['淘宝链接']) {
        console.log('- 淘宝链接:', verifyTarget.fields['淘宝链接']);
      }
    }

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    if (error.stack) {
      console.error('\n堆栈:', error.stack);
    }
  }
}

testFinalStep0();