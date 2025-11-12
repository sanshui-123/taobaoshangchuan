const { feishuClient } = require('../feishu/client');
const { saveTaskCache, updateStepStatus } = require('../utils/cache');
const { checkProductExists } = require('../utils/taobao-check');
const fs = require('fs');
const path = require('path');

/**
 * 步骤0：任务初始化
 * 从飞书获取待发布商品数据
 */
const step0 = async (ctx) => {
  ctx.logger.info('开始从飞书获取待发布商品数据');

  try {
    // 检查是否已从命令行参数指定了商品ID
    if (ctx.productId) {
      ctx.logger.info(`使用指定商品ID: ${ctx.productId}`);

      // 获取所有记录
      const allRecords = await feishuClient.getAllRecords();

      // 查找匹配的记录
      const record = allRecords.find(r => {
        const productId = r.fields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'];
        return productId && productId[0] === ctx.productId;
      });

      if (!record) {
        throw new Error(`未找到商品ID为 ${ctx.productId} 的记录`);
      }

      await processRecord(record, ctx);
    } else {
      // 获取所有待发布记录
      const records = await feishuClient.getAllRecords();
      ctx.logger.info(`找到 ${records.length} 条待发布记录`);

      if (records.length === 0) {
        ctx.logger.info('没有待发布的商品');
        return;
      }

      // 处理第一条记录
      const record = records[0];
      await processRecord(record, ctx);
    }

    // 更新步骤状态为完成
    updateStepStatus(ctx.productId, 0, 'done');
    ctx.logger.success('任务初始化完成');

  } catch (error) {
    ctx.logger.error(`任务初始化失败: ${error.message}`);

    // 如果有recordId，更新飞书状态
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_STATUS_FIELD || '上传状态']: process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败',
          [process.env.FEISHU_ERROR_LOG_FIELD || '错误日志']: `步骤0失败: ${error.message}`
        });
      } catch (updateError) {
        ctx.logger.error(`更新飞书状态失败: ${updateError.message}`);
      }
    }

    throw error;
  }
};

/**
 * 处理单条记录
 */
