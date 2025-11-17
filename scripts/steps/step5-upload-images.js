const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
const { closeMaterialCenterPopups } = require('../utils/advert-handler');

// 素材库弹窗中的搜索框常见选择器（按优先级排序）
const SEARCH_INPUT_SELECTORS = [
  'input[placeholder="请输入文件夹名称"]',
  'input[placeholder="请输入文件夹名称/图片文件名"]',
  'input[placeholder*="请输入文件夹名称"]',
  'input[placeholder*="文件夹名称"]',
  'input[placeholder*="文件夹"]',
  'input[aria-placeholder*="文件夹"]',
  'input[aria-label*="文件夹"]',
  '.next-input input[placeholder*="文件夹"]',
  '.next-input input[aria-label*="文件夹"]',
  '.next-input-inner[placeholder*="文件夹"]',
  '#J_searchFolderName input',
  '#J_searchFolderName',
  '.folder-search-input input',
  '.folder-search input',
  '.material-dialog-folder-search input',
  '.PicGroupDialog_folderSearchInput__ input',
  '.PicGroupDialog_searchInput__ input',
  '[data-placeholder*="文件夹"]',
  '[data-testid="folder-search-input"] input'
];

/**
 * 在素材库弹窗中查找文件夹搜索框
 */
async function findFolderSearchInput(rootLocator) {
  for (const selector of SEARCH_INPUT_SELECTORS) {
    try {
      const candidate = rootLocator.locator(selector).first();
      const count = await candidate.count();
      if (count > 0) {
        return { locator: candidate, selector };
      }
    } catch (error) {
      // 忽略当前选择器的错误，尝试下一个
    }
  }
  return null;
}

/**
 * 步骤5：上传1:1主图
 * 上传商品主图到素材库并选择
 */
