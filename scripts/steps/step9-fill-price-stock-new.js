const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤9：填写价格、数量和商家编码
 * 简化版实现，使用 Playwright 语义化选择器
 */
const step9PriceStock = async (ctx) => {
  ctx.logger.info('开始填写价格、数量和商家编码');

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
    const basePrice = productData.basePrice || productData.price || 0;
    const baseStock = productData.baseStock || 3; // 默认数量为3

    ctx.logger.info('\n========== 填写价格、数量和商家编码 ==========');
    ctx.logger.info(`价格: ${basePrice}`);
    ctx.logger.info(`数量: ${baseStock} (固定)`);
    ctx.logger.info(`商家编码: ${productId}`);

    // ==================== 第一部分：定位设置价格库存区域 ====================
    ctx.logger.info('\n[步骤1] 定位设置价格库存区域');

    // 尝试点击"设置价格库存"按钮打开配置区域
    try {
      const priceStockButton = page.getByRole('button', { name: /设置价格库存|价格设置/ });
      const buttonVisible = await priceStockButton.isVisible().catch(() => false);
      if (buttonVisible) {
        await priceStockButton.click();
        await page.waitForTimeout(1000);
        ctx.logger.info('  ✅ 已打开价格库存配置区域');
      }
    } catch (e) {
      ctx.logger.info('  ℹ️ 价格库存配置区域已展开或无需点击');
    }

    // ==================== 第二部分：矩阵模式逐行填写价格/数量 ====================
    ctx.logger.info('\n[步骤2] 填写价格/数量（优先逐行）');

    const skuTable = await page.$('.sku-table, table.sku-matrix');
    if (skuTable) {
      ctx.logger.info('  检测到 SKU 矩阵，逐行填写价格与数量');
      const rows = await skuTable.$$('[data-sku-id], tr.sku-row');
      ctx.logger.info(`  共 ${rows.length} 行`);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // 行内价格
        const priceSelectors = [
          'input[id*="skuPrice"]',
          'input[name*="skuPrice"]',
          'input[placeholder*="价格"]',
          'input[name*="price"]'
        ];
        let priceInput = null;
        for (const sel of priceSelectors) {
          const cand = row.locator(sel).first();
          if (await cand.isVisible({ timeout: 300 }).catch(() => false)) {
            const ok = await cand.evaluate((el) => {
              const inBatch = el.closest('.batch-select') || el.closest('.batch-fill') || el.closest('.batch');
              return !inBatch;
            }).catch(() => false);
            if (!ok) continue;
            priceInput = cand;
            break;
          }
        }
        if (priceInput) {
          await priceInput.scrollIntoViewIfNeeded().catch(() => {});
          await priceInput.click();
          await page.keyboard.press('Control+a');
          await priceInput.fill(String(basePrice));
        } else {
          ctx.logger.warn(`  ⚠️ 第${i + 1}行未找到价格输入框`);
        }

        // 行内数量
        const stockSelectors = [
          'input[id*="skuStock"]',
          'input[name*="skuStock"]',
          'input[placeholder*="库存"]',
          'input[name*="stock"]',
          'input[placeholder*="数量"]'
        ];
        let stockInput = null;
        for (const sel of stockSelectors) {
          const cand = row.locator(sel).first();
          if (await cand.isVisible({ timeout: 300 }).catch(() => false)) {
            const ok = await cand.evaluate((el) => {
              const inBatch = el.closest('.batch-select') || el.closest('.batch-fill') || el.closest('.batch');
              return !inBatch;
            }).catch(() => false);
            if (!ok) continue;
            stockInput = cand;
            break;
          }
        }
        if (stockInput) {
          await stockInput.scrollIntoViewIfNeeded().catch(() => {});
          await stockInput.click();
          await page.keyboard.press('Control+a');
          await stockInput.fill(String(baseStock));
        } else {
          ctx.logger.warn(`  ⚠️ 第${i + 1}行未找到数量输入框`);
        }

        await page.waitForTimeout(150);
      }

      ctx.logger.info('  ✅ 已逐行填写价格和数量');
    } else {
      // ==================== 无矩阵时：使用批量栏 ====================
      ctx.logger.info('  未检测到 SKU 矩阵，使用批量栏填写');
      const priceInput = page.getByRole('textbox', { name: '价格' });
      await priceInput.click();
      await page.waitForTimeout(300);
      await priceInput.clear();
      await priceInput.fill(String(basePrice));
      await page.waitForTimeout(500);
      ctx.logger.info(`  ✅ 价格已填写: ${basePrice}`);

      const quantityInput = page.getByRole('textbox', { name: '数量' });
      await quantityInput.click();
      await page.waitForTimeout(300);
      await quantityInput.clear();
      await quantityInput.fill(String(baseStock));
      await page.waitForTimeout(500);
      ctx.logger.info(`  ✅ 数量已填写: ${baseStock}`);

      try {
        await page.getByRole('button', { name: '批量填写' }).click();
        await page.waitForTimeout(800);
        ctx.logger.info('  ✅ 价格和数量已批量应用到所有SKU');
      } catch (e) {
        ctx.logger.warn(`  ⚠️ 批量填写按钮点击失败: ${e.message}`);
      }
    }

    // ==================== 第三部分：填写商家编码 ====================
    ctx.logger.info('\n[步骤3] 填写商家编码');

    // 5.1 点击商家编码区域
    try {
      await page.getByText(/商家编码\d+\//).click();
      await page.waitForTimeout(500);

      // 5.2 定位输入框并填入商品ID
      const merchantCodeInput = page.locator('.next-input.next-focus > input');
      await merchantCodeInput.click();
      await page.waitForTimeout(300);
      await merchantCodeInput.clear();
      await merchantCodeInput.fill(productId);
      await page.waitForTimeout(500);

      ctx.logger.info(`  ✅ 商家编码已填写: ${productId}`);
    } catch (e) {
      ctx.logger.warn(`  ⚠️ 商家编码填写失败，可能需要手动填写: ${e.message}`);
    }

    // ==================== 第六部分：保存结果 ====================
    ctx.logger.info('\n[步骤6] 保存结果');

    // 计算 SKU 信息
    const colors = productData.colors || [];
    const sizes = productData.sizes || [];
    const totalSKUs = colors.length * sizes.length || 1;
    const totalValue = basePrice * baseStock * totalSKUs;

    // 更新缓存
    taskCache.priceStockResults = {
      basePrice: basePrice,
      baseStock: baseStock,
      merchantCode: productId,
      totalSKUs: totalSKUs,
      totalValue: totalValue,
      mode: 'batch', // 批量填写模式
      timestamp: new Date().toISOString()
    };

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n========== 价格、数量和商家编码填写完成 ==========');
    ctx.logger.info(`配置模式: 批量填写`);
    ctx.logger.info(`基础价格: ¥${basePrice}`);
    ctx.logger.info(`基础数量: ${baseStock}`);
    ctx.logger.info(`商家编码: ${productId}`);
    ctx.logger.info(`SKU总数: ${totalSKUs}`);
    ctx.logger.info(`预期总价值: ¥${totalValue.toLocaleString()}`);
    ctx.logger.info('\n✅ Step9 价格库存填写完成，可继续到 Step10 裁剪3:4主图');

  } catch (error) {
    ctx.logger.error(`❌ 价格库存配置失败: ${error.message}`);

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

module.exports = { step9PriceStock };
