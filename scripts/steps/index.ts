import { StepHandler, StepId } from '../types';

// 步骤0：关闭广告
export const step0: StepHandler = async (ctx) => {
  ctx.logger.info('Step 0 placeholder: 关闭广告');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤1：图片下载
export const step1: StepHandler = async (ctx) => {
  ctx.logger.info('Step 1 placeholder: 从飞书多维表格的图片url获取内容');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤2：登录千牛主页
export const step2: StepHandler = async (ctx) => {
  ctx.logger.info('Step 2 placeholder: 登录千牛主页');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤3：点击商品-素材库-图片上传
export const step3: StepHandler = async (ctx) => {
  ctx.logger.info('Step 3 placeholder: 点击商品-素材库-图片上传');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤4：点击淘宝-我的商品-上传商品-选择发布相似品，上传1:1主图
export const step4: StepHandler = async (ctx) => {
  ctx.logger.info('Step 4 placeholder: 点击淘宝-我的商品-上传商品-选择发布相似品，上传1:1主图');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤5：宝贝标题-商品分类
export const step5: StepHandler = async (ctx) => {
  ctx.logger.info('Step 5 placeholder: 宝贝标题-商品分类');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤6：品牌上传
export const step6: StepHandler = async (ctx) => {
  ctx.logger.info('Step 6 placeholder: 品牌上传');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤7：货号、适用对象
export const step7: StepHandler = async (ctx) => {
  ctx.logger.info('Step 7 placeholder: 货号、适用对象');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤8：颜色填写
export const step8: StepHandler = async (ctx) => {
  ctx.logger.info('Step 8 placeholder: 颜色填写');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤9：尺码
export const step9: StepHandler = async (ctx) => {
  ctx.logger.info('Step 9 placeholder: 尺码');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤10：价格和商品id
export const step10: StepHandler = async (ctx) => {
  ctx.logger.info('Step 10 placeholder: 价格和商品id');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤11：3:4主图
export const step11: StepHandler = async (ctx) => {
  ctx.logger.info('Step 11 placeholder: 3:4主图');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤12：模版处理
export const step12: StepHandler = async (ctx) => {
  ctx.logger.info('Step 12 placeholder: 模版处理');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤13：最后一步
export const step13: StepHandler = async (ctx) => {
  ctx.logger.info('Step 13 placeholder: 最后一步');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤14：提交商品
export const step14: StepHandler = async (ctx) => {
  ctx.logger.info('Step 14 placeholder: 提交商品');
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 步骤注册表
export const steps: Record<StepId, StepHandler> = {
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