#!/usr/bin/env node

// 测试所有步骤是否能正常加载

console.log('测试步骤加载...\n');

const steps = [
  { num: 8, name: 'step8-fill-colors', file: './scripts/steps/step8-fill-colors.js' },
  { num: 9, name: 'step9-fill-sizes', file: './scripts/steps/step9-fill-sizes.js' },
  { num: 10, name: 'step10-fill-price-stock', file: './scripts/steps/step10-fill-price-stock.js' },
  { num: 11, name: 'step11-crop-3to4-images', file: './scripts/steps/step11-crop-3to4-images.js' },
  { num: 12, name: 'step12-fill-detail-template', file: './scripts/steps/step12-fill-detail-template.js' },
  { num: 13, name: 'step13-submit-product', file: './scripts/steps/step13-submit-product.js' },
  { num: 14, name: 'step14-log-and-notify', file: './scripts/steps/step14-log-and-notify.js' }
];

const fs = require('fs');

let allPassed = true;

for (const step of steps) {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(step.file)) {
      console.log(`❌ Step ${step.num}: ${step.name} - 文件不存在`);
      allPassed = false;
      continue;
    }

    // 尝试加载文件
    require(step.file);
    console.log(`✅ Step ${step.num}: ${step.name} - 加载成功`);
  } catch (error) {
    console.log(`❌ Step ${step.num}: ${step.name} - 加载失败`);
    console.log(`   错误: ${error.message}`);
    allPassed = false;
  }
}

console.log('\n' + '='.repeat(50));
if (allPassed) {
  console.log('✅ 所有步骤加载成功！');
} else {
  console.log('❌ 部分步骤加载失败');
}