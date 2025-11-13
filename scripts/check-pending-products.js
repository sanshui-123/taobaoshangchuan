require('dotenv').config({ path: 'tb.env' });
const { FeishuClient } = require('./feishu/client');

async function checkPendingProducts() {
  console.log('📋 检查待检测商品...\n');

  const client = new FeishuClient(
    process.env.FEISHU_APP_ID,
    process.env.FEISHU_APP_SECRET,
    process.env.FEISHU_APP_TOKEN,
    process.env.FEISHU_TABLE_ID
  );

  try {
    const records = await client.getAllRecords();
    console.log(`当前待检测商品数量: ${records.length} 个\n`);

    if (records.length > 0) {
      console.log('前10个待检测商品ID:');
      const productIds = [];

      records.slice(0, 10).forEach((record, index) => {
        const productId = record.fields['商品ID'] || 'N/A';
        const productName = record.fields['商品名称'] || 'N/A';
        productIds.push(productId);
        console.log(`${index + 1}. ${productId} - ${productName.substring(0, 30)}...`);
      });

      if (records.length > 10) {
        console.log(`... 还有 ${records.length - 10} 个商品`);
      }

      console.log('\n批量处理命令:');
      // 获取所有有效的商品ID
      const allProductIds = [];
      records.forEach((record) => {
        const productId = record.fields['商品ID'] || '';
        if (productId && productId !== 'N/A') {
          allProductIds.push(productId);
        }
      });
      console.log(`NODE_ENV=development npm run publish -- --batch=${allProductIds.join(',')} --from=0 --to=0 --verbose`);
    } else {
      console.log('✅ 没有待检测的商品');
    }
  } catch (error) {
    console.error('获取商品列表失败:', error.message);
  }
}

checkPendingProducts();