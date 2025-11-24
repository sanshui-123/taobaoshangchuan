#!/usr/bin/env node

const { feishuClient } = require('./feishu/client');
const { checkTaobaoProduct } = require('./check_taobao_product');
require('dotenv').config({ path: './tb.env' });

async function main() {
  const brand = process.argv[2];

  if (!brand) {
    console.log('用法: node scripts/batch_check_brand.js "品牌名"');
    console.log('例如: node scripts/batch_check_brand.js "Le Coq公鸡乐卡克"');
    process.exit(1);
  }

  console.log('🔍 检测品牌:', brand);
  console.log('⏳ 正在获取商品列表...\n');

  const records = await feishuClient.getAllRecords();
  const products = records.filter(r => r.fields['品牌名'] === brand);

  if (products.length === 0) {
    console.log('❌ 未找到该品牌的商品');
    process.exit(0);
  }

  console.log(`📦 找到 ${products.length} 个商品\n`);
  console.log('开始检测...\n');

  let uploaded = 0;
  let notUploaded = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const id = p.fields['商品ID'];
    const category = p.fields['衣服分类'] || '未分类';

    try {
      const exists = await checkTaobaoProduct(id);
      const status = exists ? '✅ 已上传' : '❌ 未上传';

      if (exists) {
        uploaded++;
      } else {
        notUploaded++;
      }

      console.log(`[${i+1}/${products.length}]`, status, id, '-', category);
    } catch (error) {
      console.log(`[${i+1}/${products.length}] ⚠️  检测失败`, id, '-', error.message);
    }
  }

  console.log('\n========================================');
  console.log('📊 检测完成');
  console.log('========================================');
  console.log('✅ 已上传:', uploaded);
  console.log('❌ 未上传:', notUploaded);
  console.log('📦 总计:', products.length);
  console.log('========================================');
}

main().catch(console.error);
