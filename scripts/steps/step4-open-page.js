const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
const browserManager = require('../utils/browser-manager');

// 通用模板的固定尺码顺序（包含7个尺码）
const TEMPLATE_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/**
 * 进入销售信息区域（滚动到该区域）
 */
async function enterSalesInfo(page, logger) {
  logger.info('\n[步骤1] 进入销售信息区域');

  // 方法1：滚动到 #sale-card 或包含"销售信息"标题的区域
  let found = false;

  try {
    // 优先使用 ID 选择器
    const saleCard = page.locator('#sale-card');
    const cardExists = await saleCard.count();

    if (cardExists > 0) {
      await saleCard.scrollIntoViewIfNeeded();
      found = true;
      logger.info('  找到 #sale-card，已滚动到销售信息区域');
    }
  } catch (e) {
    logger.info(`  方法1失败: ${e.message}`);
  }

  // 方法2：通过 h2 标题定位
  if (!found) {
    try {
      const salesTitle = page.locator('h2:has-text("销售信息")');
      const titleExists = await salesTitle.count();

      if (titleExists > 0) {
        await salesTitle.scrollIntoViewIfNeeded();
        found = true;
        logger.info('  找到销售信息标题，已滚动到该区域');
      }
    } catch (e) {
      logger.info(`  方法2失败: ${e.message}`);
    }
  }

  // 方法3：通过 .sell-component-block 定位
  if (!found) {
    try {
      const salesBlock = page.locator('.sell-component-block:has-text("销售信息")').first();
      const blockExists = await salesBlock.count();

      if (blockExists > 0) {
        await salesBlock.scrollIntoViewIfNeeded();
        found = true;
        logger.info('  找到销售信息区块，已滚动到该区域');
      }
    } catch (e) {
      logger.info(`  方法3失败: ${e.message}`);
    }
  }

  // 方法4：iframe 兼容 - 检查是否在 iframe 中
  if (!found) {
    try {
      const frames = page.frames();
      for (const frame of frames) {
        const salesInFrame = frame.locator('#sale-card, h2:has-text("销售信息")');
        const frameExists = await salesInFrame.count().catch(() => 0);
        if (frameExists > 0) {
          await salesInFrame.first().scrollIntoViewIfNeeded();
          found = true;
          logger.info('  在 iframe 中找到销售信息区域');
          break;
        }
      }
    } catch (e) {
      logger.info(`  方法4 (iframe) 失败: ${e.message}`);
    }
  }

  await page.waitForTimeout(1000);

  // 验证是否找到销售信息区域
  const colorSection = page.locator('text=颜色分类');
  const colorVisible = await colorSection.isVisible().catch(() => false);

  if (colorVisible) {
    logger.info('  ✅ 已成功进入销售信息区域（检测到颜色分类）');
  } else if (found) {
    logger.info('  ✅ 已滚动到销售信息区域');
  } else {
    logger.warn('  ⚠️ 未找到销售信息区域，但继续执行...');
  }
}

/**
 * 在销售信息区域内按文本查找并点击按钮
 * @param {Page} page - Playwright page
 * @param {string} buttonText - 按钮文本
 * @param {Object} logger - 日志
 * @returns {boolean} - 是否成功
 */
async function clickButtonInSalesArea(page, buttonText, logger) {
  // 定义销售信息区域选择器
  const salesAreaSelectors = [
    '#sale-card',
    '.sell-component-block:has-text("销售信息")',
    '[class*="sale-card"]'
  ];

  // 方法1：在销售信息区域内查找
  for (const areaSelector of salesAreaSelectors) {
    try {
      const area = page.locator(areaSelector).first();
      const areaExists = await area.count();

      if (areaExists > 0) {
        // 在区域内查找按钮（按文本）
        const button = area.locator(`text="${buttonText}"`).first();
        const buttonExists = await button.count();

        if (buttonExists > 0) {
          // 检查可见性
          const isVisible = await button.isVisible().catch(() => false);
          if (isVisible) {
            await button.click();
            logger.info(`  在 ${areaSelector} 内找到并点击 "${buttonText}"`);
            return true;
          }
        }
      }
    } catch (e) {
      // 继续尝试下一个选择器
    }
  }

  // 方法2：全局查找（兜底）
  try {
    const globalButton = page.locator(`text="${buttonText}"`).first();
    const globalExists = await globalButton.count();

    if (globalExists > 0) {
      const isVisible = await globalButton.isVisible().catch(() => false);
      if (isVisible) {
        await globalButton.click();
        logger.info(`  全局查找到并点击 "${buttonText}"`);
        return true;
      }
    }
  } catch (e) {
    // 继续
  }

  // 方法3：iframe 兼容
  try {
    const frames = page.frames();
    for (const frame of frames) {
      const frameButton = frame.locator(`text="${buttonText}"`).first();
      const frameExists = await frameButton.count().catch(() => 0);

      if (frameExists > 0) {
        await frameButton.click();
        logger.info(`  在 iframe 中找到并点击 "${buttonText}"`);
        return true;
      }
    }
  } catch (e) {
    // 继续
  }

  return false;
}

