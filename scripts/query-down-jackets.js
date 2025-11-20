/**
 * 查询所有羽绒服/棉服商品
 */
require('dotenv').config({ path: './tb.env' });
const { feishuClient } = require('./feishu/client');

async function queryDownJackets() {
  console.log('🔍 查询 Callaway/卡拉威 品牌的羽绒服/棉服商品');
  console.log('='.repeat(60));

  try {
    // 获取所有记录
    console.log('\n📋 正在获取飞书表格数据...');
    const allRecordsResponse = await feishuClient.getRecords(1000, null);
    const allRecords = allRecordsResponse.records || allRecordsResponse.items || [];
    console.log(`✅ 获取到 ${allRecords.length} 条记录`);

    // 字段配置
    const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
    const brandField = process.env.FEISHU_BRAND_FIELD || '品牌名';
    const categoryField = process.env.FEISHU_CATEGORY_FIELD || '衣服分类';
    const productIdField = process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID';
    const targetBrand = 'Callaway/卡拉威';
    const targetCategory = '羽绒服/棉服';
    const targetStatuses = ['待检测', '待上传'];

    console.log(`\n🔍 筛选条件:`);
    console.log(`  品牌: ${targetBrand}`);
    console.log(`  分类: ${targetCategory}`);
    console.log(`  状态: ${targetStatuses.join(', ')}`);

    // 筛选记录
    let filteredRecords = allRecords;

    // 按状态筛选
    filteredRecords = filteredRecords.filter(record => {
      const status = record.fields[statusField];
      return targetStatuses.includes(status);
    });
    console.log(`\n按状态筛选后: ${filteredRecords.length} 条`);

    // 按品牌筛选
    filteredRecords = filteredRecords.filter(record => {
      const brand = record.fields[brandField];
      if (Array.isArray(brand)) {
        return brand.some(b => (b.text || b) === targetBrand);
      }
      return (brand?.text || brand) === targetBrand;
    });
    console.log(`按品牌筛选后: ${filteredRecords.length} 条`);

    // 按分类筛选
    filteredRecords = filteredRecords.filter(record => {
      const category = record.fields[categoryField];
      if (Array.isArray(category)) {
        return category.some(c => (c.text || c) === targetCategory);
      }
      return (category?.text || category) === targetCategory;
    });
    console.log(`按分类筛选后: ${filteredRecords.length} 条`);

    if (filteredRecords.length === 0) {
      console.log('\n⚠️ 没有找到符合条件的商品');
      return;
    }

    console.log(`\n📝 找到 ${filteredRecords.length} 个符合条件的商品:`);
    console.log('='.repeat(60));

    filteredRecords.forEach((record, index) => {
      const productId = record.fields[productIdField];
      const status = record.fields[statusField];
      const brand = record.fields[brandField];
      const category = record.fields[categoryField];
      const title = record.fields['商品名称'] || record.fields['标题'] || '未知';

      console.log(`\n${index + 1}. 商品ID: ${productId}`);
      console.log(`   状态: ${status}`);
      console.log(`   品牌: ${brand}`);
      console.log(`   分类: ${category}`);
      console.log(`   标题: ${title.substring(0, 50)}...`);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`📊 总计: ${filteredRecords.length} 个商品`);

  } catch (error) {
    console.error('\n❌ 查询失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
    process.exit(1);
  }
}

queryDownJackets();
