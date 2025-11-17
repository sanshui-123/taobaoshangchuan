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
    // 步骤2：填写"商家编码"
    // ============================================
    ctx.logger.info('\n[步骤2] 填写商家编码');

    // 查找商家编码输入框 - 使用更精确的选择器
    const merchantCodeSelectors = [
      // 最精确：找到包含"商家编码"文本的区域，然后找其中真正的input[type="text"]
      'div:has-text("商家编码") input[type="text"]',
      'div:has-text("商家编码") .next-input input',
      // 基于ID/data属性
      '#sell-field-outerId input[type="text"]',
      '[data-field="outerId"] input[type="text"]',
      // 基于class和placeholder
      '.sell-component-info-wrapper input[placeholder="请输入"][type="text"]',
      // 更通用的方式
      'input[placeholder="请输入"]:visible'
    ];

    let merchantCodeInput = null;
    let usedSelector = null;

    for (const selector of merchantCodeSelectors) {
      try {
        merchantCodeInput = await page.$(selector);
        if (merchantCodeInput) {
          const isVisible = await merchantCodeInput.isVisible();
          const isEditable = await merchantCodeInput.isEditable();

          ctx.logger.info(`  检查 ${selector}: 可见=${isVisible}, 可编辑=${isEditable}`);

          if (isVisible && isEditable) {
            usedSelector = selector;
            ctx.logger.info(`  ✅ 找到可编辑的商家编码输入框: ${selector}`);
            break;
          }
        }
      } catch (e) {
        // 继续尝试
      }
    }

    if (!merchantCodeInput) {
      throw new Error('未找到"商家编码"输入框');
    }

    // 填写商家编码 - 多种方法确保填写成功
    await merchantCodeInput.click();
    await page.waitForTimeout(300);

    // 方法1：尝试使用fill方法
    try {
      await merchantCodeInput.fill(productId);
      ctx.logger.info('  使用fill()方法填写');
    } catch (fillError) {
      ctx.logger.warn(`  fill()方法失败: ${fillError.message}，尝试备用方法`);

      // 方法2：使用JavaScript直接设置value
      await merchantCodeInput.evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, productId);
      ctx.logger.info('  使用JavaScript设置value');
    }

    await page.waitForTimeout(500);

    // 验证填写结果
    const merchantCodeValue = await merchantCodeInput.inputValue();
    if (merchantCodeValue === productId) {
      ctx.logger.success(`✅ 商家编码已填写: ${merchantCodeValue}`);
    } else {
      ctx.logger.warn(`⚠️  商家编码填写可能不完整: "${merchantCodeValue}" vs "${productId}"`);
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
    // 步骤4：填写"货号"
    // ============================================
    ctx.logger.info('\n[步骤4] 填写货号');

    // 查找货号输入框 - 使用更精确的选择器
    const skuSelectors = [
      // 最精确：找到包含"货号"文本的区域，然后找其中真正的input[type="text"]
      'div:has-text("货号") input[type="text"]',
      'div:has-text("货号") .next-input input',
      'span:has-text("货号") input[type="text"]',
      // 基于placeholder和role
      'input[placeholder="请输入"][role="combobox"]',
      // 基于ID或data属性
      '#sell-field-skuOuterId input[type="text"]',
      '[data-field="skuOuterId"] input[type="text"]',
      // 基于class（较通用）
      '.sell-component-info-wrapper input[placeholder="请输入"][type="text"]'
    ];

    let skuInput = null;
    let skuSelector = null;

    for (const selector of skuSelectors) {
      try {
        skuInput = await page.$(selector);
        if (skuInput) {
          const isVisible = await skuInput.isVisible();
          const isEditable = await skuInput.isEditable();

          ctx.logger.info(`  检查 ${selector}: 可见=${isVisible}, 可编辑=${isEditable}`);

          if (isVisible && isEditable) {
            skuSelector = selector;
            ctx.logger.info(`  ✅ 找到可编辑的货号输入框: ${selector}`);
            break;
          }
        }
      } catch (e) {
        // 继续尝试
      }
    }

    if (!skuInput) {
      // 如果还是找不到，尝试滚动页面
      ctx.logger.warn('  货号输入框不可见，尝试滚动页面...');
      await page.evaluate(() => {
        window.scrollBy(0, 300);
      });
      await page.waitForTimeout(1000);

      // 再次尝试查找
      for (const selector of skuSelectors) {
        try {
          skuInput = await page.$(selector);
          if (skuInput) {
            const isVisible = await skuInput.isVisible();
            if (isVisible) {
              skuSelector = selector;
              ctx.logger.info(`  滚动后找到货号输入框: ${selector}`);
              break;
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }
    }

    if (!skuInput) {
      throw new Error('未找到"货号"输入框');
    }

    // 填写货号 - 多种方法确保填写成功
    await skuInput.click();
    await page.waitForTimeout(300);

    // 方法1：尝试使用fill方法
    try {
      await skuInput.fill(productId);
      ctx.logger.info('  使用fill()方法填写');
    } catch (fillError) {
      ctx.logger.warn(`  fill()方法失败: ${fillError.message}，尝试备用方法`);

      // 方法2：使用JavaScript直接设置value
      await skuInput.evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, productId);
      ctx.logger.info('  使用JavaScript设置value');
    }

    await page.waitForTimeout(500);

    // 验证填写结果
    const skuValue = await skuInput.inputValue();
    if (skuValue === productId) {
      ctx.logger.success(`✅ 货号已填写: ${skuValue}`);
    } else {
      ctx.logger.warn(`⚠️  货号填写可能不完整: "${skuValue}" vs "${productId}"`);
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