const step5 = async (ctx) => {
  ctx.logger.info('开始上传1:1主图');

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
    if (!taskCache.productData || !taskCache.productData.colors) {
      throw new Error('缓存中没有商品颜色信息');
    }

    const colors = taskCache.productData.colors;
    const colorCount = colors.length;
    ctx.logger.info(`商品颜色数量: ${colorCount}`);

    // 根据颜色数量确定策略
    const strategy = determineUploadStrategy(colorCount);
    ctx.logger.info(`使用策略: ${strategy.name}`);

    // ========== 新流程开始 ==========

    // 步骤0：先点击左侧"1:1主图"导航（如果存在）
    ctx.logger.info('\n[步骤0] 定位到1:1主图区域');
    try {
      // 查找左侧导航中的"1:1主图"链接
      const mainImageNav = await page.$('text=1:1主图, [href*="mainImage"], a:has-text("主图")');
      if (mainImageNav) {
        await mainImageNav.click();
        ctx.logger.success('✅ 已点击左侧"1:1主图"导航');
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      ctx.logger.warn('未找到左侧导航，继续执行');
    }

    // 步骤1：滚动到页面顶部（双保险滚动）
    ctx.logger.info('\n[步骤1] 滚动到页面顶部');

    // 双保险滚动函数：先定位主图区域，再滚动窗口
    const scrollToTop = async () => {
      await page.evaluate(() => {
        const group = document.querySelector('#struct-mainImagesGroup');
        if (group) {
          group.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
      });
    };

    await scrollToTop();
    await page.waitForTimeout(1000);
    ctx.logger.success('✅ 已滚动到顶部（双保险）');

    // 保存调试截图（查看滚动后的页面状态）
    try {
      const debugScreenshot = '/Users/sanshui/Desktop/tbzhuaqu/screenshots/debug_before_click.png';
      await page.screenshot({ path: debugScreenshot, fullPage: false });
      ctx.logger.info(`📸 调试截图: ${debugScreenshot}`);
    } catch (e) {
      ctx.logger.warn('调试截图失败');
    }

    // 步骤2：禁用其他上传位，防止误点击
    ctx.logger.info('\n[步骤2] 禁用其他上传位');
    await page.evaluate(() => {
      // 找到所有上传框
      const uploadBoxes = document.querySelectorAll('.upload-pic-box, [class*="upload"], .sell-field-mainImagesGroup .upload-item');
      uploadBoxes.forEach((box, index) => {
        if (index > 0) {
          box.style.pointerEvents = 'none';
          box.style.opacity = '0.5';
        }
      });
    });
    ctx.logger.success('✅ 已禁用其他上传位');

    // 禁用后再次滚动，防止页面跳动
    await scrollToTop();
    await page.waitForTimeout(500);

    // 步骤3：点击第一个白底图上传位
    ctx.logger.info('\n[步骤3] 点击第一个白底图上传位');

    // 多种可能的选择器，优先级从高到低（根据实际DOM结构优化）
    const uploadBoxSelectors = [
      // 优先：精确的class选择器
      '.sell-component-info-wrapper-component-child div.placeholder',
      'div.placeholder',
      '[data-testid="upload-placeholder"]',
      '.upload-pic-box.placeholder',

      // 次选：通过结构和文本查找
      '.sell-field-mainImagesGroup .upload-pic-box:first-child',
      '.upload-pic-box:first-child',
      '[class*="mainImages"] .upload-item:first-child',
      '[class*="mainImagesGroup"] div:first-child',

      // 备选：通过文本内容查找
      'div:has-text("上传图片")',
      'button:has-text("上传图片")',
      '[class*="upload"]:has-text("上传图片")',

      // 最后：通过父容器查找第一个子元素
      '.white-bg-image .upload-box:first-child',
      '#struct-mainImagesGroup div[class*="upload"]:first-child',

      // 兜底：图片上传icon
      'svg[class*="upload"]',
      'i[class*="upload"]'
    ];

    let uploadBoxClicked = false;
    for (const selector of uploadBoxSelectors) {
      try {
        const locator = page.locator(selector).first();
        const count = await locator.count();
        if (count > 0) {
          // 增强点击策略：
          // 1. 确保元素可见并滚动到视图中
          await locator.scrollIntoViewIfNeeded({ timeout: 3000 });

          // 2. 等待元素稳定（动画完成）
          await page.waitForTimeout(300);

          // 3. 等待元素可交互
          await locator.waitFor({ state: 'visible', timeout: 3000 });

          // 4. 尝试点击（如果被遮挡，使用force）
          try {
            await locator.click({ timeout: 5000 });
          } catch (clickErr) {
            ctx.logger.warn(`常规点击失败，尝试强制点击: ${clickErr.message}`);
            await locator.click({ force: true, timeout: 5000 });
          }

          ctx.logger.success(`✅ 已点击第一个上传位（${selector}）`);
          uploadBoxClicked = true;
          break;
        }
      } catch (e) {
        ctx.logger.warn(`尝试选择器失败: ${selector} - ${e.message}`);
        continue;
      }
    }

    if (!uploadBoxClicked) {
      throw new Error('无法找到上传位，请检查页面结构');
    }

    // 点击后等待弹窗开始加载
    ctx.logger.info('等待弹窗开始出现...');
    await page.waitForTimeout(2000);  // 增加到2秒，给弹窗足够的时间开始加载

    // 调试截图：查看点击后的状态
    const debugScreenshotAfter = '/Users/sanshui/Desktop/tbzhuaqu/screenshots/debug_after_click.png';
    await page.screenshot({
      path: debugScreenshotAfter,
      fullPage: false
    });
    ctx.logger.info(`📸 点击后调试截图: ${debugScreenshotAfter}`);

    // 再次滚动到顶部，防止弹窗打开时页面跳动
    await scrollToTop();
    await page.waitForTimeout(500);

    // 等待弹窗出现（增强版：增加等待时间和多种检测方式）
    ctx.logger.info('\n等待"选择图片"弹窗出现...');

    let popupDetected = false;
    try {
      // 方式1：等待 iframe（素材库通常在 iframe 中）
      await page.waitForSelector('iframe', { timeout: 15000 });
      ctx.logger.success('✅ 检测到 iframe');
      popupDetected = true;
    } catch (e) {
      ctx.logger.warn('未检测到 iframe，尝试其他方式...');
    }

    if (!popupDetected) {
      try {
        // 方式2：等待素材库特征元素
        await page.waitForSelector('.next-dialog, [class*="material"], [class*="upload"]', { timeout: 10000 });
        ctx.logger.success('✅ 检测到弹窗元素');
        popupDetected = true;
      } catch (e) {
        ctx.logger.warn('未检测到弹窗元素，继续执行...');
      }
    }

    // 额外等待，确保弹窗内容完全加载
    ctx.logger.info('等待弹窗内容加载...');
    await page.waitForTimeout(5000);  // 从 2 秒增加到 5 秒
    ctx.logger.success('✅ 弹窗加载完成');

    // 步骤4：在弹出的"选择图片"对话框中搜索文件夹
    ctx.logger.info('\n[步骤4] 在弹窗中搜索文件夹');

    // 方案A：优先使用搜索框（根据实际弹窗结构）
    try {
      // 智能检测：弹窗可能在iframe中，也可能在普通弹窗中
      ctx.logger.info('  🔍 检测弹窗类型...');

      let searchInput;
      let workingLocator;  // 工作的定位器（iframe或page）

      // 方式1：遍历 iframe 查找搜索框（素材库弹窗通常位于 iframe 内）
      const iframeCount = await page.locator('iframe').count();
      if (iframeCount > 0) {
        ctx.logger.info(`  检测到 ${iframeCount} 个 iframe，优先在 iframe 中查找搜索框...`);

        for (let i = 0; i < iframeCount; i++) {
          const frameLocator = page.frameLocator('iframe').nth(i);
          const result = await findFolderSearchInput(frameLocator);
          if (result) {
            searchInput = result.locator;
            workingLocator = frameLocator;
            ctx.logger.success(`  ✅ 在第 ${i + 1} 个 iframe 中找到搜索框（${result.selector}）`);
            break;
          }
        }
      }

      // 方式2：如果 iframe 中未找到，则退回主页面查找
      if (!searchInput) {
        ctx.logger.info('  iframe 中未找到，尝试在主页面查找搜索框...');
        const resultInPage = await findFolderSearchInput(page);
        if (resultInPage) {
          searchInput = resultInPage.locator;
          workingLocator = page;
          ctx.logger.success(`  ✅ 在主页面中找到搜索框（${resultInPage.selector}）`);
        }
      }

      if (!searchInput) {
        throw new Error(`在弹窗中未找到搜索框（已尝试 ${SEARCH_INPUT_SELECTORS.length} 个候选选择器）`);
      }

      // 等待搜索框可见并可操作
      await searchInput.waitFor({ state: 'visible', timeout: 5000 });
      ctx.logger.success('  ✅ 搜索框已就绪');

      // 清空并输入 productId
      ctx.logger.info(`  ⌨️  准备输入商品ID: ${productId}`);
      await searchInput.click();
      await searchInput.fill('');
      await page.waitForTimeout(300);
      await searchInput.fill(productId);
      ctx.logger.success(`  ✅ 已输入商品ID: ${productId}`);

      // 等待下拉建议出现（增加等待时间并主动检测）
      ctx.logger.info('  ⏳ 等待下拉建议出现...');

      // 智能等待：检测下拉列表是否出现（最多等待5秒）
      let suggestionAppeared = false;
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(500);

        // 检查是否有下拉菜单出现（使用工作定位器）
        const dropdownVisible = await workingLocator.locator('.next-menu, .dropdown-menu, [role="listbox"], [class*="suggest"]').count();
        if (dropdownVisible > 0) {
          ctx.logger.success(`  ✅ 下拉建议已出现（等待${(i + 1) * 0.5}秒）`);
          suggestionAppeared = true;
          break;
        }

        // 等待中...
      }

      if (!suggestionAppeared) {
        ctx.logger.warn('  ⚠️  下拉建议未出现，继续尝试点击');
      }

      // 额外等待500ms确保渲染完成
      await page.waitForTimeout(500);

      // 查找并点击下拉建议中的文件夹项
      ctx.logger.info('  🎯 尝试点击下拉建议...');

      // 尝试多种可能的选择器（按优先级排序）
      const suggestionSelectors = [
        `.next-menu-item:has-text("${productId}")`,  // 最精确：菜单项
        `[role="option"]:has-text("${productId}")`,  // ARIA角色
        `.dropdown-item:has-text("${productId}")`,   // Bootstrap风格
        `li:has-text("${productId}")`,               // 列表项
        `text="${productId}"`,                       // 精确匹配文本
        `:has-text("${productId}")`,                 // 包含文本
        `div:has-text("${productId}")`,              // div元素
      ];

      let folderSelected = false;
      for (const selector of suggestionSelectors) {
        try {
          const suggestion = workingLocator.locator(selector).first();  // 使用工作定位器
          const count = await suggestion.count();

          // ctx.logger.info(`  🔎 尝试选择器: ${selector} (找到 ${count} 个)`);

          if (count > 0) {
            // 确保元素可见
            await suggestion.waitFor({ state: 'visible', timeout: 2000 });

            // 点击建议项
            await suggestion.click({ timeout: 3000 });
            ctx.logger.success(`  ✅ 成功点击下拉建议（选择器: ${selector}）`);

            folderSelected = true;
            break;
          }
        } catch (e) {
          // 选择器失败，继续...
          continue;
        }
      }

      if (!folderSelected) {
        throw new Error('未找到下拉建议项，将尝试左侧文件夹树');
      }

      ctx.logger.success(`✅ 已通过搜索选择文件夹: ${productId}`);

      // 等待文件夹内容加载（增加等待时间）
      ctx.logger.info('  ⏳ 等待文件夹内容加载...');
      await page.waitForTimeout(3000);  // 增加到3秒

      // 调试截图：查看文件夹打开后的状态
      const debugScreenshotFolder = '/Users/sanshui/Desktop/tbzhuaqu/screenshots/debug_folder_opened.png';
      await page.screenshot({
        path: debugScreenshotFolder,
        fullPage: false
      });
      ctx.logger.info(`  📸 文件夹打开后截图: ${debugScreenshotFolder}`);

    } catch (searchError) {
      // 方案B：搜索失败时，使用左侧文件夹树
      ctx.logger.warn(`\n⚠️  搜索框方案失败: ${searchError.message}`);
      ctx.logger.info('  🔄 切换到方案B：左侧文件夹树');

      try {
        // 智能检测：确定使用 iframe 还是主页面
        ctx.logger.info('  🔍 检测弹窗类型（用于文件夹树）...');

        let treeLocator;
        const iframeCount = await page.locator('iframe').count();

        if (iframeCount > 0) {
          ctx.logger.info('  使用 iframe 定位器');
          treeLocator = page.frameLocator('iframe').first();
        } else {
          ctx.logger.info('  使用主页面定位器');
          treeLocator = page;
        }

        ctx.logger.info('  📂 在左侧文件夹树中查找文件夹...');

        // 尝试多种可能的文件夹树选择器（按优先级排序）
        const treeFolderSelectors = [
          `[title="${productId}"]`,                    // title属性（最精确）
          `.folder-item:has-text("${productId}")`,     // 文件夹项
          `.PicGroupList :has-text("${productId}")`,   // PicGroupList中的元素
          `.folder-tree :has-text("${productId}")`,    // folder-tree中的元素
          `text="${productId}"`,                       // 精确文本匹配
          `:has-text("${productId}")`,                 // 包含文本
        ];

        let folderFound = false;
        for (const selector of treeFolderSelectors) {
          try {
            const folderInTree = treeLocator.locator(selector).first();  // 使用树定位器
            const count = await folderInTree.count();

            // ctx.logger.info(`  🔎 尝试树选择器: ${selector} (找到 ${count} 个)`);

            if (count > 0) {
              // 确保元素可见
              await folderInTree.waitFor({ state: 'visible', timeout: 2000 });

              // 点击文件夹
              await folderInTree.click({ timeout: 3000 });
              ctx.logger.success(`  ✅ 成功从侧边栏选择文件夹（选择器: ${selector}）`);

              folderFound = true;
              break;
            }
          } catch (e) {
            // 树选择器失败，继续...
            continue;
          }
        }

        if (!folderFound) {
          throw new Error(`在左侧文件夹树中未找到文件夹: ${productId}`);
        }

        ctx.logger.success(`✅ 已从侧边栏选择文件夹: ${productId}`);
        await page.waitForTimeout(2000);

        // 文件夹树操作后再次滚动
        await scrollToTop();
        await page.waitForTimeout(500);

      } catch (treeError) {
        // 保存错误截图
        try {
          const errorScreenshot = `/Users/sanshui/Desktop/tbzhuaqu/screenshots/step5-folder-selection-error-${productId}.png`;
          await page.screenshot({ path: errorScreenshot, fullPage: true });
          ctx.logger.error(`  📸 错误截图已保存: ${errorScreenshot}`);
        } catch (e) {
          // 忽略截图错误
        }

        throw new Error(`两种方案都失败了。\n搜索方案: ${searchError.message}\n树导航方案: ${treeError.message}`);
      }
    }

    // 获取工作定位器（用于后续操作图片列表）
    ctx.logger.info('\n[步骤5] 准备选择图片');
    let uploadLocator;
    const iframeCount = await page.locator('iframe').count();

    if (iframeCount > 0) {
      uploadLocator = page.frameLocator('iframe').first();
      ctx.logger.info('  使用 iframe 定位器操作图片列表');
    } else {
      uploadLocator = page;
      ctx.logger.info('  使用主页面定位器操作图片列表');
    }

    try {
      // 设置排序方式为文件名升序（可选，根据需要）
      ctx.logger.info('\n  设置文件名升序');
      try {
        await uploadLocator.locator('.next-btn:has-text("文件名")').click();
        await page.waitForTimeout(500);
        await uploadLocator.locator('text=文件名升序').click();
        ctx.logger.success('  ✅ 已设置文件名升序');
      } catch (e) {
        ctx.logger.warn('  设置排序失败，继续执行');
      }
      await page.waitForTimeout(1000);

      // 步骤6：检查并选择图片
      ctx.logger.info('\n[步骤6] 选择图片');

      // 尝试多种图片选择器（素材库图片可能有不同的class）
      // 注意：选择器需要足够具体，避免匹配到root或过大的容器
      const imageSelectors = [
        '.PicList_pic_background__pGTdV',                // 原选择器
        '[class*="PicList_pic"]:not([id="root"])',      // 包含 PicList_pic 的元素（排除root）
        '[class*="pic-item"]',                           // 图片项
        '[class*="image-item"]',                         // 图片项
        'a:has(> img[src*="alicdn"])',                   // 直接子元素是图片的链接
        'div[class*="item"]:has(> img[src*="alicdn"])',  // class包含item且直接子元素是图片的div
        'div[class]:has(> img[src*="alicdn"]):not([id])',  // 有class无id且直接子元素是图片的div
        'a:has(img)',                                    // 包含图片的链接
        'div[class*="pic"]:not(#root):has(img)',         // 包含图片的图片容器（排除root）
        'li:has(img[src*="alicdn"])',                    // 包含图片的列表项
        '[class*="card"]:has(img)',                      // 卡片容器
        '.pic-wrapper',                                  // 图片包装器
        '[data-role="pic-item"]'                         // 数据属性
      ];

      let imageCount = 0;
      let imageSelector = null;

      ctx.logger.info('  🔍 尝试查找图片...');
      for (const selector of imageSelectors) {
        const count = await uploadLocator.locator(selector).count();
        ctx.logger.info(`    尝试 "${selector}": ${count} 个`);
        if (count > 0) {
          imageCount = count;
          imageSelector = selector;
          ctx.logger.success(`  ✅ 使用选择器 "${selector}" 找到 ${count} 张图片`);
          break;
        }
      }

      if (imageCount === 0) {
        throw new Error('文件夹中没有找到图片（已尝试多个选择器）');
      }

      // 根据策略选择图片
      const selectedCount = await selectImages(uploadLocator, imageCount, strategy, ctx, imageSelector);
      ctx.logger.success(`✅ 已选择 ${selectedCount} 张图片`);

      // 步骤7：确认上传
      ctx.logger.info('\n[步骤7] 确认上传');
      const confirmButton = uploadLocator.locator(`.next-btn-primary:has-text("确定(${selectedCount})")`);
      await confirmButton.click();
      ctx.logger.success('✅ 点击确定按钮');
      await page.waitForTimeout(3000);

      // 关闭弹窗后再次滚动到顶部，确保页面不会跳回底部
      await scrollToTop();
      await page.waitForTimeout(500);
      ctx.logger.info('📍 弹窗关闭后保持页面在顶部');

      // 步骤8：检查上传结果
      ctx.logger.info('\n[步骤8] 验证上传结果');

      // 切换回主frame检查上传的图片
      const uploadedImages = await page.locator('.material-image-item').count();
      ctx.logger.success(`✅ 成功上传 ${uploadedImages} 张图片到素材库`);

      // 统计成功率
      const successRate = (uploadedImages / Math.min(imageCount, 6) * 100).toFixed(1);
      ctx.logger.info(`上传成功率: ${successRate}%`);

      // 步骤9：保存截图
      const screenshotDir = process.env.TAOBAO_SCREENSHOT_DIR ||
        path.resolve(process.cwd(), 'screenshots');

      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      const screenshotPath = path.join(
        screenshotDir,
        `${productId}_step5_uploaded.png`
      );

      await page.screenshot({ path: screenshotPath, fullPage: true });
      ctx.logger.info(`截图已保存: ${screenshotPath}`);

      // 更新缓存
      taskCache.uploadResults = {
        strategy: strategy.name,
        totalImages: imageCount,
        selectedImages: selectedCount,
        uploadedImages: uploadedImages,
        successRate: parseFloat(successRate),
        colorCount: colorCount,
        timestamp: new Date().toISOString()
      };

      taskCache.stepStatus[5] = 'done';
      saveTaskCache(productId, taskCache);

      updateStepStatus(productId, 5, 'done');

      // 输出总结
      ctx.logger.success('\n=== 主图上传完成 ===');
      ctx.logger.info(`策略: ${strategy.name}`);
      ctx.logger.info(`原始图片数: ${imageCount}`);
      ctx.logger.info(`选择图片数: ${selectedCount}`);
      ctx.logger.info(`成功上传: ${uploadedImages}`);
      ctx.logger.info(`成功率: ${successRate}%`);

    } catch (error) {
      ctx.logger.error(`上传失败: ${error.message}`);

      // 尝试降级策略
      if (strategy.canFallback) {
        ctx.logger.info('尝试降级策略...');
        await applyFallbackStrategy(page, productId, ctx);
      } else {
        throw error;
      }
    }

  } catch (error) {
    ctx.logger.error(`主图上传失败: ${error.message}`);

    // 保存错误截图
    if (ctx.page1) {
      try {
        const errorScreenshot = path.join(
          path.resolve(process.cwd(), 'screenshots'),
          `${ctx.productId}_step5_error.png`
        );
        await ctx.page1.screenshot({ path: errorScreenshot, fullPage: true });
        ctx.logger.info(`错误截图: ${errorScreenshot}`);
      } catch (e) {
        // 忽略截图错误
      }
    }

    updateStepStatus(ctx.productId, 5, 'failed');
    throw error;

  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');
  }
};