/**
 * 应用通用模板
 */
async function applyGeneralTemplate(page, logger) {
  logger.info('\n[步骤2] 应用通用模板');

  // 等待销售信息区域加载
  await page.waitForTimeout(1000);

  // 检查是否已经应用了模板（检测颜色分类）
  const existingColors = page.locator('text=颜色分类');
  const hasColors = await existingColors.isVisible().catch(() => false);

  if (hasColors) {
    logger.info('  检测到已有颜色分类，模板可能已应用');

    // 检查是否需要切换模板
    const templateText = page.locator('text=通用模版');
    const hasTemplate = await templateText.isVisible().catch(() => false);

    if (hasTemplate) {
      logger.info('  ✅ 通用模版已应用');
      return;
    }
  }

  // 方法1：直接点击"通用模版"文本（如果已显示在界面上）
  let selected = await clickButtonInSalesArea(page, '通用模版', logger);

  if (!selected) {
    // 方法2：点击"模板"按钮打开下拉菜单
    logger.info('  尝试点击模板按钮...');

    const templateClicked = await clickButtonInSalesArea(page, '模板', logger);

    if (templateClicked) {
      await page.waitForTimeout(1000);

      // 等待下拉菜单出现并选择"通用模版"
      const optionLocator = page.locator('.next-menu-item, li[role="option"], [class*="menu-item"]')
        .filter({ hasText: '通用模版' }).first();
      const optionExists = await optionLocator.count();

      if (optionExists > 0) {
        await optionLocator.click();
        selected = true;
        logger.info('  从下拉菜单选择通用模版');
      } else {
        // 尝试 getByText
        const textOption = page.getByText('通用模版', { exact: false }).first();
        const textExists = await textOption.count();
        if (textExists > 0) {
          await textOption.click();
          selected = true;
          logger.info('  使用 getByText 选择通用模版');
        }
      }
    }
  }

  if (!selected) {
    // 方法3：查找并点击 input[role="combobox"] 或 .next-select
    logger.info('  尝试查找模板选择器...');

    const selectLocators = [
      '#sale-card input[role="combobox"]',
      '#sale-card .next-select',
      '.sell-component-block-header input[role="combobox"]',
      '.sell-component-block-header .next-select'
    ];

    for (const selector of selectLocators) {
      try {
        const select = page.locator(selector).last();
        const selectExists = await select.count();

        if (selectExists > 0) {
          await select.click();
          logger.info(`  点击选择器: ${selector}`);
          await page.waitForTimeout(1000);

          // 选择通用模版
          const option = page.locator('.next-menu-item, li[role="option"]')
            .filter({ hasText: '通用模版' }).first();
          const optExists = await option.count();

          if (optExists > 0) {
            await option.click();
            selected = true;
            logger.info('  选择通用模版');
            break;
          }
        }
      } catch (e) {
        // 继续尝试
      }
    }
  }

  if (!selected) {
    throw new Error('无法应用通用模版');
  }

  // 等待模板应用
  await page.waitForTimeout(2000);

  // 验证模板是否应用成功
  const colorItems = page.locator('text=颜色分类');
  const colorVisible = await colorItems.isVisible().catch(() => false);

  if (colorVisible) {
    logger.info('  ✅ 已应用通用模板');
  } else {
    logger.info('  ✅ 模板选择完成');
  }

  logger.info('  模板预设: 6个颜色 + 7个尺码(XS/S/M/L/XL/XXL/XXXL)');
}

/**
 * 获取颜色容器
 */
async function getColorContainer(page) {
  // 方法1：通过 ID 或特定 class
  let container = page.locator('#sale-card [class*="struct-p-1627207"], #sale-card [class*="color"]').filter({
    has: page.locator('input')
  }).first();

  let count = await container.count().catch(() => 0);
  if (count > 0) return container;

  // 方法2：查找包含"颜色分类"文本的区域
  container = page.locator('div').filter({
    has: page.getByText(/颜色分类/)
  }).filter({
    has: page.locator('input')
  }).first();

  count = await container.count().catch(() => 0);
  if (count > 0) return container;

  // 方法3：更宽松的选择 - 查找销售信息区域中的颜色输入
  container = page.locator('#sale-card').first();

  return container;
}

