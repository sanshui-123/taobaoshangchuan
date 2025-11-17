const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');

/**
 * 步骤8：填写商品编码（两个位置）
 * 1. 销售信息 → 商家编码
 * 2. 基础信息 → 货号
 *
 * 两个位置都填写相同的商品ID
 */
const step7 = async (ctx) => {
  ctx.logger.info('开始填写商品编码（商家编码+货号）');

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

    ctx.logger.info(`商品ID: ${productId}`);

    // ============================================
    // 步骤1：切换到"销售信息"tab
    // ============================================
    ctx.logger.info('\n[步骤1] 切换到"销售信息"tab');

    const salesTabSelectors = [
      'li.next-menu-item:has-text("销售信息")',
      'li.next-nav-item:has-text("销售信息")',
      '.next-menu-item:has-text("销售信息")',
      '[role="option"]:has-text("销售信息")'
    ];

    let salesTab = null;
    for (const selector of salesTabSelectors) {
      try {
        salesTab = await page.$(selector);
        if (salesTab) {
          ctx.logger.info(`  找到销售信息tab: ${selector}`);
          break;
        }
      } catch (e) {
        // 继续尝试
      }
    }

    if (!salesTab) {
      throw new Error('未找到"销售信息"tab，无法切换');
    }

    // 点击切换到销售信息
    await salesTab.click();
    ctx.logger.success('✅ 已切换到"销售信息"tab');
    await page.waitForTimeout(1000);

    // ============================================
    // 步骤2：填写"商家编码"（销售信息页签）
    // ============================================
    ctx.logger.info('\n[步骤2] 填写商家编码（销售信息页签）');

    // 使用精确定位：优先使用ID选择器（最稳定）
    ctx.logger.info('  定位商家编码输入框...');

    let merchantCodeInput;

    // 方法1：使用ID选择器（最稳定，优先使用）
    try {
      merchantCodeInput = page.locator('#sell-field-outerId input').first();
      ctx.logger.info('  尝试方法1: #sell-field-outerId input (ID选择器)');
      await merchantCodeInput.waitFor({ state: 'attached', timeout: 5000 });
      ctx.logger.success('  ✅ 方法1成功');
    } catch (e) {
      ctx.logger.info(`  方法1失败: ${e.message}`);

      // 方法2：使用包含文本的div定位（fallback）
      try {
        merchantCodeInput = page.locator('div:has-text("商家编码") .next-input input').first();
        ctx.logger.info('  尝试方法2: div:has-text("商家编码") .next-input input');
        await merchantCodeInput.waitFor({ state: 'attached', timeout: 3000 });
        ctx.logger.success('  ✅ 方法2成功');
      } catch (e2) {
        throw new Error(`❌ 无法定位商家编码输入框: ${e.message} | ${e2.message}`);
      }
    }

    // 滚动到视口
    ctx.logger.info('  滚动到商家编码字段...');
    await merchantCodeInput.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // 等待可见和可编辑
    ctx.logger.info('  等待商家编码输入框可见...');
    await merchantCodeInput.waitFor({ state: 'visible', timeout: 10000 });

    const merchantCodeEditable = await merchantCodeInput.isEditable();
    ctx.logger.info(`  商家编码输入框可编辑状态: ${merchantCodeEditable}`);

    if (!merchantCodeEditable) {
      throw new Error('❌ 商家编码输入框不可编辑');
    }

    // 填写商家编码（fill方法会自动清空旧值）
    ctx.logger.info(`  ⚙️ [销售信息] 商家编码 → ${productId}`);
    await merchantCodeInput.click();  // 先点击获得焦点
    await page.waitForTimeout(300);
    await merchantCodeInput.fill(productId);  // fill会自动清空并填入
    await page.waitForTimeout(800);  // 等待值生效

    // 验证填写结果
    const merchantCodeValue = await merchantCodeInput.inputValue();
    if (merchantCodeValue === productId) {
      ctx.logger.success(`✅ 商家编码验证成功: ${merchantCodeValue}`);
    } else {
      throw new Error(`❌ 商家编码填写失败: 期望"${productId}"，实际"${merchantCodeValue}"`);
    }

    // ============================================
    // 步骤3：切换回"基础信息"tab
    // ============================================
    ctx.logger.info('\n[步骤3] 切换回"基础信息"tab');

    const basicTabSelectors = [
      'li.next-menu-item:has-text("基础信息")',
      'li.next-nav-item:has-text("基础信息")',
      '.next-menu-item:has-text("基础信息")',
      '[role="option"]:has-text("基础信息")'
    ];

    let basicTab = null;
    for (const selector of basicTabSelectors) {
      try {
        basicTab = await page.$(selector);
        if (basicTab) {
          ctx.logger.info(`  找到基础信息tab: ${selector}`);
          break;
        }
      } catch (e) {
        // 继续尝试
      }
    }

    if (!basicTab) {
      throw new Error('未找到"基础信息"tab，无法切换');
    }

    // 点击切换到基础信息
    await basicTab.click();
    ctx.logger.success('✅ 已切换到"基础信息"tab');
    await page.waitForTimeout(1000);

    // ============================================
    // 步骤4：填写"货号"（基础信息页签）
    // ============================================
    ctx.logger.info('\n[步骤4] 填写货号（基础信息页签）');

    // 使用语义定位：通过文本关联到输入框（最佳实践）
    // 不限定必须是label标签，可以是span/div等任何包含"货号"文本的元素
    ctx.logger.info('  使用语义定位: text=货号 + following input');

    let skuInput;

    // 方法1：通过文本定位（适用于span/div/label等）
    try {
      skuInput = page.getByText('货号', { exact: false })
        .locator('xpath=following::input[@type="text" or not(@type)]')
        .first();

      ctx.logger.info('  尝试方法1: getByText + following input');
      await skuInput.waitFor({ state: 'attached', timeout: 3000 });
      ctx.logger.success('  ✅ 方法1成功');
    } catch (e) {
      ctx.logger.info(`  方法1失败: ${e.message}`);

      // 方法2：使用更通用的选择器（fallback）
      try {
        // 在包含"货号"文本的div中找input
        skuInput = page.locator('div:has-text("货号") .next-input input').first();
        ctx.logger.info('  尝试方法2: div:has-text("货号") .next-input input');
        await skuInput.waitFor({ state: 'attached', timeout: 3000 });
        ctx.logger.success('  ✅ 方法2成功');
      } catch (e2) {
        throw new Error(`❌ 无法定位货号输入框: ${e.message} | ${e2.message}`);
      }
    }

    // 滚动到视口（货号字段可能在页面下方）
    ctx.logger.info('  滚动到货号字段...');
    await skuInput.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // 等待可见和可编辑
    ctx.logger.info('  等待货号输入框可见...');
    await skuInput.waitFor({ state: 'visible', timeout: 10000 });

    const skuEditable = await skuInput.isEditable();
    ctx.logger.info(`  货号输入框可编辑状态: ${skuEditable}`);

    if (!skuEditable) {
      throw new Error('❌ 货号输入框不可编辑');
    }

    // 填写货号（fill方法会自动清空旧值）
    ctx.logger.info(`  ⚙️ [基础信息] 货号 → ${productId}`);
    await skuInput.click();  // 先点击获得焦点
    await page.waitForTimeout(300);
    await skuInput.fill(productId);  // fill会自动清空并填入
    await page.waitForTimeout(800);  // 等待值生效

    // 验证填写结果
    const skuValue = await skuInput.inputValue();
    if (skuValue === productId) {
      ctx.logger.success(`✅ 货号验证成功: ${skuValue}`);
    } else {
      throw new Error(`❌ 货号填写失败: 期望"${productId}"，实际"${skuValue}"`);
    }

    // 额外验证：检查字符计数是否正确（货号字段旁边有"X/128"的计数）
    try {
      const charCount = await page.locator('label:has-text("货号")')
        .locator('xpath=following-sibling::*//*[contains(text(), "/128")]')
        .first()
        .textContent();
      ctx.logger.info(`  字符计数: ${charCount}`);
    } catch (e) {
      // 字符计数验证失败不影响主流程
      ctx.logger.info('  无法读取字符计数（可能页面结构不同）');
    }

    // ============================================
    // 步骤5：保存截图
    // ============================================
    ctx.logger.info('\n[步骤5] 保存截图');

    const screenshotDir = ctx.config?.screenshotDir || './screenshots';
    fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, `${productId}_step8_product_codes.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    ctx.logger.success(`截图已保存: ${screenshotPath}`);

    // ============================================
    // 步骤6：更新缓存
    // ============================================
    ctx.logger.info('\n[步骤6] 更新缓存');

    const taskCache = loadTaskCache(productId);
    if (taskCache) {
      taskCache.merchantCode = merchantCodeValue;
      taskCache.skuCode = skuValue;
      saveTaskCache(productId, taskCache);
      ctx.logger.success('商品编码信息已保存到缓存');
    }

    ctx.logger.info('\n=== 商品编码填写完成 ===');
    ctx.logger.info(`商家编码: ${merchantCodeValue}`);
    ctx.logger.info(`货号: ${skuValue}`);

    clearInterval(heartbeat);

  } catch (error) {
    clearInterval(heartbeat);
    ctx.logger.error(`基本信息填写失败: ${error.message}`);

    // 保存错误截图
    try {
      const screenshotDir = ctx.config?.screenshotDir || './screenshots';
      fs.mkdirSync(screenshotDir, { recursive: true });
      const errorScreenshotPath = path.join(screenshotDir, `${ctx.productId}_step8_error.png`);
      await ctx.page1.screenshot({ path: errorScreenshotPath, fullPage: true });
      ctx.logger.info(`错误截图: ${errorScreenshotPath}`);
    } catch (screenshotError) {
      // 忽略截图错误
    }

    throw error;
  }
};

module.exports = { step7 };
