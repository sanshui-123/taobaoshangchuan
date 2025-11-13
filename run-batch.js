/**
 * 运行所有待检测商品的批量处理
 */
require('dotenv').config({ path: './tb.env' });

const feishuManager = require('./scripts/utils/feishu-manager');

async function runBatchAll() {
  console.log('🚀 准备批量处理所有待检测商品...\n');

  try {
    // 获取所有待检测记录
    const records = await feishuManager.getPendingRecords();

    if (!records || records.length === 0) {
      console.log('✅ 没有待检测的商品');
      process.exit(0);
      return;
    }

    console.log(`获取到 ${records.length} 条待检测记录`);

    // 提取所有商品ID
    const productIds = [];
    records.forEach((record, index) => {
      const productId = record.fields['商品ID'] || '';

      if (productId && productId !== 'N/A') {
        productIds.push(productId);
      }
    });

    console.log(`有效商品ID: ${productIds.length} 个\n`);

    if (productIds.length === 0) {
      console.log('❌ 没有有效的商品ID');
      process.exit(0);
      return;
    }

    // 生成批量命令
    const batchIds = productIds.join(',');
    const command = `NODE_ENV=development npm run publish -- --batch=${batchIds} --from=0 --to=0 --verbose`;

    console.log('开始执行批量处理...');
    console.log(`处理商品数: ${productIds.length} 个\n`);

    console.log('执行命令:');
    console.log(command + '\n');

    // 执行命令
    const { exec } = require('child_process');
    exec(command, {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env
    });

  } catch (error) {
    console.error('❌ 批量处理失败:', error.message);
    process.exit(1);
  }
}

runBatchAll();