/**
 * 获取尺码容器
 */
async function getSizeContainer(page) {
  // 方法1：通过特定 class
  let container = page.locator('#sale-card [class*="struct-p-20509"], #sale-card [class*="size"]').filter({
    has: page.locator('input')
  }).first();

  let count = await container.count().catch(() => 0);
  if (count > 0) return container;

  // 方法2：查找包含"尺码"文本的区域
  container = page.locator('div').filter({
    has: page.getByText(/尺码/)
  }).filter({
    has: page.locator('input')
  }).first();

  count = await container.count().catch(() => 0);
  if (count > 0) return container;

  // 方法3：更宽松的选择
  container = page.locator('#sale-card').first();

  return container;
}

/**
 * 处理颜色分类（使用模板+删除多余+填写方式）
 */
async function processColors(page, targetColors, logger) {
  logger.info('\n[步骤3] 处理颜色分类');
  logger.info(`  目标颜色: ${targetColors.join(', ')}`);
  logger.info(`  目标数量: ${targetColors.length}`);

  // 获取颜色容器
  const colorContainer = await getColorContainer(page);
  const containerExists = await colorContainer.count();
  if (containerExists === 0) {
    throw new Error('无法定位颜色容器');
  }

  // 获取当前颜色输入框数量
  const colorItems = colorContainer.locator('.sell-color-item-wrap');
  let currentCount = await colorItems.count();
  logger.info(`  当前颜色数量: ${currentCount}`);

  // 从最后一个开始删除多余的颜色
  if (currentCount > targetColors.length) {
    const deleteCount = currentCount - targetColors.length;
    logger.info(`  需要删除 ${deleteCount} 个颜色`);

    for (let i = 0; i < deleteCount; i++) {
      // 每次都获取最新的数量，从最后一个删除
      const items = colorContainer.locator('.sell-color-item-wrap');
      const count = await items.count();
      const lastIndex = count - 1;

      if (lastIndex < 0) break;

      logger.info(`    删除第 ${lastIndex + 1} 个颜色`);

      const lastItem = items.nth(lastIndex);

      // 先 hover 到颜色项上，让删除按钮显示出来
      await lastItem.hover();
      await page.waitForTimeout(300);

      // 点击删除按钮（垃圾桶图标）- 使用 force:true 强制点击
      const deleteBtn = lastItem.locator('button.next-btn, .next-icon-ashbin, [class*="delete"]').first();
      const btnExists = await deleteBtn.count();

      if (btnExists > 0) {
        await deleteBtn.click({ force: true });
      } else {
        // 备选：使用 JavaScript 直接删除
        await page.evaluate((idx) => {
          const items = document.querySelectorAll('.sell-color-item-wrap');
          if (items[idx]) {
            const btn = items[idx].querySelector('button, [class*="delete"], [class*="ashbin"]');
            if (btn) btn.click();
          }
        }, lastIndex);
      }
      await page.waitForTimeout(500);
    }
  }

  // 如果目标颜色多于6个，需要添加
  currentCount = await colorItems.count();
  if (currentCount < targetColors.length) {
    const addCount = targetColors.length - currentCount;
    logger.info(`  需要添加 ${addCount} 个颜色`);

    for (let i = 0; i < addCount; i++) {
      // 点击添加按钮
      const addBtn = colorContainer.locator('button.add, button:has(.next-icon-add)').first();
      await addBtn.click();
      await page.waitForTimeout(800);
    }
  }

  // 填写颜色值
  logger.info('  填写颜色值:');

  // 获取所有颜色输入框 - 使用更宽松的选择器
  const colorInputs = colorContainer.locator('input[type="text"], input[role="textbox"]').filter({
    has: page.locator('xpath=./parent::*[not(contains(@class, "备注"))]')
  });

  // 如果上面选择器不工作，使用备选
  let inputCount = await colorInputs.count().catch(() => 0);
  let inputs = colorInputs;

  if (inputCount < targetColors.length) {
    // 备选：直接获取所有 text input
    inputs = colorContainer.locator('input[type="text"]');
    inputCount = await inputs.count().catch(() => 0);
    logger.info(`  找到 ${inputCount} 个输入框`);
  }

  for (let i = 0; i < Math.min(targetColors.length, inputCount); i++) {
    const color = targetColors[i];
    const input = inputs.nth(i);

    try {
      // 清空并填入新值
      await input.click();
      await page.waitForTimeout(200);
      await input.fill('');
      await input.fill(color);
      await page.waitForTimeout(300);

      logger.info(`    第 ${i + 1} 个: ${color}`);
    } catch (e) {
      logger.info(`    第 ${i + 1} 个填写失败: ${e.message}`);
    }
  }

  // 验证最终数量
  const finalCount = await colorContainer.locator('.sell-color-item-wrap').count();
  logger.info(`  ✅ 颜色处理完成，保留了 ${finalCount} 个: ${targetColors.join(', ')}`);
}

