const { feishuClient } = require('../feishu/client');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
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

// 规范化商品ID（转字符串并去掉前导0）
const normalizeProductId = (id) => {
  if (id === undefined || id === null) return '';
  return String(id).trim().replace(/^0+/, '');
};

// 将后续步骤全部标记为 skipped，并持久化缓存
function markAllSkipped(productId) {
  const existing = loadTaskCache(productId) || {};
  const cache = {
    ...existing,
    productId,
    stepStatus: {}
  };
  // Step0 已完成，其余全部 skipped
  cache.stepStatus[0] = 'done';
  for (let i = 1; i <= 14; i++) {
    cache.stepStatus[i] = 'skipped';
  }
  saveTaskCache(productId, cache);
}

/**
 * 步骤0：任务初始化
 * 从飞书获取待发布商品数据
 */
const step0 = async (ctx) => {
  ctx.logger.info('开始从飞书获取待发布商品数据');

  try {
    const partialValue = process.env.FEISHU_STATUS_PARTIAL_VALUE || '前三步已更新';
    const skipPhaseARef = { value: false };

    // 批量预处理：将所有空状态记录更新为"待检测"
    await scanAndMarkPending(ctx);
    // 检查是否已从命令行参数指定了商品ID
    if (ctx.productId) {
      ctx.logger.info(`使用指定商品ID: ${ctx.productId}`);

      // 获取所有记录
      const allRecords = await feishuClient.getAllRecords({ allowDone: ctx.options?.allowDone });

      // 查找匹配的记录
      const record = allRecords.find(r => {
        const productId = r.fields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'];
        const targetId = normalizeProductId(ctx.productId);
        // 处理商品ID可能是字符串或数组的情况
        if (Array.isArray(productId)) {
          return productId.some(pid => normalizeProductId(pid) === targetId);
        } else {
          return normalizeProductId(productId) === targetId;
        }
      });

      if (!record) {
        throw new Error(`未找到商品ID为 ${ctx.productId} 的记录`);
      }

      await processRecord(record, ctx, { partialValue, skipPhaseARef });
    } else {
      // 获取所有待发布记录
      let records = await feishuClient.getAllRecords({ allowDone: ctx.options?.allowDone });
      ctx.logger.info(`找到 ${records.length} 条待发布记录`);

      // 根据品牌筛选
      const brandField = process.env.FEISHU_BRAND_FIELD || '品牌';
      if (ctx.options && ctx.options.brand) {
        const targetBrand = ctx.options.brand;
        records = records.filter(r => {
          const brandValue = r.fields[brandField];
          if (Array.isArray(brandValue)) {
            return brandValue.some(b => (b.text || b) === targetBrand);
          }
          return (brandValue?.text || brandValue) === targetBrand;
        });
        ctx.logger.info(`按品牌"${targetBrand}"筛选后剩余 ${records.length} 条记录`);
      }

      // 根据品类筛选
      const categoryField = process.env.FEISHU_CATEGORY_FIELD || '品类';
      if (ctx.options && ctx.options.category) {
        const targetCategory = ctx.options.category;
        records = records.filter(r => {
          const categoryValue = r.fields[categoryField];
          if (Array.isArray(categoryValue)) {
            return categoryValue.some(c => (c.text || c) === targetCategory);
          }
          return (categoryValue?.text || categoryValue) === targetCategory;
        });
        ctx.logger.info(`按品类"${targetCategory}"筛选后剩余 ${records.length} 条记录`);
      }

      // 根据性别筛选（包含性别为空的记录）
      const genderField = process.env.FEISHU_GENDER_FIELD || '性别';
      if (ctx.options && ctx.options.gender) {
        const targetGender = ctx.options.gender;
        records = records.filter(r => {
          const genderValue = r.fields[genderField];

          // 如果性别字段为空，也包含进来（待后续推断）
          if (!genderValue || (Array.isArray(genderValue) && genderValue.length === 0)) {
            return true;
          }

          if (Array.isArray(genderValue)) {
            return genderValue.some(g => (g.text || g) === targetGender);
          }
          return (genderValue?.text || genderValue) === targetGender;
        });
        ctx.logger.info(`按性别"${targetGender}"筛选后剩余 ${records.length} 条记录（包含性别为空的记录）`);
      }

      if (records.length === 0) {
        ctx.logger.info('没有待发布的商品');
        return;
      }

      // 优先处理"待检测"和"待上传"状态的商品
      const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
      const checkingValue = process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测';
      const pendingValue = process.env.FEISHU_STATUS_PENDING_VALUE || '待上传';

      // 按优先级排序：待检测 > 待上传 > 上传失败 > 其他
      const priorityOrder = [checkingValue, pendingValue];
      records.sort((a, b) => {
        const statusA = a.fields[statusField] || '';
        const statusB = b.fields[statusField] || '';
        const priorityA = priorityOrder.indexOf(statusA);
        const priorityB = priorityOrder.indexOf(statusB);

        // 如果都在优先级列表中，按优先级排序
        if (priorityA !== -1 && priorityB !== -1) {
          return priorityA - priorityB;
        }
        // 优先级列表中的排在前面
        if (priorityA !== -1) return -1;
        if (priorityB !== -1) return 1;
        // 都不在优先级列表中，保持原顺序
        return 0;
      });

      // 处理第一条记录（优先级最高的）
      const record = records[0];
      ctx.logger.info(`📊 当前记录状态: ${record.fields[statusField] || '(空)'}`);
      await processRecord(record, ctx, { partialValue, skipPhaseARef });
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
async function processRecord(record, ctx, opts = {}) {
  const {
    partialValue = process.env.FEISHU_STATUS_PARTIAL_VALUE || '前三步已更新',
    skipPhaseARef
  } = opts;
  // 本地标记，允许通过引用回传
  let skipPhaseA = skipPhaseARef ? skipPhaseARef.value : false;
  let skipPhaseAReason = '';
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

  // 回写商品ID到上下文（用于自动取单模式）
  ctx.productId = productId;
  ctx.logger.info(`已从飞书获取商品ID: ${productId}`);

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

  // ==================== 库存状态检查：都缺货直接跳过 ====================
  const stockStatusField = process.env.FEISHU_STOCK_STATUS_FIELD || '库存状态';
  const outOfStockValue = process.env.FEISHU_OUT_OF_STOCK_VALUE || '都缺货';
  const skipUploadValue = process.env.FEISHU_SKIP_UPLOAD_VALUE || '缺货无需上传';

  const stockStatus = fields[stockStatusField];

  if (stockStatus === outOfStockValue) {
    ctx.logger.warn(`📦 检测到库存状态为"${outOfStockValue}"，跳过上传流程`);

    // 更新飞书状态为"缺货无需上传"
    await feishuClient.updateRecord(record_id, {
      [statusField]: skipUploadValue
    });

    ctx.logger.info(`✅ 已更新状态为"${skipUploadValue}"，后续不会再处理此商品`);

    // 标记步骤完成并返回
    updateStepStatus(productId, 0, 'done');
    return;
  }

  // 根据当前状态决定是否执行查重/跳过前置
  if (currentStatus === partialValue) {
    ctx.logger.info(`🔄 检测到状态为"${partialValue}"，跳过前置步骤（1-3），继续后续流程`);
    skipPhaseA = true;
    skipPhaseAReason = '已标记前三步已更新';
    if (skipPhaseARef) skipPhaseARef.value = true;
    // 标记步骤状态
    updateStepStatus(productId, 1, 'skipped');
    updateStepStatus(productId, 2, 'skipped');
    updateStepStatus(productId, 3, 'skipped');
  } else if (currentStatus === checkingValue) {
    // 状态为"待检测"时，执行查重
    ctx.logger.info(`🔍 当前状态为"${checkingValue}"，执行查重检查...`);

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
  } else if (currentStatus === pendingValue) {
    // 状态为"待上传"时，跳过查重，直接进入处理流程
    ctx.logger.info(`📦 当前状态为"${pendingValue}"，跳过查重，直接进入上传流程...`);
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

  // 状态不是"待上传"、"前三步已更新"、"上传失败"，则跳过处理
  // 允许重试失败的商品
  if (currentStatus !== pendingValue && currentStatus !== partialValue && currentStatus !== errorValue) {
    ctx.logger.info(`当前状态为"${currentStatus}"，跳过处理`);
    // 将后续步骤全部标记为 skipped，避免后续误执行
    markAllSkipped(productId);
    ctx.logger.info('已将步骤1-14标记为 skipped');
    return;
  }

  // 更新状态为"处理中"（直接使用"待上传"），如果已经标记过前三步则保留原状态
  if (!skipPhaseA) {
    await feishuClient.updateRecord(record_id, {
      [statusField]: pendingValue
    });
  } else {
    ctx.logger.info(`保持状态为"${partialValue}"（跳过1-3步：${skipPhaseAReason || '已完成前置步骤'}）`);
  }

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

  // 读取性别/品类（如果存在）
  const genderValue = getFieldValue(fields, process.env.FEISHU_GENDER_FIELD || '适用性别');
  const categoryValue = getFieldValue(fields, process.env.FEISHU_CATEGORY_FIELD || '品类');

  const rawStock = getFieldValue(fields, process.env.FEISHU_STOCK_FIELD || '库存', '');
  const parsedStock = Number.parseInt(rawStock, 10);
  const baseStock = Number.isFinite(parsedStock) && parsedStock > 0 ? parsedStock : 3;

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
    basePrice: Number(getFieldValue(fields, process.env.FEISHU_PRICE_FIELD || '价格')) || getFieldValue(fields, process.env.FEISHU_PRICE_FIELD || '价格'),
    baseStock,
    category: categoryValue,
    gender: genderValue,
    images: getImageUrls(fields, process.env.FEISHU_IMAGE_FIELD || '图片URL'),
    colors: getMultiValueField(fields, process.env.FEISHU_COLOR_FIELD || '颜色'),
    sizes: getMultiValueField(fields, process.env.FEISHU_SIZE_FIELD || '尺码'),
    sizeTable: getFieldValue(fields, process.env.FEISHU_SIZE_TABLE_FIELD || '尺码表')
  };

  ctx.logger.info(`商品ID: ${productId}`);
  ctx.logger.info(`品牌: ${productData.brand}`);
  ctx.logger.info(`标题: ${productData.titleCN.substring(0, 50)}...`);
  ctx.logger.info(`图片数量: ${productData.images.length}`);
  ctx.logger.info(`颜色数量: ${productData.colors.length}`);
  ctx.logger.info(`尺码数量: ${productData.sizes.length}`);
  if (productData.category) {
    ctx.logger.info(`品类: ${productData.category}`);
  }
  if (productData.gender) {
    ctx.logger.info(`适用性别: ${productData.gender}`);
  }

  // 保存到缓存
  const cacheData = {
    productId,
    feishuRecordId: record_id,
    createdAt: new Date().toISOString(),
    skipPhaseA,
    stepStatus: {
      0: 'done',
      1: skipPhaseA ? 'skipped' : 'pending',
      2: skipPhaseA ? 'skipped' : 'pending',
      3: skipPhaseA ? 'skipped' : 'pending'
    },
    productData,
    images: productData.images,
    colors: productData.colors,
    sizes: productData.sizes,
    processedAt: new Date().toISOString()
  };

    // 如果通过引用传递，更新外部 skipPhaseA 标记，便于调用方知晓
    if (skipPhaseARef) {
      skipPhaseARef.value = skipPhaseA;
    }

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
    // 获取所有记录 - 传入空数组以获取所有记录，不进行过滤
    const response = await feishuClient.getRecords(1000, []);
    const allRecords = response.records || response.items || [];
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
    const updateResponse = await feishuClient.batchUpdateRecords(updateRecords);

    if (updateResponse && updateResponse.code === 0) {
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
  const { checkMultipleProductsExists } = require('../utils/taobao-check');

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

  // 执行批量查重检查
  console.log(`\n[BATCH] 开始批量查重检查 ${productIds.length} 个商品...`);
  const resultMap = await checkMultipleProductsExists(productIds);

  // 准备批量更新的数据
  const updateRecords = [];
  const successCount = resultMap.size;
  let existsCount = 0;
  let pendingCount = 0;

  // 遍历结果，准备更新数据
  for (const [productId, exists] of resultMap) {
    // 查找对应的记录
    const record = allRecords.find(r => {
      const pid = r.fields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'];
      const targetId = normalizeProductId(productId);
      if (Array.isArray(pid)) {
        return pid.some(item => normalizeProductId(item) === targetId);
      } else {
        return normalizeProductId(pid) === targetId;
      }
    });

    if (!record) {
      batchLogger.error(`未找到商品 ${productId} 的待检测记录`);
      continue;
    }

    const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
    const doneValue = process.env.FEISHU_STATUS_DONE_VALUE || '已上传到淘宝';
    const pendingValue = process.env.FEISHU_STATUS_PENDING_VALUE || '待上传';
    const errorValue = process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败';

    const newStatus = exists ? doneValue : pendingValue;

    updateRecords.push({
      record_id: record.record_id,
      fields: {
        [statusField]: newStatus
      }
    });

    if (exists) {
      existsCount++;

      // 为已存在的商品创建缓存并标记步骤状态
      const { loadTaskCache, saveTaskCache } = require('../utils/cache');
      const taskCache = loadTaskCache(productId);

      // 初始化步骤状态
      taskCache.stepStatus = {
        0: 'done',
        1: 'skipped',
        2: 'skipped',
        3: 'skipped',
        4: 'skipped',
        5: 'skipped',
        6: 'skipped',
        7: 'skipped',
        8: 'skipped',
        9: 'skipped',
        10: 'skipped',
        11: 'skipped',
        12: 'skipped',
        13: 'skipped',
        14: 'skipped'
      };

      // 添加完成时间
      taskCache.processedAt = new Date().toISOString();
      taskCache.note = '商品已存在于淘宝，跳过上传流程';

      saveTaskCache(productId, taskCache);
      batchLogger.info(`  已为 ${productId} 创建缓存并标记后续步骤为skipped`);
    } else {
      pendingCount++;
    }
  }

  // 执行批量更新
  if (updateRecords.length > 0) {
    batchLogger.info(`更新 ${updateRecords.length} 条记录到飞书...`);
    try {
      const response = await feishuClient.batchUpdateRecords(updateRecords);

      if (response && response.code === 0) {
        batchLogger.success(`✅ 成功更新 ${updateRecords.length} 条记录`);
        batchLogger.info(`📊 处理结果: 成功 ${successCount} 个, 已存在 ${existsCount} 个, 待上传 ${pendingCount} 个`);
      } else {
        batchLogger.error(`⚠️ 批量更新部分失败，请检查日志`);
      }
    } catch (error) {
      batchLogger.error(`批量更新失败: ${error.message}`);
    }
  }

  // 输出批量处理结果摘要
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 批量处理结果摘要');
  console.log(`${'='.repeat(80)}`);

  console.log(`总计: ${successCount} 个商品`);
  console.log(`已存在: ${existsCount} 个`);
  console.log(`待上传: ${pendingCount} 个`);

  // 详细结果列表（可选）
  if (process.env.verbose) {
    console.log('\n详细结果:');
    for (const [productId, exists] of resultMap) {
      const status = exists ? '✅ 已存在' : '❌ 不存在';
      console.log(`  ${productId}: ${status}`);
    }
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

      // 更新步骤状态并创建缓存
      updateStepStatus(productId, 0, 'done');

      // 创建完整的任务缓存，标记后续步骤为skipped
      const { saveTaskCache } = require('../utils/cache');
      saveTaskCache(productId, {
        productId,
        stepStatus: {
          0: 'done',
          1: 'skipped',
          2: 'skipped',
          3: 'skipped',
          4: 'skipped',
          5: 'skipped',
          6: 'skipped',
          7: 'skipped',
          8: 'skipped',
          9: 'skipped',
          10: 'skipped',
          11: 'skipped',
          12: 'skipped',
          13: 'skipped',
          14: 'skipped'
        },
        note: '商品已存在于淘宝，跳过上传流程',
        processedAt: new Date().toISOString()
      });
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
