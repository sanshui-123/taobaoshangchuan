/**
 * 优化版步骤导出
 * 使用优化后的 Step 5 和 Step 11
 */

// 导入步骤（基于实际文件结构）

// 步骤4：打开发布页面
const { step4 } = require('./step4-open-page');

// 步骤5：上传1:1主图（优化版）
const { step5 } = require('./step5-upload-images-optimized');

// 步骤6：填写标题和分类
const { step5: step6 } = require('./step5-fill-title-category');

// 步骤7：选择品牌
const { step6: step7 } = require('./step6-select-brand');

// 步骤8：填写货号和性别
const { step7: step8 } = require('./step7-fill-basic');

// 步骤9：价格库存填写
const { step9PriceStock } = require('./step9-fill-price-stock-new');

// 步骤10：3:4主图裁剪
const { step10Crop } = require('./step10-crop-3to4-new');

// 步骤11：详情模板（优化版）
const { step11Detail } = require('./step11-detail-template-optimized');

// 步骤12：提交商品
const { step13: step12_submit } = require('./step13-submit-product');

// 导出步骤字典（只包含 4-12）
const steps = {
  4: step4,
  5: step5,  // 优化版
  6: step6,
  7: step7,
  8: step8,
  9: step9PriceStock,
  10: step10Crop,
  11: step11Detail,  // 优化版
  12: step12_submit
};

console.log('✨ 已加载优化版步骤（Step 5 & Step 11）');

module.exports = { steps };