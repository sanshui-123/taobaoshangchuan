const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤10：填写价格和库存
 * 填写商品价格和库存信息，支持SKU级别定价
 */
const step10 = async (ctx) => {
  ctx.logger.info('开始填写价格和库存');

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
    const basePrice = productData.basePrice || 0;
    const baseStock = productData.baseStock || 100;

    ctx.logger.info(`基础价格: ¥${basePrice}`);
    ctx.logger.info(`基础库存: ${baseStock}`);
    ctx.logger.info(`颜色数量: ${colors.length}`);
    ctx.logger.info(`尺码数量: ${sizes.length}`);

    // 步骤1：定位价格库存配置区域
    ctx.logger.info('\n[步骤1] 定位价格库存配置区域');

    // 查找价格库存配置按钮
    const priceStockButton = await page.$('button:has-text("设置价格库存"), button:has-text("价格设置")');
    if (priceStockButton) {
      ctx.logger.info('找到价格库存配置按钮');
      await priceStockButton.click();
      await page.waitForTimeout(1000);
    }

    // 等待价格库存区域加载
    await page.waitForSelector('.price-stock-section, .sku-price-stock, [data-field="price"]', {
      timeout: 5000
    }).catch(() => null);

    // 步骤2：填写统一价格和库存
    ctx.logger.info('\n[步骤2] 填写统一价格和库存');

    // 查找统一价格输入框（矩阵模式下会忽略，逐行填写）
    const unifiedPriceSelectors = [
      'input[placeholder*="统一价格"]',
      'input[name="unifiedPrice"]',
      '.unified-price input',
      '#unifiedPrice',
      '.price-input'
    ];

    let unifiedPriceInput = null;
    for (const selector of unifiedPriceSelectors) {
      unifiedPriceInput = await page.$(selector);
      if (unifiedPriceInput) {
        break;
      }
    }

    if (unifiedPriceInput) {
      await unifiedPriceInput.click();
      await page.keyboard.press('Control+a');
      await unifiedPriceInput.fill(String(basePrice));
      ctx.logger.success(`✅ 统一价格已填写: ¥${basePrice}`);
      await page.waitForTimeout(500);
    } else {
      ctx.logger.warn('未找到统一价格输入框，将逐个填写SKU价格');
    }

    // 查找统一库存输入框
    const unifiedStockSelectors = [
      'input[placeholder*="统一库存"]',
      'input[name="unifiedStock"]',
      '.unified-stock input',
      '#unifiedStock',
      '.stock-input'
    ];

    let unifiedStockInput = null;
    for (const selector of unifiedStockSelectors) {
      unifiedStockInput = await page.$(selector);
      if (unifiedStockInput) {
        break;
      }
    }

    if (unifiedStockInput) {
      await unifiedStockInput.click();
      await page.keyboard.press('Control+a');
      await unifiedStockInput.fill(String(baseStock));
      ctx.logger.success(`✅ 统一库存已填写: ${baseStock}`);
      await page.waitForTimeout(500);
    } else {
      ctx.logger.warn('未找到统一库存输入框，将逐个填写SKU库存');
    }

    // 步骤3：处理SKU级别定价（如果有）
    ctx.logger.info('\n[步骤3] 处理SKU级别配置');

    const priceResults = [];

    // 查找SKU表格
    const skuTable = await page.$('.sku-table, table.sku-matrix');
    if (skuTable) {
      // 矩阵模式下不使用“统一价格”输入，逐行填写，避免误将首行价格当作统一价格
      unifiedPriceInput = null;

      // 矩阵模式：逐个填写SKU价格和库存
      ctx.logger.info('矩阵模式：配置SKU级别价格和库存');

      const skuRows = await skuTable.$$('[data-sku-id], tr.sku-row');
      ctx.logger.info(`找到 ${skuRows.length} 个SKU行`);

      for (let i = 0; i < skuRows.length; i++) {
        const row = skuRows[i];

        // 获取SKU信息
        const skuInfo = await page.evaluate((row) => {
          const color = row.querySelector('[data-color], .sku-color')?.textContent?.trim();
          const size = row.querySelector('[data-size], .sku-size')?.textContent?.trim();
          return { color, size };
        }, row);

        ctx.logger.info(`  配置SKU: ${skuInfo.color || 'N/A'} / ${skuInfo.size || 'N/A'}`);

        // 查找价格输入框（限定在当前行，优先 skuPrice）
        let priceInput = null;
        const priceSelectors = [
          'input[id*="skuPrice"]',
          'input[name*="skuPrice"]',
          'input[placeholder*="价格"]',
          'input[name*="price"]'
        ];
        for (const sel of priceSelectors) {
          const candidate = row.locator(sel).first();
          if (await candidate.isVisible({ timeout: 300 }).catch(() => false)) {
            const ok = await candidate.evaluate((el) => {
              const id = (el.getAttribute('id') || '').toLowerCase();
              const name = (el.getAttribute('name') || '').toLowerCase();
              const inBatch = el.closest('.batch-select') || el.closest('.batch-fill') || el.closest('.batch');
              // 排除批量/统一输入区域
              if (inBatch) return false;
              // 行内价格通常 id/name 含 skuPrice，若不是也允许，但批量区已排除
              if (id === 'skuprice' || name === 'skuprice') return true;
              return true;
            }).catch(() => false);
            if (!ok) continue;
            priceInput = candidate;
            break;
          }
        }

        if (priceInput) {
          // 计算SKU价格（可添加溢价逻辑）
          let skuPrice = basePrice;

          // 例如：大尺码加价
          if (skuInfo.size && ['XL', '2XL', '3XL', '4XL'].includes(skuInfo.size)) {
            skuPrice += 10 * (['XL', '2XL', '3XL', '4XL'].indexOf(skuInfo.size) + 1);
          }

          await priceInput.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
          await priceInput.click();
          await page.keyboard.press('Control+a');
          await priceInput.fill(String(skuPrice));
          ctx.logger.info(`    ✓ 价格: ¥${skuPrice}`);
        } else {
          ctx.logger.warn('    ⚠️ 未找到当前行的价格输入框');
        }

        // 查找库存输入框
        let stockInput = null;
        const stockSelectors = [
          'input[id*="skuStock"]',
          'input[name*="skuStock"]',
          'input[placeholder*="库存"]',
          'input[name*="stock"]'
        ];
        for (const sel of stockSelectors) {
          const candidate = row.locator(sel).first();
          if (await candidate.isVisible({ timeout: 300 }).catch(() => false)) {
            const ok = await candidate.evaluate((el) => {
              const id = (el.getAttribute('id') || '').toLowerCase();
              const name = (el.getAttribute('name') || '').toLowerCase();
              const inBatch = el.closest('.batch-select') || el.closest('.batch-fill') || el.closest('.batch');
              if (inBatch) return false;
              if (id === 'skustock' || name === 'skustock') return true;
              return true;
            }).catch(() => false);
            if (!ok) continue;
            stockInput = candidate;
            break;
          }
        }

        if (stockInput && !unifiedStockInput) {
          // 计算SKU库存（可添加库存策略）
          let skuStock = baseStock;

          // 例如：热门尺码增加库存
          if (skuInfo.size && ['M', 'L', 'XL'].includes(skuInfo.size)) {
            skuStock = Math.floor(skuStock * 1.2);
          }

          await stockInput.click();
          await page.keyboard.press('Control+a');
          await stockInput.fill(String(skuStock));
          ctx.logger.info(`    ✓ 库存: ${skuStock}`);
        }

        priceResults.push({
          sku: skuInfo,
          price: basePrice,
          stock: baseStock,
          success: true
        });

        await page.waitForTimeout(200);
      }
    } else {
      // 列表模式：所有SKU统一配置
      ctx.logger.info('列表模式：使用统一价格和库存');
      priceResults.push({
        mode: 'unified',
        price: basePrice,
        stock: baseStock,
        success: true
      });
    }

    // 步骤4：设置价格区间（如果适用）
    ctx.logger.info('\n[步骤4] 设置价格区间');

    // 查找价格区间设置
    const priceRangeSection = await page.$('.price-range, .price-band');
    if (priceRangeSection) {
      const minPriceInput = await priceRangeSection.$('input[placeholder*="最低价"]');
      const maxPriceInput = await priceRangeSection.$('input[placeholder*="最高价"]');

      if (minPriceInput && maxPriceInput) {
        await minPriceInput.fill(String(Math.floor(basePrice * 0.8)));
        await maxPriceInput.fill(String(Math.ceil(basePrice * 1.2)));
        ctx.logger.info(`✅ 价格区间已设置: ¥${Math.floor(basePrice * 0.8)} - ¥${Math.ceil(basePrice * 1.2)}`);
      }
    }

    // 步骤5：设置库存预警
    ctx.logger.info('\n[步骤5] 设置库存预警');

    // 查找库存预警设置
    const stockAlertInput = await page.$('input[placeholder*="库存预警"], input[name*="stockAlert"]');
    if (stockAlertInput) {
      const alertValue = Math.floor(baseStock * 0.2); // 20%预警
      await stockAlertInput.fill(String(alertValue));
      ctx.logger.info(`✅ 库存预警已设置: ${alertValue}`);
    }

    // 步骤6：验证价格库存配置
    ctx.logger.info('\n[步骤6] 验证价格库存配置');

    // 检查是否有错误提示
    const errorMessages = await page.$$('[data-field="price"] .error-message, [data-field="stock"] .error-message');
    if (errorMessages.length > 0) {
      ctx.logger.warn('发现价格库存错误:');
      for (const error of errorMessages) {
        const errorText = await error.textContent();
        ctx.logger.warn(`  - ${errorText}`);
      }
    }

    // 计算总SKU数量和总价值
    const totalSKUs = priceResults.length;
    const totalValue = priceResults.reduce((sum, item) => sum + (item.price * item.stock), 0);

    ctx.logger.info(`总SKU数量: ${totalSKUs}`);
    ctx.logger.info(`预期总价值: ¥${totalValue.toLocaleString()}`);

    // 更新缓存
    taskCache.priceStockResults = {
      basePrice: basePrice,
      baseStock: baseStock,
      totalSKUs: totalSKUs,
      totalValue: totalValue,
      mode: skuTable ? 'individual' : 'unified',
      results: priceResults,
      timestamp: new Date().toISOString()
    };

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n=== 价格库存配置完成 ===');
    ctx.logger.info(`配置模式: ${skuTable ? 'SKU独立配置' : '统一配置'}`);
    ctx.logger.info(`基础价格: ¥${basePrice}`);
    ctx.logger.info(`基础库存: ${baseStock}`);
    ctx.logger.info(`SKU总数: ${totalSKUs}`);
    ctx.logger.info(`预期总价值: ¥${totalValue.toLocaleString()}`);

  } catch (error) {
    ctx.logger.error(`价格库存配置失败: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `步骤10失败: ${error.message}`
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

module.exports = { step10 };
