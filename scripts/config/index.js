const path = require('path');
const fs = require('fs');

// 根据环境变量或默认值加载配置
const env = process.env.NODE_ENV || 'test';
const configFiles = {
  test: 'tb.env.test',
  development: 'tb.env',
  production: 'tb.env'
};

const configFileName = configFiles[env] || 'tb.env';

// 加载环境变量
require('dotenv').config({
  path: path.resolve(process.cwd(), configFileName)
});

/**
 * 飞书配置
 */
exports.FEISHU_CONFIG = {
  APP_ID: process.env.FEISHU_APP_ID || '',
  APP_SECRET: process.env.FEISHU_APP_SECRET || '',
  APP_TOKEN: process.env.FEISHU_APP_TOKEN || '',
  BITTABLE_TOKEN: process.env.FEISHU_BITTABLE_TOKEN || '',
  TABLE_ID: process.env.FEISHU_TABLE_ID || '',
  // 字段映射
  IMAGE_FIELD: process.env.FEISHU_IMAGE_FIELD || '图片',
  TITLE_FIELD: process.env.FEISHU_TITLE_FIELD || '商品标题',
  TITLE_CN_FIELD: process.env.FEISHU_TITLE_CN_FIELD || '标题',
  TITLE_JP_FIELD: process.env.FEISHU_TITLE_JP_FIELD || 'タイトル',
  DESCRIPTION_CN_FIELD: process.env.FEISHU_DESCRIPTION_CN_FIELD || '卖点',
  DESCRIPTION_JP_FIELD: process.env.FEISHU_DESCRIPTION_JP_FIELD || '卖点_日文',
  DETAIL_CN_FIELD: process.env.FEISHU_DETAIL_CN_FIELD || '详情页文字',
  DETAIL_JP_FIELD: process.env.FEISHU_DETAIL_JP_FIELD || '详情页文字_日文',
  PRICE_FIELD: process.env.FEISHU_PRICE_FIELD || '价格',
  STOCK_FIELD: process.env.FEISHU_STOCK_FIELD || '库存',
  BRAND_FIELD: process.env.FEISHU_BRAND_FIELD || '品牌',
  COLOR_FIELD: process.env.FEISHU_COLOR_FIELD || '颜色',
  SIZE_FIELD: process.env.FEISHU_SIZE_FIELD || '尺码',
  SIZE_TABLE_FIELD: process.env.FEISHU_SIZE_TABLE_FIELD || '尺码表',
  STATUS_FIELD: process.env.FEISHU_STATUS_FIELD || '上传状态',
  ERROR_LOG_FIELD: process.env.FEISHU_ERROR_LOG_FIELD || '错误日志',
  URL_FIELD: process.env.FEISHU_URL_FIELD || '淘宝链接',
  PRODUCT_ID_FIELD: process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID',
  DURATION_FIELD: process.env.FEISHU_DURATION_FIELD || '执行时长',
  REPORT_FIELD: process.env.FEISHU_REPORT_FIELD || '报告文件',
  // 状态值
  CHECKING_VALUE: process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测',
  PENDING_VALUE: process.env.FEISHU_STATUS_PENDING_VALUE || '待上传',
  RUNNING_VALUE: process.env.FEISHU_STATUS_RUNNING_VALUE || '处理中',
  DONE_VALUE: process.env.FEISHU_STATUS_DONE_VALUE || '已上传到淘宝',
  ERROR_VALUE: process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败',
  TARGET_STATUS: process.env.FEISHU_TARGET_STATUS ?
    process.env.FEISHU_TARGET_STATUS.split(',').map(s => s.trim()) :
    ['待上传', '待检测'],
  SUCCESS_STATUS: process.env.FEISHU_SUCCESS_STATUS || '已上传到淘宝',
  FAILED_STATUS: process.env.FEISHU_ERROR_STATUS || '上传失败'
};

/**
 * 淘宝配置
 */
exports.TAOBAO_CONFIG = {
  BASE_URL: process.env.TAOBAO_BASE_URL || 'https://login.taobao.com',
  PUBLISH_URL: process.env.TAOBAO_PUBLISH_URL || 'https://sell.taobao.com/publish/similar',
  TEMPLATE_ITEM_ID: process.env.TEMPLATE_ITEM_ID || '',  // 模板商品ID，用于直达链接
  STORAGE_STATE_PATH: process.env.TAOBAO_STORAGE_STATE_PATH || path.resolve(process.cwd(), 'storage/storageState.json'),
  ASSETS_DIR: process.env.TAOBAO_ASSETS_DIR || path.resolve(process.cwd(), 'assets'),
  SCREENSHOT_DIR: process.env.TAOBAO_SCREENSHOT_DIR || path.resolve(process.cwd(), 'screenshots'),
  LOGS_DIR: process.env.TAOBAO_LOGS_DIR || path.resolve(process.cwd(), 'logs'),
  HEADLESS: process.env.HEADLESS !== 'false',
  TIMEOUT: parseInt(process.env.TAOBAO_TIMEOUT || '30000'),
  RETRY_TIMES: parseInt(process.env.TAOBAO_RETRY_TIMES || '3'),
  DEBUG: process.env.DEBUG === 'true'
};

/**
 * 获取配置文件路径
 */
exports.getConfigPath = () => {
  return path.resolve(process.cwd(), configFileName);
};

/**
 * 验证必需的环境变量
 */
exports.validateConfig = () => {
  const required = [
    'FEISHU_APP_ID',
    'FEISHU_APP_SECRET',
    'FEISHU_APP_TOKEN',
    'FEISHU_TABLE_ID'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('\n❌ 缺少必需的环境变量:');
    missing.forEach(key => console.error(`  - ${key}`));
    console.error('\n请检查配置文件:', configFileName);
    return false;
  }

  return true;
};

/**
 * 获取当前环境
 */
exports.getEnvironment = () => env;

/**
 * 打印配置信息（隐藏敏感信息）
 */
exports.printConfig = () => {
  console.log('\n📋 配置信息:');
  console.log(`  环境: ${env}`);
  console.log(`  配置文件: ${configFileName}`);
  console.log(`  飞书App ID: ${process.env.FEISHU_APP_ID?.substring(0, 8)}...`);
  const statusFieldPrimary = process.env.FEISHU_STATUS_FIELD || '上传状态';
  const statusFieldSummary = process.env.FEISHU_STATUS_FIELD || 'status';
  console.log(`  状态字段(流程): ${statusFieldPrimary}`);
  console.log(`  状态字段(汇总): ${statusFieldSummary}`);
  console.log(`  淘宝截图目录: ${exports.TAOBAO_CONFIG.SCREENSHOT_DIR}`);
  console.log(`  资源目录: ${exports.TAOBAO_CONFIG.ASSETS_DIR}`);
  console.log(`  日志目录: ${exports.TAOBAO_CONFIG.LOGS_DIR}`);
  console.log(`  无头模式: ${exports.TAOBAO_CONFIG.HEADLESS ? '是' : '否'}`);
  console.log(`  调试模式: ${exports.TAOBAO_CONFIG.DEBUG ? '开' : '关'}`);
};
