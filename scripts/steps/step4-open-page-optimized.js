/**
 * Step 4: 优化版 - 打开发布页面并设置销售属性
 * 优化重点：减少等待时间，使用条件等待替代固定延迟
 */
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
const browserManager = require('../utils/browser-manager');

// 通用模板的固定尺码顺序（包含8个尺码，含均码）
const TEMPLATE_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '均码'];

/**
 * 进入销售信息区域（滚动到该区域）
 */
async function enterSalesInfo(page, logger) {
  logger.info('\n[步骤1] 进入销售信息区域');

  const saleCard = page.locator('#sale-card');
  await saleCard.scrollIntoViewIfNeeded();

  logger.info('  找到 #sale-card，已滚动到销售信息区域');
  logger.info('  ✅ 已滚动到销售信息区域');
}

/**
 * 检测是否需要应用通用模版
 */
async function needsApplyTemplate(page, logger) {
  // 更新选择器：同时匹配 placeholder 和实际的 class
  const colorSelector = '#sale-card .sell-color-item-wrap input, #sale-card input[placeholder*="颜色"]';
  const sizeSelector = '#sale-card .sell-size-item-wrap input, #sale-card input[placeholder*="尺码"], #sale-card input[placeholder*="尺寸"]';

  // 检查是否有颜色分类输入框
  const colorInputs = page.locator(colorSelector);
  const colorInputCount = await colorInputs.count();

  // 检查是否有尺码输入框
  const sizeInputs = page.locator(sizeSelector);
  const sizeInputCount = await sizeInputs.count();

  if (colorInputCount === 0 && sizeInputCount === 0) {
    logger.info('  未检测到销售属性，需要应用模版');
    return true;
  }

  logger.info(`  检测到已有销售属性（颜色: ${colorInputCount}, 尺码: ${sizeInputCount}）`);
  return false;
}

/**
 * 等待属性出现（优化版）
 */
async function waitForAttributesVisible(page, logger, timeout = 10000) {
  const startTime = Date.now();

  // 使用更宽泛的选择器
  const colorSelector = '#sale-card .sell-color-item-wrap input, #sale-card input[placeholder*="颜色"]';
  const sizeSelector = '#sale-card .sell-size-item-wrap input, #sale-card input[placeholder*="尺码"], #sale-card input[placeholder*="尺寸"]';

  while (Date.now() - startTime < timeout) {
    // 检查颜色和尺码输入框
    const colorVisible = await page.locator(colorSelector).first().isVisible().catch(() => false);
    const sizeVisible = await page.locator(sizeSelector).first().isVisible().catch(() => false);

    if (colorVisible && sizeVisible) {
      logger.info('  ✅ 销售属性已出现');
      return true;
    }

    // 优化：减少到 100ms 检查间隔
    await page.waitForTimeout(100);
  }

  return false;
}

/**
 * 检测并选择通用模版（优化版）
 */
async function detectAndSelectGeneralTemplate(page, logger) {
  logger.info('  尝试点击模板按钮...');

  // 设置对话框处理器
  const dialogHandler = dialog => {
    logger.info('  检测到对话框，自动确认');
    dialog.accept();
  };
  page.once('dialog', dialogHandler);

  // 先在 #sale-card 区域内查找模板按钮
  const templateBtnInCard = page.locator('#sale-card').getByText('模板', { exact: true });
  let clicked = false;

  if (await templateBtnInCard.isVisible()) {
    // 创建对话框等待器
    const dialogListener = page.waitForEvent('dialog', { timeout: 1000 })
      .then(dialog => dialog.accept())
      .catch(() => {}); // 如果没有对话框也不报错

    await templateBtnInCard.click();
    await dialogListener; // 等待对话框处理完成

    logger.info('  在 #sale-card 内找到并点击 "模板"');
    clicked = true;
  } else {
    // 备用方案：在整个页面查找
    const templateBtn = page.getByRole('button', { name: '模板', exact: true }).first();
    if (await templateBtn.isVisible()) {
      // 创建对话框等待器
      const dialogListener = page.waitForEvent('dialog', { timeout: 1000 })
        .then(dialog => dialog.accept())
        .catch(() => {}); // 如果没有对话框也不报错

      await templateBtn.click();
      await dialogListener; // 等待对话框处理完成

      logger.info('  找到并点击模板按钮');
      clicked = true;
    }
  }

  if (!clicked) {
    logger.warn('  未找到模板按钮');
    return false;
  }

  // 优化：减少等待时间到 200ms
  await page.waitForTimeout(200);

  // 查找并点击通用模版选项
  const generalTemplateOption = page.getByText('通用模版', { exact: true });

  if (!await generalTemplateOption.isVisible()) {
    logger.warn('  未找到通用模版选项');
    return false;
  }

  await generalTemplateOption.click();
  logger.info('  使用 getByText 选择通用模版');

  // 清理对话框处理器
  page.removeListener('dialog', dialogHandler);

  return true;
}

