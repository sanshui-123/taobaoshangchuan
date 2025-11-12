const https = require('https');

// 先获取token
function getToken() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      app_id: 'cli_a871862032b2900d',
      app_secret: 'jC6o0dMadbyAh8AJHvNljghoUeBFaP2h'
    });

    const req = https.request({
      hostname: 'open.feishu.cn',
      port: 443,
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
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
    req.write(data);
    req.end();
  });
}

// 获取记录
function getRecords(token) {
  return new Promise((resolve, reject) => {
    const path = '/open-apis/bitable/v1/apps/OlU0bHLUVa6LSLsTkn2cPUHunZa/tables/tblhBepAOlCyhfoN/records?page_size=20';

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
}

// 主函数
async function main() {
  try {
    const token = await getToken();
    console.log('✅ Token获取成功\n');

    const records = await getRecords(token);
    console.log(`📋 找到 ${records.length} 条记录\n`);

    // 显示每条记录的状态
    records.forEach((record, index) => {
      const status = record.fields['上传状态'];
      const productId = record.fields['商品ID'];
      const title = record.fields['商品标题'];

      console.log(`${index + 1}. 商品ID: ${productId}`);
      console.log(`   标题: ${title ? title.substring(0, 30) + '...' : '无'}`);
      console.log(`   上传状态: "${status || '空'}"`);
      console.log('');
    });

    // 查找空状态记录
    const emptyRecords = records.filter(r => !r.fields['上传状态'] || r.fields['上传状态'] === '');
    console.log(`\n🔍 空状态记录: ${emptyRecords.length} 条`);

    // 查找TEST_CHECK01
    const testRecord = records.find(r => r.fields['商品ID'] === 'TEST_CHECK01');
    if (testRecord) {
      console.log('\n✅ 找到TEST_CHECK01记录');
      console.log('记录ID:', testRecord.record_id);
      console.log('当前状态:', testRecord.fields['上传状态'] || '空');
    } else {
      console.log('\n❌ 未找到TEST_CHECK01记录');
      console.log('请先在飞书中创建该记录');
    }

  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

main();