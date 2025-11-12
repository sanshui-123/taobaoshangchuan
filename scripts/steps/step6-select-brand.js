const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤6：选择品牌
 * 从下拉框中选择商品品牌
 */
const step6 = async (ctx) => {
  ctx.logger.info('开始选择商品品牌');

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

    // 加载缓存获取商品信息
    const taskCache = loadTaskCache(ctx.productId);
    if (!taskCache.productData || !taskCache.productData.brand) {
      throw new Error('缓存中没有品牌信息');
    }

    const brand = taskCache.productData.brand;
    ctx.logger.info(`商品品牌: ${brand}`);

    // 步骤1：点击品牌下拉框
    ctx.logger.info('\n[步骤1] 定位品牌下拉框');

    // 尝试多种选择器找到品牌输入框
    const brandSelectors = [
      '#sell-field-brand .next-select-selection',
      '[data-field="brand"] .next-select-selection',
      '.brand-field .next-select',
      'div:has-text("品牌") + .next-select',
      'input[placeholder*="品牌"]',
      '.next-select:has-text("请选择品牌")'
    ];

    let brandSelect = null;
    for (const selector of brandSelectors) {
      try {
        brandSelect = await page.$(selector);
        if (brandSelect) {
          ctx.logger.success(`✅ 找到品牌下拉框: ${selector}`);
          break;
        }
      } catch (e) {
        // 继续尝试下一个选择器
      }
    }

    if (!brandSelect) {
      throw new Error('未找到品牌下拉框');
    }

    // 步骤2：打开下拉菜单
    ctx.logger.info('\n[步骤2] 打开品牌下拉菜单');
    await brandSelect.click();
    await page.waitForTimeout(500);

    // 步骤3：搜索品牌
    ctx.logger.info(`\n[步骤3] 搜索品牌: ${brand}`);

    // 查找搜索输入框
    const searchInput = await page.$('.next-select-dropdown-search-input input');

    if (searchInput) {
      await searchInput.fill(brand);
      ctx.logger.success(`✅ 输入品牌名称: ${brand}`);
      await page.waitForTimeout(1000);
    } else {
      ctx.logger.warn('未找到品牌搜索输入框，直接浏览品牌列表');
    }

    // 步骤4：从下拉列表中选择品牌
    ctx.logger.info('\n[步骤4] 从下拉列表选择品牌');

    // 品牌选择策略
    let brandSelected = false;
    const selectionStrategies = [
      // 策略1：精确匹配
      {
        name: '精确匹配',
        selector: `.next-select-dropdown-menu-item:has-text("${brand}")`,
        exact: true
      },
      // 策略2：包含匹配
      {
        name: '包含匹配',
        selector: `.next-select-dropdown-menu-item:has-text("${brand.substring(0, 3)}")`,
        exact: false
      },
      // 策略3：模糊匹配
      {
        name: '模糊匹配',
        selector: `.next-select-dropdown-menu-item`,
        filter: (item, brand) => {
          return item.textContent && item.textContent.toLowerCase().includes(brand.toLowerCase());
        }
      }
    ];

    for (const strategy of selectionStrategies) {
      ctx.logger.info(`  尝试${strategy.name}...`);

      try {
        if (strategy.exact) {
          // 精确匹配或包含匹配
          const brandOption = await page.$(strategy.selector);
          if (brandOption) {
            await brandOption.click();
            brandSelected = true;
            ctx.logger.success(`✅ ${strategy.name}成功: ${brand}`);
            break;
          }
        } else if (strategy.filter) {
          // 模糊匹配
          const options = await page.$$(strategy.selector);
          for (const option of options) {
            const text = await option.textContent();
            if (text && strategy.filter({ textContent: text }, brand)) {
              await option.click();
              brandSelected = true;
              ctx.logger.success(`✅ ${strategy.name}成功: ${text}`);
              break;
            }
          }
          if (brandSelected) break;
        }
      } catch (error) {
        ctx.logger.warn(`  ${strategy.name}失败: ${error.message}`);
      }

      await page.waitForTimeout(500);
    }

    // 如果都没找到，尝试点击第一个选项（避免空值）
    if (!brandSelected) {
      ctx.logger.warn('\n未找到匹配品牌，尝试选择第一个选项...');
      try {
        const firstOption = await page.$('.next-select-dropdown-menu-item');
        if (firstOption) {
          await firstOption.click();
          const selectedText = await firstOption.textContent();
          ctx.logger.warn(`⚠️ 已选择: ${selectedText}`);
          brandSelected = true;
        }
      } catch (error) {
        ctx.logger.error(`选择第一个选项失败: ${error.message}`);
      }
    }

    if (!brandSelected) {
      // 按ESC关闭下拉框
      await page.keyboard.press('Escape');
      throw new Error('未找到匹配的品牌，请手动选择或更新品牌信息');
    }

    // 步骤5：验证选择结果
    ctx.logger.info('\n[步骤5] 验证品牌选择结果');
    await page.waitForTimeout(1000);

    // 检查下拉框的值
    const selectedValue = await page.$eval('#sell-field-brand .next-select-selection-item',
      el => el ? el.textContent.trim() : '');

    if (selectedValue) {
      ctx.logger.success(`✅ 品牌已选择: ${selectedValue}`);

      // 更新缓存
      taskCache.selectedBrand = {
        original: brand,
        actual: selectedValue,
        matched: selectedValue.toLowerCase().includes(brand.toLowerCase()),
        timestamp: new Date().toISOString()
      };

      saveTaskCache(ctx.productId, taskCache);
    } else {
      ctx.logger.warn('无法验证品牌选择结果');
    }

    // 步骤6：截图保存
    const screenshotDir = process.env.TAOBAO_SCREENSHOT_DIR ||
      path.resolve(process.cwd(), 'screenshots');

    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const screenshotPath = path.join(
      screenshotDir,
      `${ctx.productId}_step6_brand.png`
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });
    ctx.logger.info(`截图已保存: ${screenshotPath}`);

    // 更新步骤状态
    taskCache.stepStatus[6] = 'done';
    saveTaskCache(ctx.productId, taskCache);
    updateStepStatus(ctx.productId, 6, 'done');

    ctx.logger.success('\n=== 品牌选择完成 ===');

  } catch (error) {
    ctx.logger.error(`品牌选择失败: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `步骤6失败: ${error.message}`
        });
      } catch (updateError) {
        ctx.logger.error(`更新飞书错误日志失败: ${updateError.message}`);
      }
    }

    // 保存错误截图
    if (ctx.page1) {
      try {
        const errorScreenshot = path.join(
          path.resolve(process.cwd(), 'screenshots'),
          `${ctx.productId}_step6_error.png`
        );
        await ctx.page1.screenshot({ path: errorScreenshot, fullPage: true });
        ctx.logger.info(`错误截图: ${errorScreenshot}`);
      } catch (e) {
        // 忽略截图错误
      }
    }

    updateStepStatus(ctx.productId, 6, 'failed');
    throw error;

  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');
  }
};

module.exports = { step6 };