/**
 * 尝试多种方式删除不需要的颜色（优化版）
 */
async function deleteColorsByMultipleMethods(page, colorsToDelete, logger) {
  let remainingToDelete = [...colorsToDelete];

  // 方法1：通过索引批量删除（从后往前）
  for (let i = colorsToDelete.length; i > 0; i--) {
    const index = i + 2;  // 假设前3个是我们要保留的

    try {
      const deleted = await page.evaluate((idx) => {
        const container = document.querySelector('#sale-card');
        if (!container) return false;

        const deleteButtons = container.querySelectorAll('button[class*="delete"], button[class*="ashbin"], [class*="trash"] button, [title*="删除"]');

        if (deleteButtons.length >= idx) {
          const btn = deleteButtons[idx];
          if (btn) {
            btn.click();
            return true;
          }
        }
        return false;
      }, index);

      if (deleted) {
        logger.info(`    删除第 ${index + 1} 个颜色`);
        remainingToDelete.shift();
        // 优化：减少到 200ms
        await page.waitForTimeout(200);
      }
    } catch (e) {
      // 静默处理错误
    }
  }

  return remainingToDelete;
}

/**
 * 处理颜色分类（优化版）
 */
async function processColors(page, targetColors, logger) {
  logger.info('\n[步骤3] 处理颜色分类');
  logger.info(`  目标颜色: ${targetColors.join(', ')}`);
  logger.info(`  目标数量: ${targetColors.length}`);

  // 使用更宽泛的选择器
  const colorInputSelector = '#sale-card .sell-color-item-wrap input, #sale-card input[placeholder*="颜色"]';

  try {
    // 等待颜色输入框出现（增加到10秒）
    await page.waitForSelector(colorInputSelector, { timeout: 10000 });
  } catch (e) {
    logger.warn('  颜色输入框未出现，可能需要应用模板');
    throw new Error('颜色输入框未出现');
  }

  // 获取所有颜色输入框
  const colorInputs = page.locator(colorInputSelector);
  const currentColorCount = await colorInputs.count();
  logger.info(`  当前颜色数量: ${currentColorCount}`);

  // 删除多余的颜色（从后往前删）
  const colorsToDeleteCount = currentColorCount - targetColors.length;
  if (colorsToDeleteCount > 0) {
    logger.info(`  需要删除 ${colorsToDeleteCount} 个颜色`);

    // 从后往前删除
    for (let i = currentColorCount - 1; i >= targetColors.length; i--) {
      const colorItem = colorInputs.nth(i);
      const parent = colorItem.locator('xpath=./ancestor::*[contains(@class, "item") or contains(@class, "wrap")][1]');

      await parent.hover();
      // 优化：减少到 100ms
      await page.waitForTimeout(100);

      const deleteBtn = parent.locator('[class*="delete"], [class*="ashbin"], [title*="删除"]').first();
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();
        logger.info(`    删除第 ${i + 1} 个颜色`);
      }

      // 优化：减少到 200ms
      await page.waitForTimeout(200);
    }
  }

  // 填写颜色值
  logger.info('  填写颜色值:');
  const remainingInputs = page.locator(colorInputSelector);
  const finalCount = await remainingInputs.count();
  logger.info(`  找到 ${finalCount} 个颜色项`);

  for (let i = 0; i < Math.min(finalCount, targetColors.length); i++) {
    const input = remainingInputs.nth(i);
    await input.clear();
    await input.fill(targetColors[i]);
    logger.info(`    第 ${i + 1} 个: ${targetColors[i]}`);
    // 优化：减少到 100ms
    await page.waitForTimeout(100);
  }

  logger.info(`  ✅ 颜色处理完成，保留了 ${targetColors.length} 个: ${targetColors.join(', ')}`);
}

/**
 * 等待元素稳定出现（优化版）
 */
