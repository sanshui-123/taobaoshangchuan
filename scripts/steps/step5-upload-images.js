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
    const brand = (taskCache.productData.brand || '').trim();
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

    // 🔧 修复：设置 filechooser 事件监听器，拦截可能出现的原生文件对话框
    // 当点击上传位时，如果触发了 <input type="file">，会弹出系统文件选择器（Finder）
    // 使用 once 监听器来自动取消这个对话框，避免它一直挂在前面
    let fileChooserTriggered = false;
    const fileChooserHandler = async (fileChooser) => {
      fileChooserTriggered = true;
      ctx.logger.warn('  ⚠️  检测到原生文件对话框，自动取消...');
      // 取消文件选择器（不选择任何文件）
      await fileChooser.setFiles([]);
      // 双保险：按 Escape 确保关闭
      await page.keyboard.press('Escape');
      ctx.logger.info('  ✅ 原生文件对话框已关闭');
    };
    page.once('filechooser', fileChooserHandler);

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
      // 移除未触发的事件监听器
      page.removeListener('filechooser', fileChooserHandler);
      throw new Error('无法找到上传位，请检查页面结构');
    }

    // 等待一小段时间看 filechooser 是否被触发
    await page.waitForTimeout(500);

    // 移除未触发的事件监听器（避免内存泄漏）
    if (!fileChooserTriggered) {
      page.removeListener('filechooser', fileChooserHandler);
      ctx.logger.info('  素材库弹窗模式（未触发原生文件对话框）');
    }

    // 点击后等待弹窗开始加载
    ctx.logger.info('等待弹窗开始出现...');
    await page.waitForTimeout(800);  // 缩短固定等待

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

    // 等待弹窗出现（限时 8 秒）
    ctx.logger.info('\n等待"选择图片"弹窗出现...');

    let popupDetected = false;
    const popupStart = Date.now();
    try {
      // 方式1：等待 iframe（素材库通常在 iframe 中）
      await page.waitForSelector('iframe', { timeout: 5000 });
      ctx.logger.success('✅ 检测到 iframe');
      popupDetected = true;
    } catch (e) {
      ctx.logger.warn('未检测到 iframe，尝试其他方式...');
    }

    if (!popupDetected) {
      try {
        // 方式2：等待素材库特征元素
        await page.waitForSelector('.next-dialog, [class*="material"], [class*="upload"]', { timeout: 3000 });
        ctx.logger.success('✅ 检测到弹窗元素');
        popupDetected = true;
      } catch (e) {
        ctx.logger.warn('未检测到弹窗元素，继续执行...');
      }
    }

    if (!popupDetected || Date.now() - popupStart > 8000) {
      throw new Error('等待素材库弹窗超时');
    }

    // 等待弹窗内容加载（最长 0.5 秒）
    ctx.logger.info('等待弹窗内容加载...');
    await page.waitForTimeout(200);
    ctx.logger.success('✅ 弹窗加载完成');

    // 步骤4：在弹出的"选择图片"对话框中搜索文件夹
    ctx.logger.info('\n[步骤4] 在弹窗中搜索文件夹');

    // 声明工作定位器（需要在try外部声明，以便后续步骤使用）
    let workingLocator;  // 工作的定位器（iframe或page）

    // 方案A：优先使用搜索框（根据实际弹窗结构）
    try {
      // 智能检测：弹窗可能在iframe中，也可能在普通弹窗中
      ctx.logger.info('  🔍 检测弹窗类型...');

      let searchInput;

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

      // 等待下拉建议出现（最多 3 秒，每 0.5 秒检查一次）
      ctx.logger.info('  ⏳ 等待下拉建议出现...');
      let suggestionAppeared = false;
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(500);

        // 检查是否有下拉菜单出现（使用工作定位器）
        const dropdownVisible = await workingLocator.locator('.next-menu, .dropdown-menu, [role="listbox"], [class*="suggest"]').count();
        if (dropdownVisible > 0) {
          ctx.logger.success(`  ✅ 下拉建议已出现（等待${(i + 1) * 0.5}秒）`);
          suggestionAppeared = true;
          break;
        }
      }

      if (!suggestionAppeared) {
        ctx.logger.warn('  ⚠️  下拉建议未出现，继续尝试点击');
      }

      // 额外等待300ms确保渲染完成
      await page.waitForTimeout(300);

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

      // 等待文件夹内容加载（关键：必须等待图片卡片出现）
      ctx.logger.info('  ⏳ 等待文件夹内容加载...');

      // 主动等待图片卡片容器出现（不是等固定时间）
      let imagesLoaded = false;
      const imageCardSelectors = [
        '.PicList_pic_background__pGTdV',     // 主选择器
        '[class*="PicList_pic"]',             // 备选
        'div[class*="pic"]:has(img)'          // 兜底
      ];

      // 最多等待6秒，每0.5秒检查一次
      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(500);

        for (const selector of imageCardSelectors) {
          const count = await workingLocator.locator(selector).count();
          if (count > 0) {
            ctx.logger.success(`  ✅ 文件夹内容已加载（${count}个图片卡片，${(i + 1) * 0.5}秒）`);
            imagesLoaded = true;
            break;
          }
        }

        if (imagesLoaded) break;
      }

      if (!imagesLoaded) {
        ctx.logger.warn('  ⚠️  图片卡片未在6秒内加载，继续执行...');
      }

      // 额外等待300ms确保动画完成
      await page.waitForTimeout(300);

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

    // 复用搜索时的工作定位器（关键：必须使用同一个iframe上下文！）
    ctx.logger.info('\n[步骤5] 准备选择图片');
    // workingLocator 是在搜索文件夹时已经确定的正确iframe定位器
    // 直接复用它，不要重新创建，避免定位到错误的iframe
    const uploadLocator = workingLocator;
    ctx.logger.info('  ✅ 复用搜索时的定位器（确保在同一iframe上下文）');

    // 排序：文件名降序
    const applySortDescending = async () => {
      try {
        ctx.logger.info('  排序：尝试点击排序下拉并选择“文件名降序”');
        const triggers = [
          uploadLocator.locator('.next-select-trigger, .next-select').filter({ hasText: /上传时间|文件名/ }).first(),
          uploadLocator.getByRole('button', { name: /上传时间|文件名/ }).first()
        ];
        let trigger = null;
        for (const t of triggers) {
          if (t && await t.count()) { trigger = t; break; }
        }
        if (trigger) {
          await trigger.click({ force: true });
          await page.waitForTimeout(300);
          const option = uploadLocator.locator('li.next-menu-item:has-text("文件名降序")').first();
          if (await option.count()) {
            await option.click({ force: true });
            ctx.logger.info('  ✅ 已选择“文件名降序”');
            await page.waitForTimeout(400);
          } else {
            ctx.logger.warn('  ⚠️ 未找到“文件名降序”选项，继续默认排序');
          }
        } else {
          ctx.logger.warn('  ⚠️ 未找到排序下拉，继续默认排序');
        }
      } catch (e) {
        ctx.logger.warn(`  ⚠️ 排序操作失败（忽略继续）: ${e.message}`);
      }
    };

    try {
      await applySortDescending();
      await page.waitForTimeout(200);

      // 步骤6：检查并选择图片
      ctx.logger.info('\n[步骤6] 选择图片');

      // 图片卡片容器选择器（优先级排序，基于实际DOM调试结果）
      // 重要：点击的是包含图片的卡片容器，而不是<img>元素本身
      const imageCardSelectors = [
        '.PicList_pic_background__pGTdV',               // ✅ 主选择器（调试确认）
        '.PicList_pic_imgBox__c0HXw',                   // 图片包装盒
        '[class*="PicList_pic_background"]',            // PicList背景容器（模糊匹配）
        '[class*="PicList_pic"]:not([id])',             // PicList相关元素（排除有id的）
        'div[class*="pic"][class*="background"]',       // 包含pic和background的div
        'div[class*="picItem"]',                        // 图片项容器
        'div[class*="pic-item"]',                       // 图片项（短横线形式）
        'label:has(img[src*="alicdn"])',                // label包装的图片
        'button:has(img[src*="alicdn"])',               // button包装的图片
        'div[role="button"]:has(img)',                  // 角色为button的div
        'a:has(img[src*="alicdn"])',                    // 链接包装的图片
        '[data-role="pic-item"]'                        // 数据属性标记的图片项
      ];

      let imageCount = 0;
      let imageCardSelector = null;

      ctx.logger.info('  🔍 尝试查找图片卡片容器...');
      for (const selector of imageCardSelectors) {
        const count = await uploadLocator.locator(selector).count();
        ctx.logger.info(`    尝试 "${selector}": ${count} 个`);
        if (count > 0) {
          imageCount = count;
          imageCardSelector = selector;
          ctx.logger.success(`  ✅ 使用选择器 "${selector}" 找到 ${count} 个图片卡片`);
          break;
        }
      }

      if (imageCount === 0) {
        throw new Error('文件夹中没有找到图片卡片容器（已尝试多个选择器）');
      }

      // 根据颜色数智能选择图片（使用新的选择规则）
      const selectedCount = await selectImagesByRules(
        uploadLocator,
        imageCount,
        colorCount,
        brand,
        productId,
        ctx,
        imageCardSelector  // 传入实际命中的卡片选择器，避免类名不一致
      );
      ctx.logger.success(`✅ 已选择 ${selectedCount} 张图片`);

      // ==================== 上传完成检查（限时） ====================
      ctx.logger.info('\n[步骤7] 检查上传完成状态...');
      let uploadComplete = false;
      const uploadStart = Date.now();
      const successMessages = [
        '.upload-success:has-text("成功")',
        '.next-message:has-text("上传成功")',
        '.upload-complete:has-text("完成")',
        '[class*="success"]:has-text("上传")',
        'text=上传成功',
        'text=文件上传成功',
        'text=批量上传成功'
      ];

      for (let i = 0; i < 8; i++) {
        // 检查成功提示
        let successDetected = false;
        for (const selector of successMessages) {
          const visible = await page.locator(selector).first().isVisible({ timeout: 300 }).catch(() => false);
          if (visible) {
            ctx.logger.info(`✅ 检测到上传成功提示: ${selector}`);
            successDetected = true;
            break;
          }
        }

        // 检查进度条/加载
        const progressBars = await page.locator('.next-progress-line, .upload-progress, .progress-bar, [class*="progress"]').count().catch(() => 0);
        const loadingCount = await page.locator('.next-loading, .loading, .spinner').count().catch(() => 0);

        if (successDetected || (progressBars === 0 && loadingCount === 0)) {
          uploadComplete = true;
          break;
        }

        if (Date.now() - uploadStart > 8000) break;
        await page.waitForTimeout(1000);
      }

      if (!uploadComplete) {
        ctx.logger.warn('⚠️ 上传完成检查超时，继续后续流程（可能已上传）');
      } else {
        ctx.logger.info('✅ 上传完成检查通过');
      }

      // ==================== 文件列表验证（限 3 次） ====================
      ctx.logger.info('\n[步骤8] 验证文件是否出现在列表中...');
      const fileSelectors = [
        'img[src*="color_"]',
        '.file-item img[src*="color_"]',
        '[class*="file"] img[src*="color_"]',
        '.image-item img[src*="color_"]',
        '.material-item img[src*="color_"]'
      ];
      let filesDetected = false;
      for (let i = 0; i < 3; i++) {
        ctx.logger.info(`[步骤8-详细] 第${i + 1}次检查文件列表...`);
        for (const selector of fileSelectors) {
          const count = await uploadLocator.locator(selector).count().catch(() => 0);
          if (count > 0) {
            ctx.logger.info(`✅ 找到 ${count} 个文件匹配 ${selector}`);
            filesDetected = true;
            break;
          }
        }
        if (filesDetected) break;
        await page.waitForTimeout(1000);
      }
      if (!filesDetected) {
        ctx.logger.warn('⚠️ 未能在文件列表中找到上传的color图片，可能页面渲染延迟或结构变化');
      }

      // 标记完成
      taskCache.stepStatus[5] = 'done';
      saveTaskCache(productId, taskCache);
      updateStepStatus(productId, 5, 'done');

      // 输出总结
      ctx.logger.success('\n=== 主图选择完成 ===');
      ctx.logger.info(`策略: ${strategy.name}`);
      ctx.logger.info(`总图片数: ${imageCount}`);
      ctx.logger.info(`已选择: ${selectedCount} 张`);

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
 * 增强的图片卡片点击函数
 * @param {Locator} cardLocator - 图片卡片定位器
 * @param {number} index - 索引（用于日志）
 * @param {object} ctx - 上下文
 */
async function clickImageCard(cardLocator, index, ctx) {
  try {
    // 1. 滚动到视图中
    await cardLocator.scrollIntoViewIfNeeded({ timeout: 3000 });

    // 2. 等待可见并稳定
    await cardLocator.waitFor({ state: 'visible', timeout: 3000 });

    // 3. 等待300ms让动画完成
    await new Promise(resolve => setTimeout(resolve, 300));

    // 4. 点击
    await cardLocator.click({ timeout: 3000 });

    ctx.logger.info(`    ✓ 已选择第 ${index + 1} 张图片`);
    return true;
  } catch (error) {
    ctx.logger.warn(`    ✗ 选择第 ${index + 1} 张图片失败: ${error.message}`);
    return false;
  }
}

/**
 * 正数索引选择（first）
 * @param {number} k - 位置参数（从1开始）
 * @param {number} imageCount - 图片总数
 * @returns {number} 安全的索引值（从0开始）
 */
function pickIndexFirst(k, imageCount) {
  let index = k - 1;  // first(k) → k - 1，例如 first(6) = 索引5

  // 边界保护
  if (index < 0) index = 0;
  if (index >= imageCount) index = imageCount - 1;

  return index;
}

/**
 * 倒数索引选择（last）
 * @param {number} k - 倒数位置参数（从1开始）
 * @param {number} imageCount - 图片总数
 * @returns {number} 安全的索引值（从0开始）
 */
function pickIndexLast(k, imageCount) {
  let index = imageCount - k;  // last(k) → imageCount - k，例如 last(1) = 最后一张

  // 边界保护
  if (index < 0) index = 0;
  if (index >= imageCount) index = imageCount - 1;

  return index;
}

/**
 * 根据颜色数智能选择图片
 * 新规则：统一点击5张，每一击根据颜色数决定点击倒数/正数第几个元素
 * Le Coq品牌特例：从最后往前取5张
 * @param {Locator} uploadFrame - 上传弹窗的定位器（iframe或page）
 * @param {number} imageCount - 图片总数
 * @param {number} colorCount - 颜色数量
 * @param {string} brand - 品牌名
 * @param {string} productId - 商品ID
 * @param {object} ctx - 上下文对象
 * @param {string} imageCardSelector - 命中的图片卡片选择器
 * @returns {number} 成功选择的图片数量
 */
async function selectImagesByRules(uploadFrame, imageCount, colorCount, brand, productId, ctx, imageCardSelector) {
  let selectedCount = 0;

  ctx.logger.info(`\n📋 开始智能选择图片`);
  ctx.logger.info(`  品牌: ${brand}`);
  ctx.logger.info(`  颜色数: ${colorCount}`);
  ctx.logger.info(`  总图片数: ${imageCount}`);

  // ========== 品牌特例：倒序取5张 ==========
  const specialBrands = ['Le Coq公鸡乐卡克', 'PEARLY GATES', '万星威Munsingwear', 'Munsingwear'];
  if (specialBrands.includes(brand)) {
    ctx.logger.info(`  ✨ 品牌特例(${brand})：直接从最后往前取 5 张主图\n`);

    // 缓存所有图片元素
    const cardLocator = uploadFrame.locator(imageCardSelector || '.PicList_pic_background__pGTdV');
    ctx.logger.info(`  📦 使用选择器 "${imageCardSelector || '.PicList_pic_background__pGTdV'}" 缓存图片列表...`);
    const cardHandles = await cardLocator.elementHandles();
    ctx.logger.info(`  ✅ 已缓存 ${cardHandles.length} 个图片元素\n`);

    // 确定要选择的图片数量（最多5张，如果少于5张则全取）
    const selectCount = Math.min(5, cardHandles.length);
    ctx.logger.info(`  📋 计划选择: ${selectCount} 张图片（从最后往前）\n`);

    // 从最后一张往前选择
    for (let i = 0; i < selectCount; i++) {
      const targetIndex = cardHandles.length - 1 - i;  // 倒数第(i+1)张
      ctx.logger.info(`第${i+1}张 → 索引${targetIndex} (倒数第${i+1}张)`);

      try {
        const cardHandle = cardHandles[targetIndex];

        if (!cardHandle) {
          ctx.logger.warn(`  ⚠️  索引${targetIndex}没有元素，跳过`);
          continue;
        }

        // 滚动到视图中
        await cardHandle.scrollIntoViewIfNeeded({ timeout: 3000 });

        // 等待动画稳定
        await new Promise(resolve => setTimeout(resolve, 300));

        // 点击图片卡片
        await cardHandle.click({ timeout: 3000 });

        selectedCount++;
        ctx.logger.info(`  ✅ 第${i+1}张 → 索引${targetIndex} → 成功`);

      } catch (error) {
        ctx.logger.warn(`  ❌ 第${i+1}张 → 失败: ${error.message}`);
      }

      // 点击间隔
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    ctx.logger.info(`\n✅ 品牌特例图片选择完成：成功 ${selectedCount}/${selectCount} 张\n`);
    return selectedCount;
  }

  // ========== 其他品牌：使用原有颜色策略 ==========
  ctx.logger.info(`  规则: 固定5次点击，根据颜色数智能选择索引\n`);

  // 🔧 修复：提前缓存所有图片元素，避免 DOM 重排导致索引偏移
  ctx.logger.info('  📦 缓存图片列表（避免DOM重排影响）...');
  const cardLocator = uploadFrame.locator(imageCardSelector || '.PicList_pic_background__pGTdV');
  ctx.logger.info(`  📦 使用选择器 "${imageCardSelector || '.PicList_pic_background__pGTdV'}" 缓存图片列表...`);
  const cardHandles = await cardLocator.elementHandles();
  ctx.logger.info(`  ✅ 已缓存 ${cardHandles.length} 个图片元素\n`);

  // 🔧 封装获取卡片的辅助函数（带边界保护）
  const getCardByIndex = (targetIndex) => {
    // 边界保护：确保索引在有效范围内
    const actualIndex = Math.min(Math.max(targetIndex, 0), cardHandles.length - 1);
    return { handle: cardHandles[actualIndex], actualIndex };
  };

  // 定义5次点击的索引选择规则
  const clickRules = [
    // 第1张：始终 last(1)
    {
      name: '第1张',
      getIndex: () => pickIndexLast(1, imageCount),
      getRuleName: () => 'last(1)'
    },

    // 第2张：colorCount >= 2 用 first(6)，否则 last(2)
    {
      name: '第2张',
      getIndex: () => {
        if (colorCount >= 2) return pickIndexFirst(6, imageCount);
        else return pickIndexLast(2, imageCount);
      },
      getRuleName: () => colorCount >= 2 ? 'first(6)' : 'last(2)'
    },

    // 第3张：根据颜色数选择
    {
      name: '第3张',
      getIndex: () => {
        if (colorCount === 2) return pickIndexLast(2, imageCount);
        else if (colorCount >= 3) return pickIndexFirst(12, imageCount);
        else return pickIndexLast(3, imageCount);  // colorCount === 1
      },
      getRuleName: () => {
        if (colorCount === 2) return 'last(2)';
        else if (colorCount >= 3) return 'first(12)';
        else return 'last(3)';
      }
    },

    // 第4张：根据颜色数选择
    {
      name: '第4张',
      getIndex: () => {
        if (colorCount === 2) return pickIndexFirst(5, imageCount);
        else if (colorCount === 3) return pickIndexLast(2, imageCount);
        else if (colorCount >= 4) return pickIndexFirst(18, imageCount);
        else return pickIndexLast(4, imageCount);  // colorCount === 1
      },
      getRuleName: () => {
        if (colorCount === 2) return 'first(5)';
        else if (colorCount === 3) return 'last(2)';
        else if (colorCount >= 4) return 'first(18)';
        else return 'last(4)';
      }
    },

    // 第5张：根据颜色数选择（复杂规则）
    {
      name: '第5张',
      getIndex: () => {
        if (colorCount === 1) return pickIndexLast(5, imageCount);
        else if (colorCount === 2) return pickIndexLast(3, imageCount);
        else if (colorCount === 3) return pickIndexFirst(5, imageCount);
        else if (colorCount === 4) return pickIndexFirst(24, imageCount);
        else if (colorCount === 5) return pickIndexFirst(30, imageCount);
        else return pickIndexFirst(30, imageCount);  // colorCount >= 6
      },
      getRuleName: () => {
        if (colorCount === 1) return 'last(5)';
        else if (colorCount === 2) return 'last(3)';
        else if (colorCount === 3) return 'first(5)';
        else if (colorCount === 4) return 'first(24)';
        else if (colorCount === 5) return 'first(30)';
        else return 'first(30)';  // colorCount >= 6
      }
    }
  ];

  // 执行5次点击
  for (let i = 0; i < clickRules.length; i++) {
    const rule = clickRules[i];
    const targetIndex = rule.getIndex();
    const ruleName = rule.getRuleName();

    ctx.logger.info(`${rule.name} → 目标索引${targetIndex} (${ruleName})`);

    try {
      // 从缓存的 cardHandles 中获取元素（避免 DOM 重排影响）
      const { handle: cardHandle, actualIndex } = getCardByIndex(targetIndex);

      if (!cardHandle) {
        ctx.logger.warn(`  ⚠️  索引${actualIndex}没有元素，跳过`);
        continue;
      }

      ctx.logger.info(`  → 实际索引${actualIndex}`);

      // 滚动到视图中
      await cardHandle.scrollIntoViewIfNeeded({ timeout: 3000 });

      // 等待动画稳定
      await new Promise(resolve => setTimeout(resolve, 300));

      // 直接点击图片卡片（elementHandle 可以直接调用 click）
      await cardHandle.click({ timeout: 3000 });

      selectedCount++;
      ctx.logger.info(`  ✅ ${rule.name} → 索引${actualIndex} → 成功`);

    } catch (error) {
      ctx.logger.warn(`  ❌ ${rule.name} → 失败: ${error.message}`);
      // 继续尝试剩余索引
    }

    // 点击间隔，避免操作过快
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  ctx.logger.info(`\n✅ 图片选择完成：成功 ${selectedCount}/5 张\n`);
  return selectedCount;
}

/**
 * 应用降级策略
 */
async function applyFallbackStrategy(page, productId, ctx) {
  ctx.logger.info('应用降级策略：选择所有可见图片');

  try {
    // 重新打开上传对话框（优化：2秒降到500ms）
    await page.click('.next-tabs-tab:has-text("素材库")');
    await page.waitForTimeout(500);

    // 处理素材库页面的广告弹窗
    await closeMaterialCenterPopups(page);

    await page.click('.next-tabs-tab:has-text("图片")');
    await page.click('text=上传图片');
    await page.waitForTimeout(500);

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
