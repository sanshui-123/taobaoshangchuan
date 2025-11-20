const { feishuClient } = require('./scripts/feishu/client');
require('dotenv').config({ path: './tb.env' });

(async () => {
  const records = await feishuClient.getAllRecords();

  // 筛选Callaway品牌的卫衣/连帽衫
  const category = records.filter(r => {
    const brand = r.fields['品牌名'] || '';
    const cat = r.fields['衣服分类'] || '';
    return (brand.includes('Callaway') || brand.includes('卡拉威')) &&
           (cat.includes('卫衣') || cat.includes('连帽衫'));
  });

  console.log('\n=== Callaway 卫衣/连帽衫 商品列表 ===');
  console.log('总数:', category.length);
  console.log('');

  // 按状态分组
  const statusGroups = {};
  category.forEach(r => {
    const status = r.fields['上传状态'] || '空';
    const productId = r.fields['商品ID'] || 'N/A';
    if (!statusGroups[status]) statusGroups[status] = [];
    statusGroups[status].push(productId);
  });

  Object.keys(statusGroups).sort().forEach(status => {
    console.log(`[${status}] ${statusGroups[status].length} 条:`);
    console.log('  ', statusGroups[status].slice(0, 10).join(', '));
    if (statusGroups[status].length > 10) {
      console.log('  ', '... 还有', statusGroups[status].length - 10, '条');
    }
  });

  // 显示前3个商品的详细信息
  console.log('\n=== 前3个商品详细信息 ===');
  category.slice(0, 3).forEach((r, i) => {
    console.log(`\n商品 ${i+1}:`);
    console.log('  商品ID:', r.fields['商品ID']);
    console.log('  品牌:', r.fields['品牌名']);
    console.log('  分类:', r.fields['衣服分类']);
    console.log('  状态:', r.fields['上传状态'] || '空');
  });
})();