async function waitForElementStable(page, selector, timeout = 3000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = page.locator(selector).first();
    if (await element.isVisible().catch(() => false)) {
      // 优化：只等待 50ms 确认稳定
      await page.waitForTimeout(50);
      if (await element.isVisible().catch(() => false)) {
        return element;
      }
    }
    await page.waitForTimeout(100);
  }

  return null;
}

/**
 * 应用通用模板（优化版）
 */
async function applyGeneralTemplate(page, logger) {
  logger.info('\n[步骤2] 应用通用模板');

  // 检查是否需要应用模板
  const needsTemplate = await needsApplyTemplate(page, logger);

  if (!needsTemplate) {
    logger.info('  已有销售属性，跳过模板应用');
    return;
  }

  // 检测并选择通用模版
  const selected = await detectAndSelectGeneralTemplate(page, logger);

  if (!selected) {
    throw new Error('无法应用通用模版');
  }

  // 等待模板应用完成
  await page.waitForTimeout(1000);

  // 使用正确的选择器等待元素出现
  const colorSelector = '#sale-card .sell-color-item-wrap input, #sale-card input[placeholder*="颜色"]';
  try {
    await page.waitForSelector(colorSelector, { timeout: 10000 });
    logger.info('  ✅ 颜色输入框已出现');
  } catch (e) {
    logger.warn('  等待颜色输入框超时，尝试继续');
  }

  // 等待属性出现（增加超时到10秒）
  const attributesVisible = await waitForAttributesVisible(page, logger, 10000);

  if (attributesVisible) {
    logger.info('  ✅ 已应用通用模板');
  } else {
    logger.info('  ✅ 模板选择完成');
  }

  logger.info('  模板预设: 6个颜色 + 8个尺码(XS/S/M/L/XL/XXL/XXXL/均码)');
}

/**
 * 获取颜色容器
 */
async function getColorContainer(page) {
  // 查找包含"颜色分类"文本的容器
  const containers = await page.locator('text=颜色分类').locator('..').all();

  for (const container of containers) {
    // 检查容器内是否有输入框
    const inputs = container.locator('input[type="text"], input:not([type])');
    const inputCount = await inputs.count();

    if (inputCount > 0) {
      return container;
    }
  }

  // 备用方案：直接在 sale-card 中查找
  return page.locator('#sale-card');
}

/**
 * 删除颜色项（通过点击删除按钮）
 */
async function deleteColorItem(page, index, logger) {
  try {
    // 方法1：通过索引找到对应的删除按钮
    const allDeleteBtns = page.locator('#sale-card [class*="delete"], #sale-card [class*="ashbin"], #sale-card [title*="删除"]');
    const btnCount = await allDeleteBtns.count();

    if (index < btnCount) {
      const deleteBtn = allDeleteBtns.nth(index);

      // 确保按钮可见
      const parent = deleteBtn.locator('..');
      await parent.hover();
      // 优化：减少到 100ms
      await page.waitForTimeout(100);

      await deleteBtn.click({ force: true });
      logger.info(`    删除第 ${index + 1} 个颜色`);
      return true;
    }

    // 方法2：通过JavaScript删除
    const deleted = await page.evaluate((idx) => {
      const inputs = document.querySelectorAll('#sale-card input[placeholder*="颜色"]');
      if (inputs[idx]) {
        let parent = inputs[idx].parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const deleteBtn = parent.querySelector('[class*="delete"], [class*="ashbin"]');
          if (deleteBtn) {
            deleteBtn.click();
            return true;
          }
          parent = parent.parentElement;
        }
      }
      return false;
    }, index);

    if (deleted) {
      logger.info(`    删除第 ${index + 1} 个颜色（通过JS）`);
      return true;
    }

  } catch (e) {
    logger.warn(`    删除第 ${index + 1} 个颜色失败: ${e.message}`);
  }

  return false;
}

/**
 * 填写颜色值
 */
async function fillColorValues(page, targetColors, logger) {
  const colorInputs = page.locator('#sale-card input[placeholder*="颜色"]');
  const count = await colorInputs.count();

  logger.info(`  找到 ${count} 个颜色项`);

  for (let i = 0; i < Math.min(count, targetColors.length); i++) {
    const input = colorInputs.nth(i);
    await input.clear();
    await input.fill(targetColors[i]);
    logger.info(`    第 ${i + 1} 个: ${targetColors[i]}`);
    // 优化：减少到 50ms
    await page.waitForTimeout(50);
  }
}

