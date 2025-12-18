const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤9：填写价格、数量和商家编码
 * 简化版实现，使用 Playwright 语义化选择器
 */
const step9PriceStock = async (ctx) => {
  ctx.logger.info('开始填写价格、数量和商家编码');

  // 输入节奏控制（避免写入太快导致页面未采集到 input/change）
  const TYPE_DELAY_MS = parseInt(process.env.TAOBAO_TYPE_DELAY_MS || '80', 10); // 单字符延迟
  const AFTER_TYPE_WAIT_MS = parseInt(process.env.TAOBAO_AFTER_TYPE_WAIT_MS || '300', 10); // 每个字段输入后等待
  const BETWEEN_FIELDS_WAIT_MS = parseInt(process.env.TAOBAO_BETWEEN_FIELDS_WAIT_MS || '200', 10); // 同一行字段间隔
  const BETWEEN_ROWS_WAIT_MS = parseInt(process.env.TAOBAO_BETWEEN_ROWS_WAIT_MS || '300', 10); // 行间隔
  const INPUT_RETRY = parseInt(process.env.TAOBAO_INPUT_RETRY || '2', 10); // 每个字段重试次数

  const pressSelectAll = async (page) => {
    // 兼容 Win/Linux/Mac，尽量都试一遍（不会报错就忽略）
    await page.keyboard.press('Control+a').catch(() => {});
    await page.keyboard.press('Meta+a').catch(() => {});
    await page.keyboard.press('Control+A').catch(() => {});
    await page.keyboard.press('Meta+A').catch(() => {});
  };

  const typeNumberSlowly = async (page, input, value, label, options = {}) => {
    const target = String(value ?? '').trim();
    if (!target) return false;
    const requireExact = options.requireExact !== false;
    const tolerance = typeof options.tolerance === 'number' ? options.tolerance : 0.01;

    for (let attempt = 1; attempt <= INPUT_RETRY + 1; attempt++) {
      try {
        await input.scrollIntoViewIfNeeded().catch(() => {});
        await input.click({ timeout: 3000 }).catch(async () => {
          await input.click({ force: true, timeout: 3000 }).catch(() => {});
        });

        await pressSelectAll(page);
        await page.keyboard.press('Backspace').catch(() => {});

        // 用 type + delay 模拟人工输入，降低“写入太快导致未采集”的概率
        await input.type(target, { delay: TYPE_DELAY_MS });
        await page.waitForTimeout(AFTER_TYPE_WAIT_MS);
        await page.keyboard.press('Tab').catch(() => {}); // 失焦触发采集/校验
        await page.waitForTimeout(AFTER_TYPE_WAIT_MS);

        const actualRaw = await input.inputValue().catch(() => '');
        const actualNum = parseFloat(String(actualRaw).replace(/,/g, '').trim());
        const expectedNum = parseFloat(String(target).replace(/,/g, '').trim());

        // 先确保不是 0/空（常见失败原因：输入太快未采集导致仍为0）
        if (Number.isFinite(expectedNum) && expectedNum > 0 && !(actualNum > 0)) {
          throw new Error(`写入后仍为0/空（actual="${actualRaw}"）`);
        }

        // 再做“接近值”校验（避免偶发写入失败导致仍是旧值）
        if (requireExact && Number.isFinite(expectedNum)) {
          if (!Number.isFinite(actualNum)) throw new Error(`写入后无法解析数值（actual="${actualRaw}"）`);
          if (Math.abs(actualNum - expectedNum) > tolerance) {
            throw new Error(`写入值不一致（expected=${expectedNum}, actual=${actualNum}, raw="${actualRaw}"）`);
          }
        }

        return true;
      } catch (e) {
        ctx.logger.warn(`  ⚠️ ${label} 输入失败（第${attempt}/${INPUT_RETRY + 1}次）: ${e.message}`);
        await page.waitForTimeout(250);
      }
    }

    return false;
  };

  const validateSkuInputs = async (skuRoot, field) => {
    const selectorsByField = {
      price: 'input[id*="skuPrice"], input[name*="skuPrice"], input[placeholder*="价格"], input[name*="price"]',
      stock: 'input[id*="skuStock"], input[name*="skuStock"], input[placeholder*="库存"], input[name*="stock"], input[placeholder*="数量"]'
    };
    const selector = selectorsByField[field];
    if (!selector) return { total: 0, zeroOrEmpty: 0 };

    const inputs = skuRoot.locator(selector);
    const count = await inputs.count().catch(() => 0);
    let total = 0;
    let zeroOrEmpty = 0;

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const visible = await input.isVisible({ timeout: 200 }).catch(() => false);
      if (!visible) continue;
      const enabled = await input.isEnabled().catch(() => false);
      if (!enabled) continue;

      const inBatch = await input.evaluate((el) => {
        return !!(el.closest('.batch-select') || el.closest('.batch-fill') || el.closest('.batch'));
      }).catch(() => false);
      if (inBatch) continue;

      total++;
      const v = await input.inputValue().catch(() => '');
      const n = parseFloat(String(v).replace(/,/g, '').trim());
      if (!v || !(n > 0)) zeroOrEmpty++;
    }

    return { total, zeroOrEmpty };
  };

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

    if (!basePrice || Number(basePrice) <= 0) {
      throw new Error(`基础价格为空/为0（basePrice=${basePrice}），请检查飞书/缓存数据后重试`);
    }

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

    const skuTable = page.locator('.sku-table, table.sku-matrix').first();
    const skuTableVisible = await skuTable.isVisible({ timeout: 1200 }).catch(() => false);

    const waitForSkuRowsStable = async (rowsLocator, timeoutMs = 8000) => {
      const start = Date.now();
      let last = -1;
      let stableHits = 0;
      while (Date.now() - start < timeoutMs) {
        const c = await rowsLocator.count().catch(() => 0);
        if (c > 0 && c === last) {
          stableHits++;
          if (stableHits >= 3) return c;
        } else {
          stableHits = 0;
          last = c;
        }
        await page.waitForTimeout(400);
      }
      return await rowsLocator.count().catch(() => 0);
    };

    let matrixFilled = false;
    if (skuTableVisible) {
      ctx.logger.info('  检测到 SKU 矩阵，逐行填写价格与数量');
      const rows = skuTable.locator('[data-sku-id], tr.sku-row');
      const rowCount = await waitForSkuRowsStable(rows, 8000);
      ctx.logger.info(`  共 ${rowCount} 行`);

      if (rowCount === 0) {
        ctx.logger.warn('  ⚠️ SKU 矩阵行数为0（可能还在加载/结构变化），切换为批量栏填写');
      } else {
      for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i);

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
          await typeNumberSlowly(page, priceInput, basePrice, `第${i + 1}行价格`, { tolerance: 0.01 });
        } else {
          ctx.logger.warn(`  ⚠️ 第${i + 1}行未找到价格输入框`);
        }

        await page.waitForTimeout(BETWEEN_FIELDS_WAIT_MS);

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
          await typeNumberSlowly(page, stockInput, baseStock, `第${i + 1}行数量`, { tolerance: 0 });
        } else {
          ctx.logger.warn(`  ⚠️ 第${i + 1}行未找到数量输入框`);
        }

        await page.waitForTimeout(BETWEEN_ROWS_WAIT_MS);
      }

      // 关键校验：避免提交时仍提示“价格为0元/库存为0”
      await page.waitForTimeout(800);
      const priceCheck = await validateSkuInputs(skuTable, 'price');
      const stockCheck = await validateSkuInputs(skuTable, 'stock');

      if (priceCheck.total > 0 && priceCheck.zeroOrEmpty > 0) {
        ctx.logger.warn(`  ⚠️ SKU 价格仍有 ${priceCheck.zeroOrEmpty}/${priceCheck.total} 个为0/空，准备再补写一遍（更慢）`);
        await page.waitForTimeout(800);
        for (let i = 0; i < rowCount; i++) {
          const row = rows.nth(i);
          const priceInput = row.locator('input[id*="skuPrice"], input[name*="skuPrice"], input[placeholder*="价格"], input[name*="price"]').first();
          if (await priceInput.isVisible({ timeout: 200 }).catch(() => false)) {
            await typeNumberSlowly(page, priceInput, basePrice, `第${i + 1}行价格(补写)`, { tolerance: 0.01 });
            await page.waitForTimeout(250);
          }
        }
      }

      await page.waitForTimeout(800);
      const priceCheck2 = await validateSkuInputs(skuTable, 'price');
      const stockCheck2 = await validateSkuInputs(skuTable, 'stock');
      ctx.logger.info(`  ✅ 价格校验: 0/空=${priceCheck2.zeroOrEmpty}/${priceCheck2.total} | 数量校验: 0/空=${stockCheck2.zeroOrEmpty}/${stockCheck2.total}`);

      if (priceCheck2.total > 0 && priceCheck2.zeroOrEmpty > 0) {
        throw new Error(`SKU 价格仍存在 0/空（${priceCheck2.zeroOrEmpty}/${priceCheck2.total}），已放慢输入但仍未生效`);
      }

      ctx.logger.info('  ✅ 已逐行填写价格和数量（含校验）');
      matrixFilled = true;
      }
    }

    if (!matrixFilled) {
      // ==================== 无矩阵时：使用批量栏 ====================
      ctx.logger.info('  未检测到 SKU 矩阵，使用批量栏填写');
      const priceInput = page.getByRole('textbox', { name: '价格' });
      await typeNumberSlowly(page, priceInput, basePrice, '批量价格', { tolerance: 0.01 });
      ctx.logger.info(`  ✅ 价格已填写: ${basePrice}`);

      const quantityInput = page.getByRole('textbox', { name: '数量' });
      await typeNumberSlowly(page, quantityInput, baseStock, '批量数量', { tolerance: 0 });
      ctx.logger.info(`  ✅ 数量已填写: ${baseStock}`);

      try {
        await page.getByRole('button', { name: '批量填写' }).click();
        await page.waitForTimeout(1200);
        ctx.logger.info('  ✅ 价格和数量已批量应用到所有SKU');
      } catch (e) {
        ctx.logger.warn(`  ⚠️ 批量填写按钮点击失败: ${e.message}`);
      }

      // 如果页面实际上存在 SKU 输入框，再做一次兜底校验
      await page.waitForTimeout(800);
      const fallbackSkuTable = page.locator('.sku-table, table.sku-matrix').first();
      const fallbackVisible = await fallbackSkuTable.isVisible({ timeout: 500 }).catch(() => false);
      if (fallbackVisible) {
        const priceCheck = await validateSkuInputs(fallbackSkuTable, 'price');
        if (priceCheck.total > 0 && priceCheck.zeroOrEmpty > 0) {
          throw new Error(`批量填写后仍有 SKU 价格为0/空（${priceCheck.zeroOrEmpty}/${priceCheck.total}），建议人工检查或重试 Step9`);
        }
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
    const fillMode = matrixFilled ? 'matrix' : 'batch';

    // 更新缓存
    taskCache.priceStockResults = {
      basePrice: basePrice,
      baseStock: baseStock,
      merchantCode: productId,
      totalSKUs: totalSKUs,
      totalValue: totalValue,
      mode: fillMode,
      timestamp: new Date().toISOString()
    };

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n========== 价格、数量和商家编码填写完成 ==========');
    ctx.logger.info(`配置模式: ${fillMode === 'matrix' ? '逐行填写' : '批量填写'}`);
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
