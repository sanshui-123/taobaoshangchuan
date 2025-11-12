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

// 步骤6：选择品牌
const { step6 } = require('./step6-select-brand');

// 步骤7：填写货号和性别
const { step7 } = require('./step7-fill-basic');

// 步骤8：颜色填写
const { step8 } = require('./step8-fill-colors');

// 步骤9：尺码
const { step9 } = require('./step9-fill-sizes');

// 步骤10：价格和商品id
const { step10 } = require('./step10-fill-price-stock');

// 步骤11：3:4主图
const { step11 } = require('./step11-crop-3to4-images');

// 步骤12：模版处理
const { step12 } = require('./step12-fill-detail-template');

// 步骤13：最后一步
const { step13 } = require('./step13-submit-product');

// 步骤14：提交商品
const { step14 } = require('./step14-log-and-notify');

// 步骤注册表
const steps = {
  0: step0,
  1: step1,
  2: step2,
  3: step3,
  4: step4,
  5: step5,
  6: step6,
  7: step7,
  8: step8,
  9: step9,
  10: step10,
  11: step11,
  12: step12,
  13: step13,
  14: step14
};

module.exports = { steps };