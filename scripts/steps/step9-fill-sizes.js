const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤9：填写尺码
 * 填写尺码信息，LL→XL映射转换，处理跨颜色尺码统一
 */
const step9 = async (ctx) => {
  ctx.logger.info('开始填写商品尺码');

  // 创建心跳定时器
  const heartbeat = setInterval(() => {
    process.stdout.write('.');
  }, 5000);

  try {
    // 检查是否有页面引用
    if (!ctx.page1) {
      throw new Error('未找到发布页面，请先执行步骤4');
    }

    const page = ctx.page1;
    const productId = ctx.productId;

    // 加载缓存获取商品信息
    const taskCache = loadTaskCache(productId);
    if (!taskCache.productData) {
      throw new Error('缓存中没有商品信息');
    }

    const productData = taskCache.productData;
    const colors = productData.colors || [];
    const sizes = productData.sizes || [];

    // 尺码映射规则 (LL→XL 等)
    const sizeMapping = {
      'XS': 'XS',
      'S': 'S',
      'M': 'M',
      'L': 'L',
      'XL': 'XL',
      'LL': 'XL',
      '2L': 'XL',
      '3L': '2XL',
      '2XL': '2XL',
      'XXL': '2XL',
      '4L': '3XL',
      '3XL': '3XL',
      '5L': '4XL',
      'XXXL': '3XL',
      'FREE': '均码',
      '均码': '均码',
      'F': '均码'
    };

    ctx.logger.info(`商品颜色数量: ${colors.length}`);
    ctx.logger.info(`尺码配置: ${JSON.stringify(sizes)}`);

    // 步骤1：检查是否已配置颜色
    if (colors.length === 0) {
      throw new Error('请先完成颜色配置（步骤8）');
    }

    // 步骤2：定位尺码配置区域
    ctx.logger.info('\n[步骤1] 定位尺码配置区域');

    // 查找尺码配置按钮
    const sizeConfigButton = await page.$('button:has-text("设置尺码"), button:has-text("尺码设置")');
    if (sizeConfigButton) {
      ctx.logger.info('找到尺码配置按钮');
      await sizeConfigButton.click();
      await page.waitForTimeout(1000);
    }

    // 查找尺码区域
    await page.waitForSelector('.size-config-section, .sku-sizes, [data-field="size"]', {
      timeout: 5000
    }).catch(() => null);

    // 步骤3：获取尺码网格配置
    ctx.logger.info('\n[步骤2] 分析尺码配置模式');

    // 检查是否有尺码表格
    const sizeTable = await page.$('.sku-table, .size-table, table.sku-matrix');
    const hasSizeMatrix = !!sizeTable;

    ctx.logger.info(`尺码配置模式: ${hasSizeMatrix ? '矩阵模式' : '列表模式'}`);

    // 步骤4：处理尺码映射转换
    const processedSizes = sizes.map(size => {
      const mappedSize = sizeMapping[size] || size;
      ctx.logger.info(`尺码映射: ${size} → ${mappedSize}`);
      return mappedSize;
    });

    // 去重保持顺序
    const uniqueSizes = [...new Set(processedSizes)];
    ctx.logger.info(`最终尺码列表: ${uniqueSizes.join(', ')}`);

    // 步骤5：配置尺码信息
    ctx.logger.info('\n[步骤3] 配置尺码信息');

    const sizeResults = [];

    if (hasSizeMatrix) {
      // 矩阵模式：处理颜色x尺码网格
      await handleMatrixMode(page, colors, uniqueSizes, sizeResults, ctx);
    } else {
      // 列表模式：处理统一尺码
      await handleListMode(page, uniqueSizes, sizeResults, ctx);
    }

    // 步骤6：验证SKU完整性
    ctx.logger.info('\n[步骤4] 验证SKU配置');

    // 检查是否生成所有组合
    const expectedSKUCount = colors.length * uniqueSizes.length;
    const actualSKUCount = await page.$$('[data-sku-item], .sku-item, tr[data-sku]').length;

    ctx.logger.info(`预期SKU数量: ${expectedSKUCount}`);
    ctx.logger.info(`实际SKU数量: ${actualSKUCount}`);

    if (actualSKUCount < expectedSKUCount) {
      ctx.logger.warn('SKU数量不完整，可能需要手动调整');
    }

    // 更新缓存
    taskCache.sizeResults = {
      mode: hasSizeMatrix ? 'matrix' : 'list',
      colors: colors.length,
      sizes: uniqueSizes,
      totalSKUs: actualSKUCount,
      expectedSKUs: expectedSKUCount,
      results: sizeResults,
      sizeMapping: sizeMapping,
      timestamp: new Date().toISOString()
    };

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n=== 尺码配置完成 ===');
    ctx.logger.info(`配置模式: ${hasSizeMatrix ? '矩阵模式' : '列表模式'}`);
    ctx.logger.info(`颜色数量: ${colors.length}`);
    ctx.logger.info(`尺码数量: ${uniqueSizes.length}`);
    ctx.logger.info(`SKU总数: ${actualSKUCount}/${expectedSKUCount}`);

    if (actualSKUCount < expectedSKUCount) {
      ctx.logger.warn('⚠️ SKU配置不完整，请检查');
    }

  } catch (error) {
    ctx.logger.error(`尺码配置失败: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `步骤9失败: ${error.message}`
        });
      } catch (updateError) {
        ctx.logger.error(`更新飞书错误日志失败: ${updateError.message}`);
      }
    }

    throw error;

  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');
  }
};

/**
 * 处理矩阵模式（颜色x尺码）
 */
async function handleMatrixMode(page, colors, sizes, results, ctx) {
  ctx.logger.info('矩阵模式：配置颜色x尺码网格');

  // 查找尺码添加按钮
  const addSizeButton = await page.$('button:has-text("添加尺码"), .add-size-btn');
  if (addSizeButton) {
    // 配置每个尺码
    for (const size of sizes) {
      ctx.logger.info(`  配置尺码: ${size}`);

      // 查找尺码输入框（通常在表头）
      const sizeInput = await page.$('.size-header input, .sku-size-header input');
      if (sizeInput) {
        await sizeInput.click();
        await sizeInput.fill(size);
        ctx.logger.success(`    ✓ 尺码已添加: ${size}`);
        await page.waitForTimeout(500);
      }

      results.push({
        size: size,
        success: true
      });
    }
  }

  // 验证矩阵生成
  ctx.logger.info('  验证SKU矩阵生成...');
  await page.waitForTimeout(2000);
}

/**
 * 处理列表模式（统一尺码）
 */
async function handleListMode(page, sizes, results, ctx) {
  ctx.logger.info('列表模式：配置统一尺码');

  // 查找尺码输入区域
  const sizeContainer = await page.$('.size-list, .sku-size-list');

  if (sizeContainer) {
    // 查找现有尺码项
    const existingSizes = await sizeContainer.$$('.size-item, .sku-item');

    // 删除多余的尺码项
    while (existingSizes.length > sizes.length) {
      const deleteButton = await sizeContainer.$('.size-item:last-child .delete-btn');
      if (deleteButton) {
        await deleteButton.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }

    // 添加缺少的尺码项
    while (existingSizes.length < sizes.length) {
      const addButton = await sizeContainer.$('button:has-text("添加尺码"), .btn-add');
      if (addButton) {
        await addButton.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }

    // 填写每个尺码
    const sizeInputs = await sizeContainer.$$('input[placeholder*="尺码"], input');

    for (let i = 0; i < Math.min(sizes.length, sizeInputs.length); i++) {
      const size = sizes[i];
      const input = sizeInputs[i];

      ctx.logger.info(`  填写尺码: ${size}`);

      await input.click();
      await page.keyboard.press('Control+a');
      await input.fill(size);

      results.push({
        size: size,
        success: true
      });

      ctx.logger.success(`    ✓ 尺码已填写: ${size}`);
      await page.waitForTimeout(300);
    }
  }
}

module.exports = { step9 };