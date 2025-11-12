const { feishuClient } = require('../feishu/client');
const { saveTaskCache, updateStepStatus } = require('../utils/cache');
const { checkProductExists } = require('../utils/taobao-check');
const fs = require('fs');
const path = require('path');

// 辅助函数：安全地构建更新数据，只包含存在的字段
function buildUpdateData(fields) {
  const updateData = {};

  Object.entries(fields).forEach(([envKey, value]) => {
    const fieldValue = process.env[envKey];
    // 检查环境变量存在且不是注释（不以#开头）
    if (fieldValue && !fieldValue.startsWith('#')) {
      updateData[fieldValue] = value;
    }
  });

  return updateData;
}

/**
 * 步骤0：任务初始化
 * 从飞书获取待发布商品数据
 */
const step0 = async (ctx) => {
  ctx.logger.info('开始从飞书获取待发布商品数据');

  try {
    // 批量预处理：将所有空状态记录更新为"待检测"
    await scanAndMarkPending(ctx);
    // 检查是否已从命令行参数指定了商品ID
    if (ctx.productId) {
      ctx.logger.info(`使用指定商品ID: ${ctx.productId}`);

      // 获取所有记录
      const allRecords = await feishuClient.getAllRecords();

      // 查找匹配的记录
      const record = allRecords.find(r => {
        const productId = r.fields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'];
        // 处理商品ID可能是字符串或数组的情况
        if (Array.isArray(productId)) {
          return productId.includes(ctx.productId);
        } else {
          return productId === ctx.productId;
        }
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
        const updateData = buildUpdateData({
          FEISHU_STATUS_FIELD: process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败',
          FEISHU_ERROR_LOG_FIELD: `步骤0失败: ${error.message}`
        });
        await feishuClient.updateRecord(ctx.feishuRecordId, updateData);
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
    const errorData = buildUpdateData({
      FEISHU_STATUS_FIELD: process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败',
      FEISHU_ERROR_LOG_FIELD: `缺少必填字段: ${validation.missingFields.join(', ')}`
    });
    await feishuClient.updateRecord(record_id, errorData);

    throw new Error(`缺少必填字段: ${validation.missingFields.join(', ')}`);
  }

  // 获取商品数据
  const productIdField = fields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'];
  const productId = Array.isArray(productIdField) ? productIdField[0] : productIdField;

  // 获取当前状态
  const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
  let currentStatus = fields[statusField];

  // 定义所有有效状态
  const checkingValue = process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测';
  const pendingValue = process.env.FEISHU_STATUS_PENDING_VALUE || '待上传';
  const doneValue = process.env.FEISHU_STATUS_DONE_VALUE || '已上传到淘宝';
  const errorValue = process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败';

  // 所有可能的有效状态
  const validStatuses = [checkingValue, pendingValue, doneValue, errorValue, ''];

  // 强制执行状态规则：如果状态不是有效值之一，立即更新为"待检测"
  if (!validStatuses.includes(currentStatus)) {
    ctx.logger.warn(`⚠️ 检测到无效状态"${currentStatus}"，强制更新为"${checkingValue}"`);
    await feishuClient.updateRecord(record_id, {
      [statusField]: checkingValue
    });
    currentStatus = checkingValue;
  }

  // 临时强制执行查重（用于测试）
  ctx.logger.info(`🔍 强制执行查重测试（当前状态: ${currentStatus}）...`);

  // 立即执行查重
  try {
    // 检查商品是否已存在
    const exists = await checkProductExists(productId);

    if (exists) {
      // 商品已存在，更新状态为"已上传到淘宝"
      ctx.logger.info(`✅ 商品 ${productId} 已存在于淘宝，更新状态为"${doneValue}"`);
      await feishuClient.updateRecord(record_id, {
        [statusField]: doneValue
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
      [statusField]: errorValue
    });
    throw new Error(`查重失败: ${checkError.message}`);
  }

  /*
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
          [statusField]: doneValue
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
      const errorData = buildUpdateData({
        FEISHU_STATUS_FIELD: errorValue,
        FEISHU_ERROR_LOG_FIELD: `查重失败: ${checkError.message}`
      });
      await feishuClient.updateRecord(record_id, errorData);
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
          [statusField]: doneValue
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
      const errorData = buildUpdateData({
        FEISHU_STATUS_FIELD: errorValue,
        FEISHU_ERROR_LOG_FIELD: `查重失败: ${checkError.message}`
      });
      await feishuClient.updateRecord(record_id, errorData);
      throw new Error(`查重失败: ${checkError.message}`);
    }
  }
  */

  // 状态不是"待上传"，则跳过处理
  if (currentStatus !== pendingValue) {
    ctx.logger.info(`当前状态为"${currentStatus}"，跳过处理`);
    return;
  }

  // 更新状态为"处理中"（直接使用"待上传"）
  await feishuClient.updateRecord(record_id, {
    [statusField]: pendingValue
  });

  // 辅助函数：获取字段值（处理数组和字符串）
  const getFieldValue = (fields, fieldName, defaultValue = '') => {
    const value = fields[fieldName];
    if (Array.isArray(value)) {
      return value[0] || defaultValue;
    } else if (typeof value === 'string') {
      // 处理换行符分隔的值（如颜色、尺码）
      return value.includes('\n') ? value.split('\n') : value;
    }
    return value || defaultValue;
  };

  // 专门处理图片URL字段
  const getImageUrls = (fields, fieldName) => {
    const value = fields[fieldName];
    if (Array.isArray(value)) {
      return value;
    } else if (typeof value === 'string') {
      // 图片URL通常用换行分隔
      return value.split('\n').filter(url => url.trim());
    }
    return [];
  };

  // 处理多值字段（如颜色、尺码）
  const getMultiValueField = (fields, fieldName) => {
    const value = fields[fieldName];
    if (Array.isArray(value)) {
      return value;
    } else if (typeof value === 'string') {
      return value.split('\n').filter(v => v.trim());
    }
    return [];
  };

  const productData = {
    productId,
    feishuRecordId: record_id,
    brand: getFieldValue(fields, process.env.FEISHU_BRAND_FIELD || '品牌名'),
    titleCN: getFieldValue(fields, process.env.FEISHU_TITLE_FIELD || '商品标题'),
    titleJP: getFieldValue(fields, process.env.FEISHU_JP_TITLE_FIELD || '日文标题'),
    descriptionCN: getFieldValue(fields, process.env.FEISHU_DESCRIPTION_CN_FIELD || '卖点'),
    descriptionJP: getFieldValue(fields, process.env.FEISHU_DESCRIPTION_JP_FIELD || '卖点_日文'),
    detailCN: getFieldValue(fields, process.env.FEISHU_DETAIL_CN_FIELD || '详情页文字'),
    detailJP: getFieldValue(fields, process.env.FEISHU_DETAIL_JP_FIELD || '详情页文字_日文'),
    price: getFieldValue(fields, process.env.FEISHU_PRICE_FIELD || '价格'),
    images: getImageUrls(fields, process.env.FEISHU_IMAGE_FIELD || '图片URL'),
    colors: getMultiValueField(fields, process.env.FEISHU_COLOR_FIELD || '颜色'),
    sizes: getMultiValueField(fields, process.env.FEISHU_SIZE_FIELD || '尺码')
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
  const clearErrorData = buildUpdateData({
    FEISHU_ERROR_LOG_FIELD: ''
  });
  if (Object.keys(clearErrorData).length > 0) {
    await feishuClient.updateRecord(record_id, clearErrorData);
  }
}

/**
 * 批量扫描并标记空状态记录为"待检测"
 * @param {Object} ctx - 上下文对象
 */
async function scanAndMarkPending(ctx) {
  ctx.logger.info('🔍 开始扫描空状态的记录...');

  try {
    // 获取所有记录
    const allRecords = await feishuClient.getAllRecords();
    const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
    const checkingValue = process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测';

    // 筛选出需要处理的记录（空状态或无效状态）
    const validStatuses = [
      process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测',
      process.env.FEISHU_STATUS_PENDING_VALUE || '待上传',
      process.env.FEISHU_STATUS_DONE_VALUE || '已上传到淘宝',
      process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败',
      ''
    ];

    const emptyRecords = allRecords.filter(record => {
      const status = record.fields[statusField];
      return !status || status === '' || !validStatuses.includes(status);
    });

    if (emptyRecords.length === 0) {
      ctx.logger.info('✅ 没有空状态的记录需要处理');
      return;
    }

    ctx.logger.info(`找到 ${emptyRecords.length} 条空状态记录，开始批量更新为"${checkingValue}"...`);

    // 准备批量更新的数据
    const updateRecords = emptyRecords.map(record => ({
      record_id: record.record_id,
      fields: {
        [statusField]: checkingValue
      }
    }));

    // 执行批量更新
    const response = await feishuClient.batchUpdateRecords(updateRecords);

    if (response && response.code === 0) {
      ctx.logger.success(`✅ 成功更新 ${emptyRecords.length} 条记录为"${checkingValue}"状态`);

      // 显示更新的商品ID
      const updatedIds = emptyRecords.map(r => {
        const pid = r.fields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'];
        return Array.isArray(pid) ? pid[0] : pid;
      }).filter(Boolean);

      ctx.logger.info(`更新商品ID列表: ${updatedIds.join(', ')}`);
    } else {
      ctx.logger.info(`⚠️ 批量更新部分失败，请检查日志`);
    }

  } catch (error) {
    ctx.logger.error(`批量更新失败: ${error.message}`);
    // 不抛出错误，允许主流程继续
  }
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

/**
 * 批量处理多个商品（共享浏览器上下文）
 * @param {string[]} productIds - 商品ID列表
 */
async function runBatch(productIds) {
  const { createStepLogger } = require('../utils/logger');

  console.log(`\n📦 开始批量处理 ${productIds.length} 个商品...`);

  // 创建批量处理的日志记录器
  const batchLogger = {
    info: (msg) => console.log(`[BATCH] ${msg}`),
    success: (msg) => console.log(`[BATCH] ✅ ${msg}`),
    error: (msg) => console.log(`[BATCH] ❌ ${msg}`),
    warn: (msg) => console.log(`[BATCH] ⚠️ ${msg}`)
  };

  // 共享一次飞书扫描（只扫描待检测的记录）
  batchLogger.info('开始扫描飞书表格（仅待检测记录）...');
  const allRecords = await feishuClient.getAllRecords();
  batchLogger.success(`获取到 ${allRecords.length} 条待检测记录`);

  // 初始化浏览器管理器（共享浏览器上下文）
  const browserManager = require('../utils/browser-manager');

  try {
    // 获取浏览器管理器（这会确保浏览器已启动）
    batchLogger.info('浏览器已准备就绪');
  } catch (error) {
    batchLogger.error(`浏览器初始化失败: ${error.message}`);
    throw error;
  }

  // 批量处理结果统计
  const results = [];

  // 循环处理每个商品
  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${i + 1}/${productIds.length}] 处理商品: ${productId}`);
    console.log(`${'='.repeat(80)}`);

    try {
      // 查找对应的记录
      const record = allRecords.find(r => {
        const pid = r.fields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'];
        if (Array.isArray(pid)) {
          return pid.includes(productId);
        } else {
          return pid === productId;
        }
      });

      if (!record) {
        batchLogger.error(`未找到商品 ${productId} 的待检测记录（该商品可能不是待检测状态）`);
        results.push({
          productId,
          success: false,
          error: '未找到待检测记录',
          status: null
        });
        continue;
      }

      // 创建单个商品的上下文
      const ctx = {
        productId,
        feishuRecordId: record.record_id,
        logger: {
          info: (msg) => console.log(`  [${productId}] ${msg}`),
          success: (msg) => console.log(`  [${productId}] ✅ ${msg}`),
          error: (msg) => console.log(`  [${productId}] ❌ ${msg}`),
          warn: (msg) => console.log(`  [${productId}] ⚠️ ${msg}`)
        }
      };

      // 执行查重检查（复用现有逻辑，但不关闭浏览器）
      await checkProductExistsAndUpdateStatus(record, ctx);

      results.push({
        productId,
        success: true,
        error: null,
        status: 'processed'
      });

      // 添加短暂延迟，避免操作过快
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`  [${productId}] 处理失败: ${error.message}`);
      results.push({
        productId,
        success: false,
        error: error.message,
        status: null
      });

      // 发生异常时继续下一个
      continue;
    }
  }

  // 输出批量处理结果摘要
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 批量处理结果摘要');
  console.log(`${'='.repeat(80)}`);

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;

  console.log(`总计: ${results.length} 个商品`);
  console.log(`成功: ${successCount} 个`);
  console.log(`失败: ${failureCount} 个`);

  if (failureCount > 0) {
    console.log('\n失败列表:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  - ${r.productId}: ${r.error}`);
      });
  }

  console.log('\n🎉 批量处理完成！');

  // 在开发模式下保持浏览器打开
  if (process.env.NODE_ENV === 'development') {
    console.log('\n📌 开发模式：保持浏览器窗口打开，按 Ctrl+C 退出');
  } else {
    // 生产模式下可以选择关闭浏览器
    // await browserManager.close();
  }
}

/**
 * 检查商品存在并更新状态（从主逻辑中提取，避免重复初始化）
 */
async function checkProductExistsAndUpdateStatus(record, ctx) {
  const { fields } = record;
  const productIdField = fields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'];
  const productId = Array.isArray(productIdField) ? productIdField[0] : productIdField;

  // 获取当前状态
  const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
  const checkingValue = process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测';
  const pendingValue = process.env.FEISHU_STATUS_PENDING_VALUE || '待上传';
  const doneValue = process.env.FEISHU_STATUS_DONE_VALUE || '已上传到淘宝';
  const errorValue = process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败';

  // 强制执行查重
  ctx.logger.info(`开始查重检查...`);

  try {
    // 检查商品是否已存在
    const exists = await checkProductExists(productId);

    if (exists) {
      // 商品已存在，更新状态为"已上传到淘宝"
      ctx.logger.success(`商品 ${productId} 已存在于淘宝，更新状态为"${doneValue}"`);
      await feishuClient.updateRecord(record.record_id, {
        [statusField]: doneValue
      });

      // 更新步骤状态
      updateStepStatus(productId, 0, 'done');
    } else {
      // 商品不存在，更新状态为"待上传"
      ctx.logger.info(`商品 ${productId} 不存在于淘宝，更新状态为"${pendingValue}"`);
      await feishuClient.updateRecord(record.record_id, {
        [statusField]: pendingValue
      });
    }

  } catch (checkError) {
    // 查重异常，更新错误状态
    ctx.logger.error(`查重失败: ${checkError.message}`);
    await feishuClient.updateRecord(record.record_id, {
      [statusField]: errorValue
    });
    throw new Error(`查重失败: ${checkError.message}`);
  }
}

module.exports = { step0, runBatch };