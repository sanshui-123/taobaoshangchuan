const path = require('path');
const fs = require('fs');

// 搜索输入框的候选选择器
const SEARCH_INPUT_SELECTORS = [
  'input[placeholder="请输入文件夹名称"]',
  'input[placeholder*="文件夹"]',
  'input[type="text"][class*="search"]',
  '.next-input input[type="text"]',
  'input.next-input'
];

// 图片卡片的候选选择器
const IMAGE_CARD_SELECTORS = [
  '.PicList_pic_background__pGTdV',
  '[class*="pic_background"]',
  '.image-card',
  '.pic-item',
  '[class*="image-item"]'
];

/**
 * 智能查找文件夹搜索输入框
 * @param {Object} context - page 或 frameLocator
 * @returns {Object} { locator, selector } 或 null
 */
async function findFolderSearchInput(context) {
  for (const selector of SEARCH_INPUT_SELECTORS) {
    try {
      const element = context.locator(selector);
      const count = await element.count();
      if (count > 0) {
        const isVisible = await element.first().isVisible();
        if (isVisible) {
          return { locator: element.first(), selector };
        }
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

/**
 * 智能选择图片（优化版）
 * @param {Object} locator - 工作定位器（page或iframe）
 * @param {number} colorCount - 颜色数量
 * @param {Object} ctx - 上下文
 * @param {Object} page - 页面对象
 * @returns {number} 成功选择的图片数量
 */
async function selectImagesOptimized(locator, colorCount, ctx, page) {
  ctx.logger.info('\n[步骤6] 选择图片');

  // 查找图片卡片
  let imageCards = null;
  let selector = null;

  for (const sel of IMAGE_CARD_SELECTORS) {
    try {
      const count = await locator.locator(sel).count();
      if (count > 0) {
        imageCards = locator.locator(sel);
        selector = sel;
        ctx.logger.info(`  ✅ 使用选择器 "${sel}" 找到 ${count} 个图片卡片`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!imageCards) {
    throw new Error('未找到图片卡片');
  }

  const totalImages = await imageCards.count();

  // 智能选择策略
  const selections = getSmartSelectionIndices(totalImages, colorCount);

  ctx.logger.info(`\n📋 开始智能选择图片`);
  ctx.logger.info(`  颜色数: ${colorCount}`);
  ctx.logger.info(`  总图片数: ${totalImages}`);

  // 缓存所有图片元素（优化：减少重复查询）
  ctx.logger.info(`  📦 缓存图片列表...`);
  const allCards = [];
  for (let i = 0; i < totalImages; i++) {
    allCards.push(imageCards.nth(i));
  }
  ctx.logger.info(`  ✅ 已缓存 ${allCards.length} 个图片元素\n`);

  let selectedCount = 0;
  for (let i = 0; i < selections.length; i++) {
    const targetIndex = selections[i];
    const actualIndex = Math.min(targetIndex, totalImages - 1);

    try {
      const card = allCards[actualIndex];
      await card.click();

      // 优化：减少等待时间到100ms
      await page.waitForTimeout(100);

      selectedCount++;
      ctx.logger.info(`  ✅ 第${i + 1}张 → 索引${actualIndex} → 成功`);
    } catch (e) {
      ctx.logger.warn(`  ❌ 第${i + 1}张选择失败: ${e.message}`);
    }
  }

  ctx.logger.info(`\n✅ 图片选择完成：成功 ${selectedCount}/5 张\n`);
  return selectedCount;
}

/**
 * 获取智能选择索引
 */
function getSmartSelectionIndices(totalImages, colorCount) {
  const indices = [];

  if (totalImages <= 5) {
    for (let i = 0; i < totalImages; i++) {
      indices.push(i);
    }
  } else if (colorCount === 1) {
    indices.push(totalImages - 1, 0, Math.floor(totalImages / 2), 1, totalImages - 2);
  } else if (colorCount === 2) {
    indices.push(totalImages - 1, Math.floor(totalImages * 0.3), Math.floor(totalImages * 0.6), totalImages - 2, Math.floor(totalImages * 0.2));
  } else {
    indices.push(totalImages - 1, Math.floor(totalImages * 0.25), Math.floor(totalImages * 0.5), totalImages - 2, Math.floor(totalImages * 0.2));
  }

  return indices.slice(0, 5);
}

/**
 * 步骤5：上传1:1主图（优化版）
 */
async function step5(ctx) {
  ctx.logger.info('开始上传1:1主图');

  const { page1: page, productId } = ctx;

  if (!page) {
    throw new Error('页面未初始化');
  }

  // 从缓存获取颜色信息
  const cacheFile = path.join(__dirname, '..', 'cache', `${productId}.json`);
  let colorCount = 1;

  try {
    if (fs.existsSync(cacheFile)) {
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cache.colors && Array.isArray(cache.colors)) {
        colorCount = cache.colors.length;
      }
    }
  } catch (e) {
    ctx.logger.warn(`读取缓存失败: ${e.message}`);
  }

  ctx.logger.info(`商品颜色数量: ${colorCount}`);

  // 步骤0：定位到1:1主图区域
  ctx.logger.info('\n[步骤0] 定位到1:1主图区域');

  // 步骤1：滚动到页面顶部
  ctx.logger.info('\n[步骤1] 滚动到页面顶部');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press('Home');
  ctx.logger.info('✅ 已滚动到顶部');

  // 步骤2：禁用其他上传位
  ctx.logger.info('\n[步骤2] 禁用其他上传位');
  await page.evaluate(() => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"].next-checkbox-input');
    checkboxes.forEach((cb, index) => {
      if (index > 0) cb.checked = false;
    });
  });
  ctx.logger.info('✅ 已禁用其他上传位');

  // 优化：减少等待到200ms
  await page.waitForTimeout(200);

  // 步骤3：点击第一个白底图上传位
  ctx.logger.info('\n[步骤3] 点击第一个白底图上传位');

  // ✅ 千牛新版本：模板可能自带主图，导致找不到“上传图片”位并误点视频上传位
  // 处理策略：只在 1:1 主图区域内操作；如果首位有图，先 hover 打开菜单并删除，再点击空位打开素材库
  const mainRootSelectors = [
    '#struct-mainImagesGroup',
    '#mainImagesGroup',
    '[id*="mainImagesGroup"]',
    '.sell-field-mainImagesGroup',
    '[class*="mainImagesGroup"]'
  ];

  const findRoot = async () => {
    for (const sel of mainRootSelectors) {
      const root = page.locator(sel).first();
      if (await root.isVisible().catch(() => false)) return { root, sel };
    }
    return null;
  };

  const getVisibleMenu = async () => {
    const menus = page.locator('ul.sell-component-material-item-media-operator, ul.next-menu.sell-component-material-item-media-operator');
    const c = await menus.count().catch(() => 0);
    for (let i = 0; i < c; i++) {
      const m = menus.nth(i);
      if (await m.isVisible().catch(() => false)) return m;
    }
    return null;
  };

  const rootRes = await findRoot();
  if (!rootRes) throw new Error('未找到1:1主图区域，无法定位上传位');

  const { root, sel } = rootRes;
  await root.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(200);

  const firstTile = root.locator('.drag-item').first();
  const hasImg = await firstTile.locator('img').count().then(n => n > 0).catch(() => false);
  if (hasImg) {
    ctx.logger.warn('  ⚠️ 检测到模板预置主图，先删除再上传');
    await firstTile.scrollIntoViewIfNeeded().catch(() => {});
    await firstTile.hover().catch(() => {});
    await page.waitForTimeout(200);

    let menu = await getVisibleMenu();
    if (!menu) {
      const trigger = firstTile.locator('.trigger-item').first();
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click({ force: true }).catch(() => {});
      } else {
        await firstTile.click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(200);
      menu = await getVisibleMenu();
    }

    if (menu) {
      await menu.getByText('删除', { exact: true }).first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(600);
    }
  }

  const empty = firstTile.locator('div.image-empty').first();
  if (await empty.isVisible().catch(() => false)) {
    await empty.click({ force: true });
    ctx.logger.info(`✅ 已点击1:1主图上传位（${sel} -> .drag-item -> div.image-empty）`);
  } else {
    // 旧 UI fallback：限定在 root 内找 placeholder，避免命中视频上传位
    const fallback = root.locator('div.image-empty, div.placeholder, .upload-pic-box.placeholder, [class*="upload-trigger"]').first();
    if (await fallback.isVisible().catch(() => false)) {
      await fallback.click({ force: true });
      ctx.logger.info(`✅ 已点击1:1主图上传位（${sel} -> fallback）`);
    } else {
      throw new Error('无法在1:1主图区域内找到上传位');
    }
  }

  ctx.logger.info('等待弹窗开始出现...');

  // 优化：使用条件等待代替硬等待
  try {
    await page.waitForSelector('iframe, .next-dialog, [class*="material"], [class*="upload"]', {
      timeout: 5000,
      state: 'visible'
    });
    ctx.logger.info('✅ 检测到弹窗元素');
  } catch (e) {
    ctx.logger.warn('弹窗检测超时，继续执行');
  }

  // 优化：只等待200ms确保弹窗稳定
  await page.waitForTimeout(200);

  // 步骤4：在弹窗中搜索文件夹
  ctx.logger.info('\n[步骤4] 在弹窗中搜索文件夹');

  let workingLocator;
  let searchInput;

  // 查找搜索框
  const iframeCount = await page.locator('iframe').count();
  if (iframeCount > 0) {
    ctx.logger.info(`  检测到 ${iframeCount} 个 iframe`);

    for (let i = 0; i < iframeCount; i++) {
      const frameLocator = page.frameLocator('iframe').nth(i);
      const result = await findFolderSearchInput(frameLocator);
      if (result) {
        searchInput = result.locator;
        workingLocator = frameLocator;
        ctx.logger.info(`  ✅ 在第 ${i + 1} 个 iframe 中找到搜索框`);
        break;
      }
    }
  }

  if (!searchInput) {
    const result = await findFolderSearchInput(page);
    if (result) {
      searchInput = result.locator;
      workingLocator = page;
      ctx.logger.info('  ✅ 在主页面中找到搜索框');
    }
  }

  if (!searchInput) {
    throw new Error('未找到搜索框');
  }

  // 输入商品ID
  ctx.logger.info(`  ⌨️ 输入商品ID: ${productId}`);
  await searchInput.clear();
  await searchInput.fill(productId);
  ctx.logger.info(`  ✅ 已输入商品ID: ${productId}`);

  // 优化：使用条件等待下拉建议
  ctx.logger.info('  ⏳ 等待下拉建议出现...');
  try {
    await workingLocator.locator(`.next-menu-item:has-text("${productId}")`).waitFor({
      state: 'visible',
      timeout: 3000
    });
    ctx.logger.info('  ✅ 下拉建议已出现');
  } catch (e) {
    ctx.logger.warn('  下拉建议未出现，尝试直接回车');
    await searchInput.press('Enter');
  }

  // 点击下拉建议或回车
  try {
    const suggestion = workingLocator.locator(`.next-menu-item:has-text("${productId}")`).first();
    await suggestion.click();
    ctx.logger.info('  ✅ 成功点击下拉建议');
  } catch (e) {
    await searchInput.press('Enter');
    ctx.logger.info('  ✅ 使用回车键确认');
  }

  ctx.logger.info(`✅ 已选择文件夹: ${productId}`);

  // 优化：使用条件等待文件夹内容加载
  ctx.logger.info('  ⏳ 等待文件夹内容加载...');
  try {
    // 等待至少一个图片卡片出现
    for (const sel of IMAGE_CARD_SELECTORS) {
      try {
        await workingLocator.locator(sel).first().waitFor({
          state: 'visible',
          timeout: 3000
        });
        const count = await workingLocator.locator(sel).count();
        ctx.logger.info(`  ✅ 文件夹内容已加载（${count}个图片）`);
        break;
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    ctx.logger.warn('  文件夹内容加载超时，继续执行');
  }

  // 优化：只等待100ms稳定
  await page.waitForTimeout(100);

  // 步骤5：选择图片
  const selectedCount = await selectImagesOptimized(workingLocator, colorCount, ctx, page);

  if (selectedCount === 0) {
    throw new Error('未能选择任何图片');
  }

  ctx.logger.info(`✅ 已选择 ${selectedCount} 张图片`);

  // 确认选择（如果有确定按钮）
  try {
    const confirmButton = workingLocator.locator('button:has-text("确定"), button:has-text("确认")').first();
    await confirmButton.click();
    ctx.logger.info('✅ 已点击确定按钮');

    // 优化：等待弹窗关闭
    await page.waitForTimeout(300);
  } catch (e) {
    ctx.logger.info('未找到确定按钮，可能自动应用');
  }

  ctx.logger.success(`\n=== 主图选择完成 ===`);
  ctx.logger.info(`总图片数: ${selectedCount}`);
  ctx.logger.info(`已选择: ${selectedCount} 张`);
}

module.exports = { step5 };