async function processRecord(record, ctx) {
  const { record_id, fields } = record;
  ctx.feishuRecordId = record_id;

  // 验证必填字段
  const validation = feishuClient.validateRequiredFields(fields);

  if (!validation.isValid) {
    ctx.logger.error(`缺少必填字段: ${validation.missingFields.join(', ')}`);

    // 更新飞书状态为错误
    await feishuClient.updateRecord(record_id, {
      [process.env.FEISHU_STATUS_FIELD || '上传状态']: process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败',
      [process.env.FEISHU_ERROR_LOG_FIELD || '错误日志']:
        `缺少必填字段: ${validation.missingFields.join(', ')}`
    });

    throw new Error(`缺少必填字段: ${validation.missingFields.join(', ')}`);
  }

  // 获取商品数据
  const productId = fields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'][0];

  // 获取当前状态
  const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
  const currentStatus = fields[statusField];
  const checkingValue = process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测';
  const pendingValue = process.env.FEISHU_STATUS_PENDING_VALUE || '待上传';
  const doneValue = process.env.FEISHU_STATUS_DONE_VALUE || '已上传到淘宝';
  const runningValue = process.env.FEISHU_STATUS_RUNNING_VALUE || '处理中';
  const errorValue = process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败';

  // 状态为空时，先更新为"待检测"，然后立即执行查重
  if (!currentStatus || currentStatus === '') {
    ctx.logger.info(`状态为空，更新为"${checkingValue}"并立即查重...`);
    await feishuClient.updateRecord(record_id, {
      [statusField]: checkingValue
    });

    // 更新本地状态变量
    currentStatus = checkingValue;

    // 立即执行查重
    ctx.logger.info(`状态为"${checkingValue}"，开始查重检查...`);

    try {
      // 检查商品是否已存在
      const exists = await checkProductExists(productId);

      if (exists) {
        // 商品已存在，更新状态为"已上传到淘宝"
        ctx.logger.info(`✅ 商品 ${productId} 已存在于淘宝，更新状态为"${doneValue}"`);
        await feishuClient.updateRecord(record_id, {
          [statusField]: doneValue,
          [process.env.FEISHU_DURATION_FIELD || '执行时长']: '0秒',
          [process.env.FEISHU_REPORT_FIELD || '报告文件']: `查重命中 - ${new Date().toLocaleString()}`
        });

        // 更新步骤状态并跳过后续步骤
        updateStepStatus(productId, 0, 'done');
        ctx.logger.success('✅ 商品已存在，跳过上传流程');
        return;
      } else {
        // 商品不存在，更新状态为"待上传"
        ctx.logger.info(`❌ 商品 ${productId} 不存在于淘宝，更新状态为"${pendingValue}"`);
        await feishuClient.updateRecord(record_id, {
          [statusField]: pendingValue
        });
        // 更新本地状态，继续处理
        currentStatus = pendingValue;
      }
    } catch (checkError) {
      // 查重异常，更新错误状态
      ctx.logger.error(`查重失败: ${checkError.message}`);
      await feishuClient.updateRecord(record_id, {
        [statusField]: errorValue,
        [process.env.FEISHU_ERROR_LOG_FIELD || '错误日志']: `查重失败: ${checkError.message}`
      });
      throw new Error(`查重失败: ${checkError.message}`);
    }
  }
  // 状态为"待检测"时，执行查重
  else if (currentStatus === checkingValue) {
    ctx.logger.info(`状态为"${checkingValue}"，开始查重检查...`);

    try {
      // 检查商品是否已存在
      const exists = await checkProductExists(productId);

      if (exists) {
        // 商品已存在，更新状态为"已上传到淘宝"
        ctx.logger.info(`✅ 商品 ${productId} 已存在于淘宝，更新状态为"${doneValue}"`);
        await feishuClient.updateRecord(record_id, {
          [statusField]: doneValue,
          [process.env.FEISHU_DURATION_FIELD || '执行时长']: '0秒',
          [process.env.FEISHU_REPORT_FIELD || '报告文件']: `查重命中 - ${new Date().toLocaleString()}`
        });

        // 更新步骤状态并跳过后续步骤
        updateStepStatus(productId, 0, 'done');
        ctx.logger.success('✅ 商品已存在，跳过上传流程');
        return;
      } else {
        // 商品不存在，更新状态为"待上传"
        ctx.logger.info(`❌ 商品 ${productId} 不存在于淘宝，更新状态为"${pendingValue}"`);
        await feishuClient.updateRecord(record_id, {
          [statusField]: pendingValue
        });
        // 更新本地状态，继续处理
        currentStatus = pendingValue;
      }
    } catch (checkError) {
      // 查重异常，更新错误状态
      ctx.logger.error(`查重失败: ${checkError.message}`);
      await feishuClient.updateRecord(record_id, {
        [statusField]: errorValue,
        [process.env.FEISHU_ERROR_LOG_FIELD || '错误日志']: `查重失败: ${checkError.message}`
      });
      throw new Error(`查重失败: ${checkError.message}`);
    }
  }

  // 状态不是"待上传"，则跳过处理
  if (currentStatus !== pendingValue) {
    ctx.logger.info(`当前状态为"${currentStatus}"，跳过处理`);
    return;
  }

  // 更新状态为"处理中"
  await feishuClient.updateRecord(record_id, {
    [statusField]: runningValue
  });

  const productData = {
    productId,
    feishuRecordId: record_id,
    brand: fields[process.env.FEISHU_BRAND_FIELD || '品牌'][0] || '',
    titleCN: fields[process.env.FEISHU_TITLE_CN_FIELD || '标题'][0] || '',
    titleJP: fields[process.env.FEISHU_TITLE_JP_FIELD || 'タイトル'][0] || '',
    descriptionCN: fields[process.env.FEISHU_DESCRIPTION_CN_FIELD || '卖点'][0] || '',
    descriptionJP: fields[process.env.FEISHU_DESCRIPTION_JP_FIELD || '卖点_日文'][0] || '',
    detailCN: fields[process.env.FEISHU_DETAIL_CN_FIELD || '详情页文字'][0] || '',
    detailJP: fields[process.env.FEISHU_DETAIL_JP_FIELD || '详情页文字_日文'][0] || '',
    price: fields[process.env.FEISHU_PRICE_FIELD || '价格'][0] || '',
    images: fields[process.env.FEISHU_IMAGE_FIELD || '图片'] || [],
    colors: fields[process.env.FEISHU_COLOR_FIELD || '颜色'] || [],
    sizes: fields[process.env.FEISHU_SIZE_FIELD || '尺码'] || []
  };

  ctx.logger.info(`商品ID: ${productId}`);
  ctx.logger.info(`品牌: ${productData.brand}`);
  ctx.logger.info(`标题: ${productData.titleCN.substring(0, 50)}...`);
  ctx.logger.info(`图片数量: ${productData.images.length}`);
  ctx.logger.info(`颜色数量: ${productData.colors.length}`);
  ctx.logger.info(`尺码数量: ${productData.sizes.length}`);

  // 保存到缓存
  const cacheData = {
    productId,
    feishuRecordId: record_id,
    createdAt: new Date().toISOString(),
    stepStatus: { 0: 'done' },
    productData,
    images: productData.images,
    colors: productData.colors,
    sizes: productData.sizes,
    processedAt: new Date().toISOString()
  };

  saveTaskCache(productId, cacheData);

  // 创建必要的目录
  const assetsDir = path.resolve(process.cwd(), 'assets', productId);
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // 为每个颜色创建目录
  for (const color of productData.colors) {
    const colorName = cleanFileName(color.text || color);
    const colorDir = path.join(assetsDir, colorName);
    if (!fs.existsSync(colorDir)) {
      fs.mkdirSync(colorDir, { recursive: true });
    }
  }

  // 清空错误日志
  await feishuClient.updateRecord(record_id, {
    [process.env.FEISHU_ERROR_LOG_FIELD || '错误日志']: ''
  });
}

/**
 * 清理文件名，移除非法字符
 */
function cleanFileName(name) {
  return name
    .replace(/[\\/:"*?<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}

module.exports = { step0 };