/**
 * 删除多余的颜色项
 */
async function deleteExtraColors(page, currentCount, targetCount, logger) {
  logger.info(`  需要删除 ${currentCount - targetCount} 个颜色`);

  // 从后往前删除，避免索引变化
  for (let i = currentCount - 1; i >= targetCount; i--) {
    await deleteColorItem(page, i, logger);
    // 优化：减少到 200ms
    await page.waitForTimeout(200);
  }
}

/**
 * 处理尺码分类（优化版）
 */
async function processSizes(page, targetSizes, logger) {
  logger.info('\n[步骤4] 处理尺码分类');
  logger.info(`  目标尺码: ${targetSizes.join(', ')}`);
  logger.info(`  目标数量: ${targetSizes.length}`);

  // 标准化目标尺码为大写
  const targetSizesUpper = targetSizes.map(s => s.trim().toUpperCase());

  // 需要删除的尺码（模板有但目标没有的）
  const sizesToDelete = TEMPLATE_SIZES.filter(size => !targetSizesUpper.includes(size));
  logger.info(`  需要删除的尺码: ${sizesToDelete.join(', ')}`);

  if (sizesToDelete.length === 0) {
    logger.info('  ✅ 无需删除尺码');
    return;
  }

  // 直接在页面上查找并删除不需要的尺码
  // 从后往前删除，避免索引变化问题
  for (const sizeToDelete of sizesToDelete.reverse()) {
    try {
      // 方法1：在 #sale-card 中查找包含该尺码文本的输入框
      const sizeInput = page.locator(`#sale-card input[value="${sizeToDelete}"]`).first();
      let inputExists = await sizeInput.count();

      if (inputExists > 0) {
        // 找到输入框的父容器，然后找删除按钮
        const parentContainer = sizeInput.locator('xpath=./ancestor::*[contains(@class, "wrap") or contains(@class, "item")][1]');
        const parentExists = await parentContainer.count();

        if (parentExists > 0) {
          // hover 并点击删除按钮
          await parentContainer.hover();
          // 优化：减少到 100ms
          await page.waitForTimeout(100);

          const deleteBtn = parentContainer.locator('button, [class*="delete"], [class*="ashbin"]').first();
          const btnExists = await deleteBtn.count();

          if (btnExists > 0) {
            await deleteBtn.click({ force: true });
            logger.info(`    删除尺码: ${sizeToDelete}`);
            // 优化：减少到 200ms
            await page.waitForTimeout(200);
            continue;
          }
        }
      }

      // 方法2：通过 JavaScript 查找并删除
      const deleted = await page.evaluate((size) => {
        // 查找包含该尺码的输入框
        const inputs = document.querySelectorAll('#sale-card input');
        for (const input of inputs) {
          if (input.value === size || input.value.toUpperCase() === size) {
            // 找到父容器
            let parent = input.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              const deleteBtn = parent.querySelector('button, [class*="delete"], [class*="ashbin"]');
              if (deleteBtn) {
                deleteBtn.click();
                return true;
              }
              parent = parent.parentElement;
            }
          }
        }
        return false;
      }, sizeToDelete);

      if (deleted) {
        logger.info(`    删除尺码: ${sizeToDelete} (via JS)`);
        // 优化：减少到 200ms
        await page.waitForTimeout(200);
      }

    } catch (e) {
      logger.warn(`    删除尺码 ${sizeToDelete} 失败: ${e.message}`);
    }
  }

  logger.info(`  ✅ 尺码处理完成，保留: ${targetSizes.join(', ')}`);
}

/**
 * 重新进入销售信息区域（设置销售属性后）
 */
async function reEnterSalesInfo(page, logger) {
  logger.info('\n重新定位到销售信息区域');

  const saleCard = page.locator('#sale-card');
  await saleCard.scrollIntoViewIfNeeded();

  logger.info('✅ 销售属性设置完成');
}

/**
 * 步骤4主函数（优化版）
 */