/**
 * 确定上传策略
 */
function determineUploadStrategy(colorCount) {
  if (colorCount === 1) {
    return {
      name: '单色策略',
      maxImages: 6,
      canFallback: true,
      description: '选择第一张主图（带商品ID）'
    };
  } else if (colorCount === 2) {
    return {
      name: '双色策略',
      maxImages: 6,
      canFallback: true,
      description: '颜色1选主图，颜色2选2张图'
    };
  } else {
    return {
      name: '多色策略',
      maxImages: 6,
      canFallback: true,
      description: '每个颜色选1张，最多6张'
    };
  }
}

/**
 * 选择图片
 */
async function selectImages(uploadFrame, imageCount, strategy, ctx, imageSelector) {
  let selectedCount = 0;

  // 使用传入的选择器，如果未传入则使用默认值
  const selector = imageSelector || '.PicList_pic_background__pGTdV';

  switch (strategy.name) {
    case '单色策略':
      // 单色：选择前6张
      selectedCount = Math.min(imageCount, 6);
      for (let i = 0; i < selectedCount; i++) {
        await uploadFrame.locator(selector).nth(i).click();
        await uploadFrame.waitForTimeout(200);
      }
      break;

    case '双色策略':
      // 双色：第一张主图（带商品ID）+ 第二色的前2张
      // 先找带商品ID的图片
      const hasProductId = await uploadFrame.locator(`${selector}:has-text("${ctx.productId}")`).count();
      if (hasProductId > 0) {
        await uploadFrame.locator(`${selector}:has-text("${ctx.productId}")`).first().click();
        selectedCount++;
      }

      // 再从颜色2选择2张
      const remaining = Math.min(imageCount - selectedCount, 2);
      for (let i = selectedCount; i < selectedCount + remaining && i < imageCount; i++) {
        await uploadFrame.locator(selector).nth(i).click();
        await uploadFrame.waitForTimeout(200);
      }
      selectedCount += remaining;
      break;

    default:
      // 多色：每个颜色选1张
      selectedCount = Math.min(imageCount, 6);
      for (let i = 0; i < selectedCount; i++) {
        await uploadFrame.locator(selector).nth(i).click();
        await uploadFrame.waitForTimeout(200);
      }
  }

  return selectedCount;
}

/**
 * 应用降级策略
 */
async function applyFallbackStrategy(page, productId, ctx) {
  ctx.logger.info('应用降级策略：选择所有可见图片');

  try {
    // 重新打开上传对话框
    await page.click('.next-tabs-tab:has-text("素材库")');
    await page.waitForTimeout(2000);

    // 处理素材库页面的广告弹窗
    await closeMaterialCenterPopups(page);

    await page.click('.next-tabs-tab:has-text("图片")');
    await page.click('text=上传图片');
    await page.waitForTimeout(2000);

    // 选择所有图片
    const uploadFrame = page.frameLocator('iframe').first();
    const allImages = await uploadFrame.locator('.PicList_pic_background__pGTdV').count();

    for (let i = 0; i < allImages; i++) {
      await uploadFrame.locator('.PicList_pic_background__pGTdV').nth(i).click();
      await uploadFrame.waitForTimeout(100);
    }

    await uploadFrame.locator('.next-btn-primary:has-text("确定")').click();
    await page.waitForTimeout(3000);

    ctx.logger.success('✅ 降级策略执行成功');
  } catch (error) {
    ctx.logger.error(`降级策略失败: ${error.message}`);
    throw error;
  }
}

module.exports = { step5 };
