/**
 * 获取所有待检测商品ID
 */
require('dotenv').config({ path: '../tb.env' });

const feishuManager = require('../scripts/utils/feishu-manager');

async function getAllPendingProducts() {
  console.log('📋 获取所有待检测商品...\n');

  try {
    // 获取所有待检测记录
    const records = await feishuManager.getPendingRecords();

    if (!records || records.length === 0) {
      console.log('✅ 没有待检测的商品');
      return;
    }

    console.log(`找到 ${records.length} 条待检测记录\n`);

    // 提取所有商品ID
    const productIds = [];
    records.forEach((record, index) => {
      const productId = record.fields['商品ID'] || '';
      const productName = record.fields['商品名称'] || '';

      if (productId && productId !== 'N/A') {
        productIds.push(productId);
      }
    });

    if (productIds.length === 0) {
      console.log('❌ 没有有效的商品ID');
      return;
    }

    console.log(`有效商品ID: ${productIds.length} 个\n`);
    console.log('所有商品ID:');
    console.log(productIds.join(','));

    // 生成批量命令
    console.log('\n批量处理命令:');
    console.log(`NODE_ENV=development npm run publish -- --batch=${productIds.join(',')} --from=0 --to=0 --verbose`);

  } catch (error) {
    console.error('❌ 获取失败:', error.message);
  }
}

getAllPendingProducts().then(() => {
  process.exit(0);
}).catch(console.error);