async function step4(ctx) {
  ctx.logger.info('启动浏览器，打开发布页面');

  const productId = ctx.productId || 'test-product';
  const cache = loadTaskCache(productId);
  const timeout = 60000;
  let page1 = null;

  try {
    // 使用全局browser-manager获取context和页面
    ctx.logger.info('获取浏览器上下文...');
    const context = await browserManager.getContext();
    const page = await browserManager.getMainPage();
    ctx.logger.info('✅ 使用已有浏览器上下文和主页面');

    ctx.browser = ctx.browser || context.browser();
    ctx.context = ctx.context || context;
    ctx.page1 = page;
    page1 = page;

    // 使用直达链接打开发布页面（优化版）
    ctx.logger.info('🚀 使用模板商品直达发布页面...');
    const templateItemId = process.env.TB_TEMPLATE_ITEM_ID || '991550105366';
    ctx.logger.info(`模板商品ID: ${templateItemId}`);

    const publishUrl = `https://item.upload.taobao.com/sell/v2/publish.htm?copyItem=true&itemId=${templateItemId}&fromAIPublish=true`;
    ctx.logger.info(`直达链接: ${publishUrl}`);

    await page.goto(publishUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeout
    });

    // 优化：使用条件等待替代固定等待
    try {
      // 等待关键元素出现而非 networkidle
      await page.waitForSelector('#sale-card', { timeout: 5000 });
    } catch (e) {
      ctx.logger.warn('发布页未达到完全空闲状态，但继续执行（正常现象）');
    }

    // 优化：减少到 500ms
    await page.waitForTimeout(500);

    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('passport')) {
      throw new Error('登录状态已失效，请重新登录');
    }

    ctx.logger.success('✅ 已通过直达链接进入发布页面');
    page1 = page;

    ctx.logger.success('✅ 发布页面已打开');

    // 设置页面1的超时
    page1.setDefaultTimeout(timeout);

    // 优化：使用条件等待
    try {
      await page1.waitForSelector('#sale-card', { timeout: 5000 });
    } catch (e) {
      ctx.logger.warn('发布页面未达到完全空闲状态，但继续执行');
    }

    // 优化：减少到 500ms
    await page1.waitForTimeout(500);

    // 验证页面是否正确加载
    const pageTitle = await page1.title();
    ctx.logger.info(`页面标题: ${pageTitle}`);

    if (pageTitle.includes('商品发布') || pageTitle.includes('发布')) {
      ctx.logger.success('✅ 成功进入发布页面');
    } else {
      throw new Error(`页面标题不正确: ${pageTitle}`);
    }

    // 从缓存获取数据
    if (!cache || !cache.productData) {
      throw new Error('缓存中没有商品数据，请先执行步骤3');
    }

    const { colors = [], sizes = [] } = cache.productData;

    ctx.logger.info('\n从缓存获取数据:');
    ctx.logger.info(`  颜色: ${colors.join(', ')}`);
    ctx.logger.info(`  尺码: ${sizes.join(', ')}`);

    // 执行销售属性设置
    await enterSalesInfo(page1, ctx.logger);
    await applyGeneralTemplate(page1, ctx.logger);
    await processColors(page1, colors, ctx.logger);
    await processSizes(page1, sizes, ctx.logger);
    await reEnterSalesInfo(page1, ctx.logger);

    // 保存截图
    const screenshotPath = path.join(__dirname, '../../screenshots', `${productId}_step4_publish_page.png`);
    await page1.screenshot({ path: screenshotPath, fullPage: false });
    ctx.logger.info(`截图已保存: ${path.relative(process.cwd(), screenshotPath)}`);

    // 更新任务状态
    updateStepStatus(productId, 4, 'done', {
      publishUrl: page1.url(),
      pageReady: true,
      colors: colors,
      sizes: sizes
    });

    ctx.logger.info('\n=== 步骤4完成 ===');
    ctx.logger.info(`发布页面URL: ${page1.url()}`);
    ctx.logger.info('浏览器已就绪，可以继续下一步\n');

  } catch (error) {
    ctx.logger.error(`步骤4失败: ${error.message}`);

    // 保存错误截图
    if (page1) {
      try {
        const errorScreenshotPath = path.join(__dirname, '../../screenshots', `${productId}_step4_error.png`);
        await page1.screenshot({ path: errorScreenshotPath, fullPage: false });
        ctx.logger.info(`错误截图已保存: ${path.relative(process.cwd(), errorScreenshotPath)}`);
      } catch (e) {
        ctx.logger.warn('无法保存错误截图');
      }
    }

    updateStepStatus(productId, 4, 'error', { error: error.message });
    throw error;
  }
}

module.exports = { step4 };