// 步骤0：任务初始化
const { step0 } = require('./step0-task-init');

// 步骤1：图片下载
const { step1 } = require('./step1-download-images');

// 步骤2：翻译商品内容
const { step2 } = require('./step2-translate');

// 步骤3：登录并保存storage
const { step3 } = require('./step3-login');

// 步骤4：打开发布页面
const { step4 } = require('./step4-open-page');

// 步骤5：上传1:1主图
const { step5 } = require('./step5-upload-images');

// 步骤6：填写标题和分类
const { step5: step6 } = require('./step5-fill-title-category');

// 步骤7：选择品牌
const { step6: step7 } = require('./step6-select-brand');

// 步骤8：填写货号
const { step7: step8 } = require('./step7-fill-basic');

// 步骤9：价格库存填写（新简化版）
const { step9PriceStock } = require('./step9-fill-price-stock-new');

// 步骤10：3:4主图裁剪（新简化版）
const { step10Crop } = require('./step10-crop-3to4-new');

// 步骤11：详情模板（新简化版）
const { step11Detail } = require('./step11-detail-template-new');

// 步骤12：提交商品
const { step13: step12_submit } = require('./step13-submit-product');

// 步骤13：日志通知
const { step14: step13_notify } = require('./step14-log-and-notify');

// 步骤注册表
const steps = {
  0: step0,
  1: step1,
  2: step2,
  3: step3,
  4: step4,
  5: step5,
  6: step6,   // 填写标题和分类
  7: step7,   // 选择品牌
  8: step8,   // 填写货号
  9: step9PriceStock,   // 价格库存填写
  10: step10Crop, // 3:4主图裁剪
  11: step11Detail, // 详情模版
  12: step12_submit, // 提交商品
  13: step13_notify  // 日志通知
};

module.exports = { steps };
