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

    // 使用精确定位器，避免误匹配到品牌字段
    const merchantCodeSelectors = [
      // 方法1：通过label定位
      'label:has-text("商家编码") ~ div input',
      'label:has-text("商家编码") + * input',
      // 方法2：在销售信息区域内查找包含"商家编码"的div
      '.sell-component-info-wrapper:has-text("商家编码") input[type="text"]',
      'div:has-text("商家编码") input[type="text"]',
      // 方法3：基于ID/data属性
      '#sell-field-outerId input',
      '[data-field="outerId"] input'
    ];

    let merchantCodeInput = null;
    let usedSelector = null;

    for (const selector of merchantCodeSelectors) {
      try {
        // 使用locator API获取所有匹配的元素
        const locator = page.locator(selector);
        const count = await locator.count();

        if (count > 0) {
          // 遍历所有匹配的元素
          for (let i = 0; i < count; i++) {
            const element = locator.nth(i);
            const isVisible = await element.isVisible().catch(() => false);
            const isEditable = await element.isEditable().catch(() => false);

            ctx.logger.info(`  检查 ${selector}[${i}]: 可见=${isVisible}, 可编辑=${isEditable}`);

            if (isVisible && isEditable) {
              merchantCodeInput = element;
              usedSelector = `${selector}[${i}]`;
              ctx.logger.success(`  ✅ 找到商家编码输入框: ${usedSelector}`);
              break;
            }
          }
        }

        if (merchantCodeInput) break;
      } catch (e) {
        ctx.logger.info(`  ${selector} 查找失败: ${e.message}`);
      }
    }

    if (!merchantCodeInput) {
      throw new Error('❌ 未找到"销售信息-商家编码"输入框，请检查页面结构');
    }

    // 填写商家编码
    await merchantCodeInput.click();
    await page.waitForTimeout(300);

    // 方法1：尝试使用fill方法
    try {
      await merchantCodeInput.fill(productId);
      ctx.logger.info(`  ⚙️ [销售信息] 商家编码 → ${productId}`);
    } catch (fillError) {
      ctx.logger.warn(`  fill()方法失败: ${fillError.message}，尝试备用方法`);

      // 方法2：使用JavaScript直接设置value
      await merchantCodeInput.evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, productId);
      ctx.logger.info(`  ⚙️ [销售信息] 商家编码 → ${productId} (使用JS)`);
    }

    await merchantCodeInput.press('Enter');
    await page.waitForTimeout(500);

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

    // 使用精确定位器，避免误匹配到品牌字段
    const skuSelectors = [
      // 方法1：通过label定位
      'label:has-text("货号") ~ div input',
      'label:has-text("货号") + * input',
      // 方法2：在包含"货号"的div中查找input
      'div:has-text("货号") input[type="text"]',
      'div:has-text("货号") .next-input input',
      'span:has-text("货号") + * input',
      // 方法3：基于ID或data属性
      '#sell-field-skuOuterId input',
      '[data-field="skuOuterId"] input'
    ];

    let skuInput = null;
    let skuSelector = null;

    // 尝试滚动到货号字段（可能在下方）
    await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const skuLabel = labels.find(l => l.textContent.includes('货号'));
      if (skuLabel) {
        skuLabel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    await page.waitForTimeout(1000);

    for (const selector of skuSelectors) {
      try {
        // 使用locator API获取所有匹配的元素
        const locator = page.locator(selector);
        const count = await locator.count();

        if (count > 0) {
          // 遍历所有匹配的元素
          for (let i = 0; i < count; i++) {
            const element = locator.nth(i);
            const isVisible = await element.isVisible().catch(() => false);
            const isEditable = await element.isEditable().catch(() => false);

            ctx.logger.info(`  检查 ${selector}[${i}]: 可见=${isVisible}, 可编辑=${isEditable}`);

            if (isVisible && isEditable) {
              skuInput = element;
              skuSelector = `${selector}[${i}]`;
              ctx.logger.success(`  ✅ 找到货号输入框: ${skuSelector}`);
              break;
            }
          }
        }

        if (skuInput) break;
      } catch (e) {
        ctx.logger.info(`  ${selector} 查找失败: ${e.message}`);
      }
    }

    if (!skuInput) {
      throw new Error('❌ 未找到"基础信息-货号"输入框，请检查页面结构');
    }

    // 填写货号
    await skuInput.click();
    await page.waitForTimeout(300);

    // 方法1：尝试使用fill方法
    try {
      await skuInput.fill(productId);
      ctx.logger.info(`  ⚙️ [基础信息] 货号 → ${productId}`);
    } catch (fillError) {
      ctx.logger.warn(`  fill()方法失败: ${fillError.message}，尝试备用方法`);

      // 方法2：使用JavaScript直接设置value
      await skuInput.evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, productId);
      ctx.logger.info(`  ⚙️ [基础信息] 货号 → ${productId} (使用JS)`);
    }

    await skuInput.press('Enter');
    await page.waitForTimeout(500);

    // 验证填写结果
    const skuValue = await skuInput.inputValue();
    if (skuValue === productId) {
      ctx.logger.success(`✅ 货号验证成功: ${skuValue}`);
    } else {
      throw new Error(`❌ 货号填写失败: 期望"${productId}"，实际"${skuValue}"`);
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