/**
 * 处理尺码分类（使用模板+删除不需要的方式）
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
          await page.waitForTimeout(300);

          const deleteBtn = parentContainer.locator('button, [class*="delete"], [class*="ashbin"]').first();
          const btnExists = await deleteBtn.count();

          if (btnExists > 0) {
            await deleteBtn.click({ force: true });
            logger.info(`    删除尺码: ${sizeToDelete}`);
            await page.waitForTimeout(500);
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
        await page.waitForTimeout(500);
      } else {
        logger.info(`    未找到尺码: ${sizeToDelete}`);
      }

    } catch (e) {
      logger.info(`    删除 ${sizeToDelete} 失败: ${e.message}`);
    }
  }

  // 获取最终保留的尺码数量
  const keptSizes = TEMPLATE_SIZES.filter(size => targetSizesUpper.includes(size));
  logger.info(`  ✅ 尺码处理完成，保留: ${keptSizes.join(', ')}`);
}


/**
 * 步骤4：打开发布页面
 * 使用Playwright启动浏览器并打开发布相似品页面
 */
const step4 = async (ctx) => {
  ctx.logger.info('启动浏览器，打开发布页面');

  // 创建心跳定时器
  const heartbeat = setInterval(() => {
    process.stdout.write('.');
  }, 5000);

  let context;
  let page;
  let page1; // 发布页面

  try {
    // 获取配置
    const timeout = parseInt(process.env.TAOBAO_TIMEOUT || '30000');
    const screenshotDir = process.env.TAOBAO_SCREENSHOT_DIR ||
      path.resolve(process.cwd(), 'screenshots');

    // 确保截图目录存在
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    // 使用全局browser-manager获取context和页面
    ctx.logger.info('获取浏览器上下文...');
    context = await browserManager.getContext();
    page = await browserManager.getMainPage();
    ctx.logger.info('✅ 使用已有浏览器上下文和主页面');

    // 设置超时
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);

    // 只使用模板商品ID，直达发布页
    const templateItemId = ctx.templateItemId ||
      process.env.TEMPLATE_ITEM_ID ||
      (ctx.taskCache && (ctx.taskCache.templateItemId || ctx.taskCache.taobaoItemId));

    if (!templateItemId) {
      throw new Error('未配置 TEMPLATE_ITEM_ID（或 ctx.templateItemId），无法直达发布页面');
    }

    ctx.logger.info('🚀 使用模板商品直达发布页面...');
    ctx.logger.info(`模板商品ID: ${templateItemId}`);

    const directUrl = `https://item.upload.taobao.com/sell/v2/publish.htm?copyItem=true&itemId=${templateItemId}&fromAIPublish=true`;
    ctx.logger.info(`直达链接: ${directUrl}`);

    await page.bringToFront().catch(() => {});
    await page.goto(directUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeout
    });

    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      ctx.logger.warn('发布页未达到完全空闲状态，但继续执行（正常现象）');
    }
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('passport')) {
      throw new Error('登录状态已失效，请重新登录');
    }

    ctx.logger.success('✅ 已通过直达链接进入发布页面');
    page1 = page;

    ctx.logger.success('✅ 发布页面已打开');

    // 设置页面1的超时
    page1.setDefaultTimeout(timeout);

    // 等待发布页面加载（使用 try-catch 避免 networkidle 超时）
    try {
      await page1.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      ctx.logger.warn('发布页面未达到完全空闲状态，但继续执行');
    }
    await page1.waitForTimeout(3000);

    // 验证页面是否正确加载
    const pageTitle = await page1.title();
    ctx.logger.info(`页面标题: ${pageTitle}`);

    // 检查是否在正确的发布页面
    if (pageTitle.includes('发布') || page1.url().includes('publish')) {
      ctx.logger.success('✅ 成功进入发布页面');
    } else {
      ctx.logger.warn('页面可能未正确加载，但继续执行');
    }

    // 保存页面引用到上下文
    ctx.page = page; // 主页面
    ctx.page1 = page1; // 发布页面

    // ============================================
    // 新流程：使用通用模板 + 删除多余项
    // ============================================

    // 从缓存中获取颜色和尺码列表
    const taskCacheData = loadTaskCache(ctx.productId);
    let colors = [];
    let sizes = [];

    if (taskCacheData && taskCacheData.productData) {
      // 获取颜色
      if (taskCacheData.productData.colors) {
        const rawColors = taskCacheData.productData.colors;
        if (Array.isArray(rawColors)) {
          colors = rawColors.map(c => {
            if (typeof c === 'string') return c;
            return c.colorName || c.skuColor || c.name || c;
          });
        }
      }

      // 获取尺码
      const rawSizes = taskCacheData.productData.sizes || taskCacheData.productData.sizeList;
      if (Array.isArray(rawSizes)) {
        sizes = rawSizes.map(s => {
          if (typeof s === 'string') return s;
          return s.sizeName || s.name || s;
        });
      }
    }

    ctx.logger.info(`\n从缓存获取数据:`);
    ctx.logger.info(`  颜色: ${colors.length > 0 ? colors.join(', ') : '无'}`);
    ctx.logger.info(`  尺码: ${sizes.length > 0 ? sizes.join(', ') : '无'}`);

    if (colors.length === 0 && sizes.length === 0) {
      ctx.logger.warn('⚠️ 缓存中没有颜色和尺码数据，跳过销售属性设置');
    } else {
      try {
        // 步骤1：进入销售信息页签
        await enterSalesInfo(page1, ctx.logger);

        // 步骤2：应用通用模板
        await applyGeneralTemplate(page1, ctx.logger);

        // 步骤3：处理颜色分类
        if (colors.length > 0) {
          await processColors(page1, colors, ctx.logger);
        } else {
          ctx.logger.warn('  ⚠️ 没有颜色数据，跳过颜色处理');
        }

        // 步骤4：处理尺码分类
        if (sizes.length > 0) {
          await processSizes(page1, sizes, ctx.logger);
        } else {
          ctx.logger.warn('  ⚠️ 没有尺码数据，跳过尺码处理');
        }

        ctx.logger.success('\n✅ 销售属性设置完成');

      } catch (e) {
        ctx.logger.warn(`⚠️ 销售属性设置失败: ${e.message}`);
        ctx.logger.info('  可手动操作完成');
      }
    }

    // 截图保存（使用 try-catch 避免截图超时阻断流程）
    try {
      const screenshotPath = path.join(
        screenshotDir,
        `${ctx.productId}_step4_publish_page.png`
      );
      await page1.screenshot({
        path: screenshotPath,
        fullPage: false,  // 只截取可见区域，避免等待整页加载
        timeout: 10000    // 10秒超时
      });
      ctx.logger.info(`截图已保存: ${screenshotPath}`);
    } catch (screenshotError) {
      ctx.logger.warn(`截图失败（但不影响流程）: ${screenshotError.message}`);
    }

    // 更新缓存
    const taskCache = loadTaskCache(ctx.productId);
    taskCache.browserContext = {
      browser: true,
      pageCount: context ? context.pages().length : 1,
      publishPageUrl: page1.url(),
      templateItemId
    };
    taskCache.stepStatus[4] = 'done';
    saveTaskCache(ctx.productId, taskCache);

    updateStepStatus(ctx.productId, 4, 'done');

    ctx.logger.success('\n=== 步骤4完成 ===');
    ctx.logger.info(`发布页面URL: ${page1.url()}`);
    ctx.logger.info('浏览器已就绪，可以继续下一步');

  } catch (error) {
    ctx.logger.error(`打开发布页面失败: ${error.message}`);

    // 尝试截图保存错误信息
    if (page) {
      try {
        const errorScreenshot = path.join(
          screenshotDir,
          `${ctx.productId}_step4_error.png`
        );
        await page.screenshot({ path: errorScreenshot, fullPage: true });
        ctx.logger.info(`错误截图已保存: ${errorScreenshot}`);
      } catch (screenshotError) {
        ctx.logger.error(`截图失败: ${screenshotError.message}`);
      }
    }

    // 注意：不关闭浏览器，保持打开状态供后续步骤使用
    ctx.logger.info('💡 浏览器保持打开状态，供后续步骤使用');

    updateStepStatus(ctx.productId, 4, 'failed');
    throw error;

  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');

    // 浏览器保持打开状态，供后续步骤使用
  }
};

module.exports = { step4 };
