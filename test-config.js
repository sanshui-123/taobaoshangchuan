#!/usr/bin/env node
/**
 * 测试配置加载
 */

// 手动设置环境为 development
process.env.NODE_ENV = 'development';

// 加载配置
const { TAOBAO_CONFIG, getEnvironment, printConfig } = require('./scripts/config');

console.log('\n=== 配置加载测试 ===\n');
console.log('当前环境:', getEnvironment());
console.log('TEMPLATE_ITEM_ID:', process.env.TEMPLATE_ITEM_ID);
console.log('TAOBAO_CONFIG.TEMPLATE_ITEM_ID:', TAOBAO_CONFIG.TEMPLATE_ITEM_ID);

printConfig();

// 验证
if (TAOBAO_CONFIG.TEMPLATE_ITEM_ID) {
  console.log('\n✅ 配置加载成功！模板商品ID:', TAOBAO_CONFIG.TEMPLATE_ITEM_ID);
} else {
  console.log('\n❌ 配置加载失败：TEMPLATE_ITEM_ID 为空');
  process.exit(1);
}
