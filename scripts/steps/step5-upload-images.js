const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
const { closeAllPopups } = require('../utils/advert-handler');

/**
 * 如果出现裁剪弹窗，点击"确定"继续
 * @returns {boolean} 是否检测到并处理了裁剪弹窗
 */
async function handleCropConfirm(page, ctx) {
  try {
    // 裁剪弹窗的确定按钮选择器（必须有确定按钮才是裁剪弹窗）
    const okSelectors = [
      // 优先级1: 基于截图的精确匹配（button.next-btn.next-medium.next-btn-primary.Footer_editOk__PNagk）
      'button.next-btn.next-medium.next-btn-primary[class*="Footer_editOk"]:has-text("确定")',
      'button.next-btn-primary.next-medium[class*="Footer_editOk"]:has-text("确定")',
      'button.next-btn.next-medium[class*="editOk"]:has-text("确定")',
      // 优先级2: 裁剪相关的确定按钮
      'button.next-btn-primary[class*="Footer_editOk"]:has-text("确定")',
      'button[class*="Footer_editOk"].next-btn-primary:has-text("确定")',
      'button[class*="editOk"]:has-text("确定")',
      '.Footer_editOk__ button:has-text("确定")',
      '.edit-ok button:has-text("确定")'
    ];

    for (let attempt = 0; attempt < 3; attempt++) {
      // 先检测确定按钮是否存在（避免误判素材库弹窗为裁剪弹窗）
      let okBtn = null;
      let matchedSelector = null;
      for (const sel of okSelectors) {
        const btn = page.locator(sel).first();
        if (btn && await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
          okBtn = btn;
          matchedSelector = sel;
          break;
        }
      }

      // 只有找到裁剪弹窗的确定按钮，才认为是裁剪弹窗
      if (!okBtn) {
        return false; // 没有裁剪弹窗的确定按钮，说明不是裁剪弹窗
      }

      if (matchedSelector) {
        ctx.logger.info(`  🎯 匹配到裁剪弹窗确定按钮: ${matchedSelector}`);
      }

      ctx.logger.info(`  检测到裁剪弹窗，尝试点击"确定"（第${attempt + 1}次）`);

      // 先关闭任何可能遮挡的警告弹窗（如"流量限制"）
      try {
        const warningCloseSelectors = [
          'button[aria-label="Close"]',
          '.next-message-close',
          '.next-dialog-close',
          'button:has-text("×")',
          '[class*="close"]:has-text("×")'
        ];
        for (const sel of warningCloseSelectors) {
          const closeBtn = page.locator(sel).first();
          if (await closeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
            await closeBtn.click({ force: true }).catch(() => {});
            ctx.logger.info('  ✅ 已关闭警告遮挡层');
            await page.waitForTimeout(300);
            break;
          }
        }
      } catch (e) {
        // 忽略
      }

      let clicked = false;
      try {
        await okBtn.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
        await okBtn.click({ force: true, timeout: 3000 });
        clicked = true;
      } catch (e) {
        // 继续用 JS 兜底
      }

      if (!clicked) {
        try {
          const success = await page.evaluate((selectors) => {
            for (const sel of selectors) {
              const btn = document.querySelector(sel);
              if (btn && !btn.disabled) {
                btn.click();
                return true;
              }
            }
            return false;
          }, okSelectors);
          if (success) clicked = true;
        } catch (e) {
          // ignore
        }
      }

      if (!clicked) {
        await page.keyboard.press('Enter').catch(() => {});
      }
      await page.waitForTimeout(800);

      // 检查按钮是否消失（说明弹窗已关闭）
      const stillVisible = await okBtn.isVisible().catch(() => false);
      if (!stillVisible) {
        ctx.logger.info('  ✅ 裁剪弹窗已关闭');
        return true; // 检测到并成功处理了裁剪弹窗
      }
    }
    ctx.logger.warn('  ⚠️ 多次尝试后裁剪弹窗可能仍存在，请留意后续步骤');
    return true; // 检测到裁剪弹窗，但可能未成功关闭
  } catch (e) {
    ctx.logger.warn(`  ⚠️ 处理裁剪弹窗时出错（忽略继续）: ${e.message}`);
    return false;
  }
}

/**
 * 素材库选图后的“确定”按钮点击（带兜底）
 */
async function confirmImageSelection(page, frameLocator, ctx) {
  const candidates = [
    // 优先：弹窗footer里的主按钮（有些版本按钮文案不是“确定”）
    frameLocator.locator('.next-dialog-footer button.next-btn-primary, .next-dialog-footer button[class*="primary"]').first(),
    frameLocator.locator('button:has(.next-btn-count):has-text("确定")').first(),
    frameLocator.locator('button:has-text("确定")').first(),
    frameLocator.locator('button:has-text("完成"), button:has-text("确认"), button:has-text("使用"), button:has-text("应用"), button:has-text("插入"), button:has-text("选好了")').first(),
    page.locator('div.next-dialog-footer button:has-text("确定")').first(),
    page.locator('.next-dialog, [role="dialog"]').locator('button:has-text("确定")').first(),
    page.locator('button.next-btn-primary:has-text("确定")').first()
  ];

  for (const btn of candidates) {
    try {
      const count = await btn.count().catch(() => 0);
      if (count > 0) {
        // 先滚动，避免按钮在弹窗内部不可见
        await btn.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      }

      if (btn && await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        const enabled = await btn.isEnabled().catch(() => false);
        if (!enabled) continue;
        await btn.click({ force: true, timeout: 3000 });
        await page.waitForTimeout(400);
        const disappeared = await btn.waitFor({ state: 'detached', timeout: 2000 }).then(() => true).catch(() => false);
        ctx.logger.info(`  ✅ 素材库确定按钮已点击${disappeared ? '并消失' : ''}`);
        return true;
      }
    } catch (e) {
      // 尝试下一个候选
    }
  }
  ctx.logger.warn('  ⚠️ 未找到可点击的素材库“确定”按钮，继续后续流程');
  return false;
}

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
 * 等待素材库弹窗就绪：通过“文件夹搜索框”判定（带重试）
 * 用于替代 page.waitForSelector 以避免在某些状态下卡死
 * @returns {Promise<{searchInput: any, workingLocator: any, selector: string, location: string} | null>}
 */
async function waitForFolderSearchInput(page, ctx, timeoutMs) {
  const start = Date.now();
  let lastLogAt = 0;

  while (Date.now() - start < timeoutMs) {
    const elapsed = Date.now() - start;
    if (elapsed - lastLogAt >= 2000) {
      ctx.logger.info(`  ⏳ 等待素材库弹窗就绪... (${Math.ceil(elapsed / 1000)}s)`);
      lastLogAt = elapsed;
    }

    try {
      const iframeCount = await page.locator('iframe').count().catch(() => 0);
      if (iframeCount > 0) {
        for (let i = 0; i < iframeCount; i++) {
          const frameLocator = page.frameLocator('iframe').nth(i);
          const result = await findFolderSearchInput(frameLocator);
          if (result) {
            const visible = await result.locator.isVisible().catch(() => false);
            if (visible) {
              return {
                searchInput: result.locator,
                workingLocator: frameLocator,
                selector: result.selector,
                location: `iframe#${i + 1}`
              };
            }
            // 可能存在但尚未渲染完成，短等待一次
            const becameVisible = await result.locator.waitFor({ state: 'visible', timeout: 300 }).then(() => true).catch(() => false);
            if (becameVisible) {
              return {
                searchInput: result.locator,
                workingLocator: frameLocator,
                selector: result.selector,
                location: `iframe#${i + 1}`
              };
            }
          }
        }
      }

      const resultInPage = await findFolderSearchInput(page);
      if (resultInPage) {
        const visible = await resultInPage.locator.isVisible().catch(() => false);
        if (visible) {
          return {
            searchInput: resultInPage.locator,
            workingLocator: page,
            selector: resultInPage.selector,
            location: 'page'
          };
        }
        const becameVisible = await resultInPage.locator.waitFor({ state: 'visible', timeout: 300 }).then(() => true).catch(() => false);
        if (becameVisible) {
          return {
            searchInput: resultInPage.locator,
            workingLocator: page,
            selector: resultInPage.selector,
            location: 'page'
          };
        }
      }
    } catch (e) {
      // 忽略单次检测错误，继续重试
    }

    await page.waitForTimeout(500);
  }

  return null;
}

/**
 * 等待发布页主图区域出现缩略图（用于判定“确定”后是否真正落地）
 * @returns {Promise<{selector: string, count: number} | null>}
 */
async function waitForMainImagesFilled(page, ctx, timeoutMs) {
  const start = Date.now();
  const selectors = [
    // ====== 优先：限定在主图区域内，匹配 alicdn 缩略图 ======
    '#struct-mainImagesGroup img[src*="alicdn"]',
    '#mainImagesGroup img[src*="alicdn"]',
    '[id*="mainImagesGroup"] img[src*="alicdn"]',
    '.sell-field-mainImagesGroup img[src*="alicdn"]',
    '[class*="mainImagesGroup"] img[src*="alicdn"]',

    // ====== 兼容：主图区域内任意 img（部分版本不含 alicdn 字样） ======
    '#struct-mainImagesGroup img',
    '#mainImagesGroup img',
    '[id*="mainImagesGroup"] img',
    '.sell-field-mainImagesGroup img',
    '[class*="mainImagesGroup"] img',

    // ====== 兼容：缩略图用背景图渲染 ======
    '#struct-mainImagesGroup [style*="background-image"][style*="alicdn"]',
    '#mainImagesGroup [style*="background-image"][style*="alicdn"]',
    '[id*="mainImagesGroup"] [style*="background-image"][style*="alicdn"]',
    '.sell-field-mainImagesGroup [style*="background-image"][style*="alicdn"]',

    // ====== 旧结构兜底（保留） ======
    '#struct-mainImagesGroup .upload-pic-box:not(.placeholder) img',
    '.sell-field-mainImagesGroup .upload-pic-box:not(.placeholder) img',
    '#struct-mainImagesGroup .upload-pic-box[style*="background-image"]',
    '.sell-field-mainImagesGroup .upload-pic-box[style*="background-image"]'
  ];

  while (Date.now() - start < timeoutMs) {
    for (const selector of selectors) {
      const count = await page.locator(selector).count().catch(() => 0);
      if (count > 0) {
        ctx.logger.info(`  ✅ 主图缩略图已出现（${count}个，${selector}）`);
        return { selector, count };
      }
    }
    await page.waitForTimeout(1000);
  }

  return null;
}

/**
 * 获取 1:1 主图区域根节点（避免误点到视频上传位）
 * @returns {Promise<{root: import('playwright').Locator, selector: string} | null>}
 */
async function getMainImagesRoot(page) {
  const selectors = [
    '#struct-mainImagesGroup',
    '#mainImagesGroup',
    '[id*="mainImagesGroup"]',
    '.sell-field-mainImagesGroup',
    '[class*="mainImagesGroup"]'
  ];

  for (const selector of selectors) {
    const root = page.locator(selector).first();
    const visible = await root.isVisible().catch(() => false);
    if (visible) return { root, selector };
  }

  // 最后兜底：用“1:1主图”标题定位邻近容器
  try {
    const label = page.getByText('1:1主图', { exact: false }).first();
    if (await label.isVisible().catch(() => false)) {
      const fallback = label.locator('xpath=following::*[contains(@id,"mainImagesGroup")][1]').first();
      if (await fallback.isVisible().catch(() => false)) {
        return { root: fallback, selector: 'label->following mainImagesGroup' };
      }
    }
  } catch (e) {
    // ignore
  }

  return null;
}

/**
 * 获取“图片操作”菜单（裁剪/替换/删除），并返回可见的那个
 */
async function getVisibleImageOperatorMenu(page) {
  const menus = page.locator('ul.sell-component-material-item-media-operator, ul.next-menu.sell-component-material-item-media-operator');
  const count = await menus.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const menu = menus.nth(i);
    if (await menu.isVisible().catch(() => false)) return menu;
  }
  return null;
}

/**
 * 删除一个主图位中的已有图片（适配千牛新 UI：hover 后出现“裁剪/替换/删除”菜单）
 * @returns {Promise<boolean>}
 */
async function deleteExistingImageInTile(tile, page, ctx, index) {
  try {
    await tile.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(150);

    // 先 hover 触发菜单出现（新 UI）
    await tile.hover({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(150);

    let menu = await getVisibleImageOperatorMenu(page);
    if (!menu) {
      // 部分版本需要点一下触发器
      const trigger = tile.locator('.trigger-item').first();
      if (await trigger.isVisible({ timeout: 300 }).catch(() => false)) {
        await trigger.click({ force: true, timeout: 1500 }).catch(() => {});
      } else {
        await tile.click({ force: true, timeout: 1500 }).catch(() => {});
      }
      await page.waitForTimeout(200);
      menu = await getVisibleImageOperatorMenu(page);
    }

    if (!menu) {
      ctx.logger.warn(`  ⚠️ 未找到图片操作菜单，跳过删除（主图位${index + 1}）`);
      return false;
    }

    const deleteItem = menu.getByText('删除', { exact: true }).first();
    if (!await deleteItem.isVisible({ timeout: 800 }).catch(() => false)) {
      ctx.logger.warn(`  ⚠️ 未找到“删除”菜单项，跳过删除（主图位${index + 1}）`);
      return false;
    }

    await deleteItem.click({ force: true, timeout: 2000 });
    await page.waitForTimeout(600);

    // 极少数情况下会弹确认框
    const confirmBtn = page.locator('.next-dialog-footer button.next-btn-primary:has-text("确定"), .next-dialog-footer button.next-btn-primary:has-text("确认")').first();
    if (await confirmBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await confirmBtn.click({ force: true, timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(600);
    }

    // 等待该 tile 变成空态
    const emptyVisible = await tile.locator('div.image-empty, .main-content.dashed').first()
      .isVisible()
      .catch(() => false);
    if (emptyVisible) return true;

    const imgCount = await tile.locator('img').count().catch(() => 0);
    return imgCount === 0;
  } catch (e) {
    ctx.logger.warn(`  ⚠️ 删除主图位${index + 1}失败: ${e.message}`);
    return false;
  }
}

/**
 * 千牛新版本：模板可能自带主图，需先清理，否则会导致 Step5 找不到“上传图片”位并误点视频上传
 */
async function clearMainImagesIfNeeded(page, ctx) {
  const rootRes = await getMainImagesRoot(page);
  if (!rootRes) return { cleared: 0, root: null };

  const { root, selector } = rootRes;
  await root.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(200);

  // 新 UI：主图位为 .drag-item
  const dragTiles = root.locator('.drag-item');
  const dragCount = await dragTiles.count().catch(() => 0);

  let cleared = 0;

  if (dragCount > 0) {
    // 先扫描有图的 tile 并逐个删除（最多 5 张）
    for (let i = 0; i < Math.min(dragCount, 6); i++) {
      const tile = dragTiles.nth(i);
      const imgCount = await tile.locator('img').count().catch(() => 0);
      if (imgCount > 0) {
        ctx.logger.warn(`  ⚠️ 检测到主图位${i + 1}已存在模板图片，先删除再上传`);
        const ok = await deleteExistingImageInTile(tile, page, ctx, i);
        if (ok) cleared++;
      }
    }

    if (cleared > 0) {
      ctx.logger.info(`  ✅ 已清理模板预置主图: ${cleared} 张（${selector}）`);
    }

    return { cleared, root };
  }

  // 旧 UI：不做强删，仅返回 root 供后续点击使用（避免误点视频）
  return { cleared: 0, root };
}

/**
 * 只在 1:1 主图区域内点击“上传图片”（优先新 UI：#struct-mainImagesGroup .drag-item）
 */
async function clickMainImageUploadSlot(page, ctx) {
  const rootRes = await getMainImagesRoot(page);
  if (!rootRes) return false;

  const { root, selector } = rootRes;
  await root.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(200);

  // 新 UI：使用第一个 drag-item（已确保清理后为空）
  const tiles = root.locator('.drag-item');
  const tileCount = await tiles.count().catch(() => 0);
  if (tileCount > 0) {
    const firstTile = tiles.first();
    await firstTile.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(120);

    const empty = firstTile.locator('div.image-empty').first();
    if (await empty.isVisible({ timeout: 300 }).catch(() => false)) {
      await empty.click({ force: true, timeout: 5000 }).catch(async (e) => {
        ctx.logger.warn(`常规点击主图空位失败，尝试强制点击: ${e.message}`);
        await empty.click({ force: true, timeout: 5000 });
      });
      ctx.logger.success(`✅ 已点击1:1主图上传位（${selector} -> .drag-item -> div.image-empty）`);
      return true;
    }

    // 没有 image-empty（极端情况），点击 tile 本身
    await firstTile.click({ force: true, timeout: 5000 }).catch(async (e) => {
      ctx.logger.warn(`常规点击主图位失败，尝试强制点击: ${e.message}`);
      await firstTile.click({ force: true, timeout: 5000 });
    });
    ctx.logger.success(`✅ 已点击1:1主图上传位（${selector} -> .drag-item）`);
    return true;
  }

  // 旧 UI fallback：只在 root 内找 placeholder，避免匹配到视频上传
  const fallbackSelectors = [
    'div.image-empty',
    '.upload-pic-box.placeholder',
    '.sell-component-info-wrapper-component-child div.placeholder',
    'div.placeholder',
    '[data-testid="upload-placeholder"]',
    '[class*="upload-trigger"]'
  ];

  for (const sel of fallbackSelectors) {
    const candidate = root.locator(sel).first();
    if (await candidate.isVisible({ timeout: 200 }).catch(() => false)) {
      await candidate.click({ timeout: 5000 }).catch(async (e) => {
        ctx.logger.warn(`常规点击失败，尝试强制点击: ${e.message}`);
        await candidate.click({ force: true, timeout: 5000 });
      });
      ctx.logger.success(`✅ 已点击1:1主图上传位（${selector} -> ${sel}）`);
      return true;
    }
  }

  return false;
}

/**
 * 探测素材库弹窗里是否存在“确定/完成/使用”等确认按钮（快速判定，避免无确认按钮时长时间空转）
 * @returns {Promise<boolean>}
 */
async function hasAnyConfirmButton(page, workingLocator) {
  const buttonSelectors = [
    '.next-dialog-footer button.next-btn-primary',
    '.next-dialog-footer button[class*="primary"]',
    'button.next-btn-primary:has-text("确定")',
    'button:has(.next-btn-count)',
    'button:has-text("确定")',
    'button:has-text("完成")',
    'button:has-text("确认")',
    'button:has-text("使用")',
    'button:has-text("应用")',
    'button:has-text("插入")',
    'button:has-text("选好了")'
  ];

  const checkInRoot = async (root) => {
    for (const sel of buttonSelectors) {
      const btn = root.locator(sel).first();
      if (await btn.isVisible({ timeout: 150 }).catch(() => false)) {
        const enabled = await btn.isEnabled().catch(() => false);
        if (enabled) return true;
      }
    }
    return false;
  };

  if (workingLocator && await checkInRoot(workingLocator)) return true;
  if (await checkInRoot(page)) return true;

  const iframeCount = await page.locator('iframe').count().catch(() => 0);
  for (let i = 0; i < iframeCount; i++) {
    const root = page.frameLocator('iframe').nth(i);
    if (await checkInRoot(root)) return true;
  }

  return false;
}

/**
 * 判断素材库选图弹窗是否仍打开（轻量检测）
 */
async function isMaterialPickerOpen(page, ctx) {
  const searchVisible = await waitForFolderSearchInput(page, ctx, 800).then(r => !!r).catch(() => false);
  if (searchVisible) return true;

  const localUploadVisible = await page.locator('button:has-text("本地上传")').first().isVisible({ timeout: 200 }).catch(() => false);
  if (localUploadVisible) return true;

  const titleVisible = await page.locator('text=选择图片').first().isVisible({ timeout: 200 }).catch(() => false);
  return titleVisible;
}

/**
 * 使用 JS 在当前文档内兜底点击“确定”（优先在最上层 dialog 内查找）
 */
async function forceClickConfirmByJS(page, ctx) {
  const clickedText = await page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (Number(style.opacity || '1') === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const zIndexOf = (el) => {
      const z = parseInt(window.getComputedStyle(el).zIndex || '0', 10);
      return Number.isFinite(z) ? z : 0;
    };

    const dialogs = Array.from(document.querySelectorAll('.next-dialog, [role="dialog"]')).filter(isVisible);
    const root = dialogs.sort((a, b) => zIndexOf(b) - zIndexOf(a))[0] || document;

    const buttons = Array.from(root.querySelectorAll('button')).filter(isVisible).filter(b => !b.disabled);
    const candidates = buttons.filter((btn) => {
      const text = (btn.innerText || btn.textContent || '').trim();
      return (
        text.includes('确定') || text.includes('確定') ||
        text.includes('完成') || text.includes('确认') || text.includes('使用') ||
        text.includes('应用') || text.includes('插入') || text.includes('选好了')
      );
    });

    const score = (btn) => {
      let s = 0;
      const text = (btn.innerText || btn.textContent || '').trim();
      if (text === '确定' || text === '確定') s += 10;
      if (text.includes('确定') || text.includes('確定')) s += 6;
      const className = String(btn.className || '');
      if (className.includes('primary') || className.includes('next-btn-primary')) s += 6;
      if (btn.closest('.next-dialog-footer') || btn.closest('[class*="footer"]') || btn.closest('[class*="Footer"]')) s += 6;
      return s;
    };

    candidates.sort((a, b) => score(b) - score(a));
    let target = candidates[0] || null;
    if (!target) {
      // 如果没有文案匹配，兜底选择 footer 里的主按钮
      const footer = root.querySelector('.next-dialog-footer') || root.querySelector('[class*="footer"]');
      if (footer) {
        const primary = footer.querySelector('button.next-btn-primary, button[class*="primary"]');
        if (primary && isVisible(primary) && !primary.disabled) {
          target = primary;
        }
      }
    }

    if (!target) return null;

    target.click();
    return (target.innerText || target.textContent || '').trim() || '确定';
  }).catch(() => null);

  if (!clickedText) return false;
  ctx.logger.info(`  ✅ JS 兜底点击素材库“确定”成功（${clickedText}）`);
  return true;
}

/**
 * 确认并关闭素材库弹窗（带重试与兜底）
 * @returns {Promise<boolean>}
 */
async function confirmMaterialPickerWithRetry(page, workingLocator, ctx, productId) {
  // 先快速判断是否存在确认按钮；没有的话就不浪费时间反复找“确定”
  const confirmPresent = await hasAnyConfirmButton(page, workingLocator).catch(() => false);
  if (!confirmPresent) {
    ctx.logger.info('  ℹ️ 未检测到素材库“确定/完成/使用”按钮，将直接通过“点击空白/基础信息”关闭弹窗');
    return false;
  }

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    ctx.logger.info(`  🔁 确认选图并关闭弹窗（第${attempt}/${maxAttempts}次）`);

    // 给 UI 一点时间让“确定”从 disabled -> enabled
    await page.waitForTimeout(400);

    // 1) 先在已命中的定位器上下文里尝试
    await confirmImageSelection(page, workingLocator, ctx);

    // 2) 如仍未关闭，遍历所有 iframe 再试一轮（有些版本“确定”不在同一个 iframe）
    if (await isMaterialPickerOpen(page, ctx)) {
      const iframeCount = await page.locator('iframe').count().catch(() => 0);
      for (let i = 0; i < iframeCount; i++) {
        await confirmImageSelection(page, page.frameLocator('iframe').nth(i), ctx);
        if (!await isMaterialPickerOpen(page, ctx)) break;
      }
    }

    // 3) 清理可能遮挡点击的浮层（重要消息/通知等），再试一次
    if (await isMaterialPickerOpen(page, ctx)) {
      ctx.logger.info('  🧹 尝试清理遮挡弹窗（重要消息/通知等）...');
      await closeAllPopups(page, 2).catch(() => {});
      await confirmImageSelection(page, workingLocator, ctx);
    }

    // 4) JS 兜底点击（当前文档）
    if (await isMaterialPickerOpen(page, ctx)) {
      await forceClickConfirmByJS(page, ctx);
      await page.waitForTimeout(600);
    }

    // 5) 键盘兜底：Enter（部分弹窗默认按钮）
    if (await isMaterialPickerOpen(page, ctx)) {
      await page.keyboard.press('Enter').catch(() => {});
      await page.waitForTimeout(600);
    }

    if (!await isMaterialPickerOpen(page, ctx)) {
      ctx.logger.success('  ✅ 素材库弹窗已关闭');
      return true;
    }
  }

  // 最终失败：落一个截图，便于人工点一下“确定”
  try {
    const screenshotDir = path.resolve(process.cwd(), 'screenshots');
    const confirmFailScreenshot = path.join(screenshotDir, `${productId}_step5_confirm_failed.png`);
    await page.screenshot({ path: confirmFailScreenshot, fullPage: false });
    ctx.logger.error(`  📸 素材库确认失败截图: ${confirmFailScreenshot}`);
  } catch (e) {
    // 忽略截图失败
  }

  return false;
}

/**
 * 点击顶部“基础信息”tab（用于回到主表单并触发一些浮层收起）
 */
async function clickBasicInfoTab(page, ctx) {
  const candidates = [
    'li.next-menu-item:has-text("基础信息")',
    'li.next-nav-item:has-text("基础信息")',
    '.next-tabs-tab:has-text("基础信息")',
    '[role="tab"]:has-text("基础信息")',
    'a:has-text("基础信息")',
    'text=基础信息'
  ];

  for (const selector of candidates) {
    try {
      const tab = page.locator(selector).first();
      if (await tab.isVisible({ timeout: 200 }).catch(() => false)) {
        await tab.click({ force: true, timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(300);
        ctx.logger.info('  ✅ 已点击“基础信息”');
        return true;
      }
    } catch (e) {
      // ignore
    }
  }
  return false;
}

/**
 * 尝试关闭素材库选图弹窗（不依赖“确定”按钮）
 * @returns {Promise<boolean>}
 */
async function closeMaterialPickerWithRetry(page, workingLocator, ctx, productId, options = {}) {
  const preferBlankClose = !!options.preferBlankClose;
  const maxAttempts = 3;

  const tryClickMaskInRoot = async (root) => {
    const candidates = [
      root.locator('.next-dialog-mask').first(),
      root.locator('.next-overlay-backdrop').first(),
      root.locator('.next-overlay-wrapper').first(),
      root.locator('[class*="mask"]').first(),
      root.locator('[class*="backdrop"]').first(),
      root.locator('[class*="overlay"]').first()
    ];

    for (const mask of candidates) {
      try {
        if (await mask.isVisible({ timeout: 150 }).catch(() => false)) {
          await mask.click({ force: true, timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(400);
          return true;
        }
      } catch (e) {
        // ignore
      }
    }
    return false;
  };

  const tryClickBlankInRoot = async (root) => {
    const candidates = [
      root.locator('div.media-wrap').first(),
      root.locator('.media-wrap').first(),
      root.locator('[class*="media-wrap"]').first(),
      root.locator('body').first()
    ];

    for (const area of candidates) {
      try {
        if (await area.isVisible({ timeout: 150 }).catch(() => false)) {
          await area.click({ force: true, timeout: 1000, position: { x: 10, y: 10 } }).catch(() => {});
          await page.waitForTimeout(400);
          return true;
        }
      } catch (e) {
        // ignore
      }
    }
    return false;
  };

  const tryClickCloseInRoot = async (root) => {
    const candidates = [
      root.locator('.next-dialog-close').first(),
      root.locator('.next-dialog-header .next-icon-close').first(),
      root.locator('.next-icon-close').first(),
      root.locator('button[aria-label="Close"], button[aria-label="关闭"]').first(),
      root.locator('button:has-text("关闭"), button:has-text("取消"), button:has-text("返回")').first(),
      root.locator('[role="button"]:has-text("关闭"), [role="button"]:has-text("取消")').first()
    ];

    for (const btn of candidates) {
      try {
        if (await btn.count().catch(() => 0)) {
          await btn.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
        }
        if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
          await btn.click({ force: true, timeout: 1500 }).catch(() => {});
          await page.waitForTimeout(400);
          return true;
        }
      } catch (e) {
        // ignore and try next
      }
    }
    return false;
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!await isMaterialPickerOpen(page, ctx)) return true;

    ctx.logger.info(`  🔁 尝试关闭素材库弹窗（第${attempt}/${maxAttempts}次）`);

    // 1) 优先在已命中的 iframe 上下文里点关闭/点遮罩/点空白
    if (workingLocator) {
      if (preferBlankClose) {
        await tryClickMaskInRoot(workingLocator).catch(() => {});
        if (await isMaterialPickerOpen(page, ctx)) {
          await tryClickBlankInRoot(workingLocator).catch(() => {});
        }
        if (await isMaterialPickerOpen(page, ctx)) {
          await tryClickCloseInRoot(workingLocator).catch(() => {});
        }
      } else {
        await tryClickCloseInRoot(workingLocator).catch(() => {});
        if (await isMaterialPickerOpen(page, ctx)) {
          await tryClickMaskInRoot(workingLocator).catch(() => {});
        }
        if (await isMaterialPickerOpen(page, ctx)) {
          await tryClickBlankInRoot(workingLocator).catch(() => {});
        }
      }
    }

    // 2) 遍历所有 iframe，尝试点关闭/遮罩/空白
    if (await isMaterialPickerOpen(page, ctx)) {
      const iframeCount = await page.locator('iframe').count().catch(() => 0);
      for (let i = 0; i < iframeCount; i++) {
        const frameRoot = page.frameLocator('iframe').nth(i);
        if (preferBlankClose) {
          await tryClickMaskInRoot(frameRoot).catch(() => {});
          if (await isMaterialPickerOpen(page, ctx)) {
            await tryClickBlankInRoot(frameRoot).catch(() => {});
          }
          if (await isMaterialPickerOpen(page, ctx)) {
            await tryClickCloseInRoot(frameRoot).catch(() => {});
          }
        } else {
          await tryClickCloseInRoot(frameRoot).catch(() => {});
          if (await isMaterialPickerOpen(page, ctx)) {
            await tryClickMaskInRoot(frameRoot).catch(() => {});
          }
          if (await isMaterialPickerOpen(page, ctx)) {
            await tryClickBlankInRoot(frameRoot).catch(() => {});
          }
        }
        if (!await isMaterialPickerOpen(page, ctx)) break;
      }
    }

    // 3) 主页面上尝试关闭（preferBlankClose 时优先遮罩/空白，避免误触“取消/返回”导致选中失效）
    if (await isMaterialPickerOpen(page, ctx)) {
      if (preferBlankClose) {
        await tryClickMaskInRoot(page).catch(() => {});
        if (await isMaterialPickerOpen(page, ctx)) {
          await tryClickBlankInRoot(page).catch(() => {});
        }
        if (await isMaterialPickerOpen(page, ctx)) {
          await tryClickCloseInRoot(page).catch(() => {});
        }
      } else {
        await tryClickCloseInRoot(page).catch(() => {});
        if (await isMaterialPickerOpen(page, ctx)) {
          await tryClickMaskInRoot(page).catch(() => {});
        }
        if (await isMaterialPickerOpen(page, ctx)) {
          await tryClickBlankInRoot(page).catch(() => {});
        }
      }
    }

    // 5) 参考人工操作：点一下“基础信息”（有些浮层需要失焦才会收起）
    if (await isMaterialPickerOpen(page, ctx)) {
      await clickBasicInfoTab(page, ctx).catch(() => {});
    }

    // 7) 最后兜底：点页面左上角空白
    if (await isMaterialPickerOpen(page, ctx)) {
      await page.mouse.click(10, 10).catch(() => {});
      await page.waitForTimeout(500);
    }

    if (!await isMaterialPickerOpen(page, ctx)) {
      ctx.logger.success('  ✅ 素材库弹窗已关闭（关闭兜底）');
      return true;
    }
  }

  try {
    const screenshotDir = path.resolve(process.cwd(), 'screenshots');
    const closeFailScreenshot = path.join(screenshotDir, `${productId}_step5_close_failed.png`);
    await page.screenshot({ path: closeFailScreenshot, fullPage: false });
    ctx.logger.error(`  📸 素材库关闭失败截图: ${closeFailScreenshot}`);
  } catch (e) {
    // ignore
  }

  return false;
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

	  // 避免阶段重试/批量脚本导致重复上传：如果缓存已标记 Step5 done 且未显式要求重跑，则直接返回
	  const forceStep5 = !!(ctx.options && ctx.options.forceStep5);
	  const prevStatus = (taskCache.stepStatus && taskCache.stepStatus[5]) || '';
	  if (prevStatus === 'done' && !forceStep5) {
	    ctx.logger.info('⏭️ 检测到 Step5 已完成，跳过主图上传（如需重跑请加 --force-step5）');
	    return;
	  }

	  // 防御：重试/手动切页后 page1 可能不在发布页，优先尝试回到 Step4 保存的 publishPageUrl
	  try {
	    await page.bringToFront().catch(() => {});
	    const publishPageUrl = taskCache?.browserContext?.publishPageUrl;
	    const currentUrl = page.url();
	    const looksLikePublish = /\/sell\/v2\/publish|publish\.htm/i.test(currentUrl);
	    if (publishPageUrl && !looksLikePublish) {
	      ctx.logger.warn(`⚠️ 当前页面可能不是发布页（${currentUrl}），尝试回到发布页: ${publishPageUrl}`);
	      const timeout = parseInt(process.env.TAOBAO_TIMEOUT || '30000');
	      await page.goto(publishPageUrl, { waitUntil: 'domcontentloaded', timeout }).catch(() => {});
	      await page.waitForTimeout(800);
	    }
	    await closeAllPopups(page, 2).catch(() => {});
	  } catch (e) {
	    // ignore
	  }

	  // 如果 Step0 已标记前三步完成（skipPhaseA），直接跳过主图上传，避免重复
	  // 如果希望强制重跑 Step5，即使标记了 skipPhaseA，也继续执行

  // 注释掉自动跳过逻辑,允许重新执行 Step5 进行测试
  // 如果之前已经完成过 Step5，则直接跳过，避免重复上传
  // const prevStatus = (taskCache.stepStatus && taskCache.stepStatus[5]) || '';
  // if (prevStatus === 'done') {
  //   ctx.logger.info('⚠️ 检测到 Step5 已完成，跳过主图上传以避免重复上传');
  //   updateStepStatus(productId, 5, 'skipped');
  //   return;
  // }

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
	      await page.screenshot({ path: debugScreenshot, fullPage: false, timeout: 10000 });
	      ctx.logger.info(`📸 调试截图: ${debugScreenshot}`);
	    } catch (e) {
	      ctx.logger.warn('调试截图失败');
	    }

    // 步骤2：清理模板预置主图（千牛新 UI 会默认带图，必须先删，否则会误点到视频上传位）
    ctx.logger.info('\n[步骤2] 检查并清理模板预置主图');
    await clearMainImagesIfNeeded(page, ctx).catch(() => {});

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

    const uploadBoxClicked = await clickMainImageUploadSlot(page, ctx);

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
	    try {
	      const debugScreenshotAfter = '/Users/sanshui/Desktop/tbzhuaqu/screenshots/debug_after_click.png';
	      await page.screenshot({
	        path: debugScreenshotAfter,
	        fullPage: false,
	        timeout: 10000
	      });
	      ctx.logger.info(`📸 点击后调试截图: ${debugScreenshotAfter}`);
	    } catch (e) {
	      ctx.logger.warn(`调试截图失败（但不影响流程）: ${e.message}`);
	    }

    // 再次滚动到顶部，防止弹窗打开时页面跳动
    await scrollToTop();
    await page.waitForTimeout(500);

	    // 等待弹窗出现（限时 8 秒）
	    ctx.logger.info('\n等待"选择图片"弹窗出现...');
	    // 不使用 waitForSelector（在某些状态下会卡死），改用重试探测
	    await page.waitForTimeout(200);

	    // 步骤4：在弹出的"选择图片"对话框中搜索文件夹
	    ctx.logger.info('\n[步骤4] 在弹窗中搜索文件夹');

	    // 声明工作定位器（需要在try外部声明，以便后续步骤使用）
	    let workingLocator;  // 工作的定位器（iframe或page）

	    // 方案A：优先使用搜索框（根据实际弹窗结构）
	    try {
	      ctx.logger.info('  🔍 等待搜索框就绪（最多15秒）...');
	      const found = await waitForFolderSearchInput(page, ctx, 15000);
	      if (!found) {
	        throw new Error(`等待弹窗搜索框超时（已尝试 ${SEARCH_INPUT_SELECTORS.length} 个候选选择器）`);
	      }

	      const searchInput = found.searchInput;
	      workingLocator = found.workingLocator;
	      ctx.logger.success(`  ✅ 在${found.location}中找到搜索框（${found.selector}）`);

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
	      try {
	        const debugScreenshotFolder = '/Users/sanshui/Desktop/tbzhuaqu/screenshots/debug_folder_opened.png';
	        await page.screenshot({
	          path: debugScreenshotFolder,
	          fullPage: false,
	          timeout: 10000
	        });
	        ctx.logger.info(`  📸 文件夹打开后截图: ${debugScreenshotFolder}`);
	      } catch (e) {
	        ctx.logger.warn(`  调试截图失败（但不影响流程）: ${e.message}`);
	      }

    } catch (searchError) {
      // 方案B：搜索失败时，使用左侧文件夹树
      ctx.logger.warn(`\n⚠️  搜索框方案失败: ${searchError.message}`);
      ctx.logger.info('  🔄 切换到方案B：左侧文件夹树');

	      try {
	        // 智能检测：确定使用 iframe 还是主页面
	        ctx.logger.info('  🔍 检测弹窗类型（用于文件夹树）...');

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
	        const treeStart = Date.now();
	        while (Date.now() - treeStart < 12000 && !folderFound) {
	          // 弹窗可能在 iframe 中，也可能直接渲染在主页面
	          const iframeCount = await page.locator('iframe').count().catch(() => 0);
	          const treeLocator = iframeCount > 0 ? page.frameLocator('iframe').first() : page;

	          for (const selector of treeFolderSelectors) {
	            try {
	              const folderInTree = treeLocator.locator(selector).first();  // 使用树定位器
	              const count = await folderInTree.count();
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
	            await page.waitForTimeout(500);
	          }
	        }

	        if (!folderFound) throw new Error(`在左侧文件夹树中未找到文件夹: ${productId}`);

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
        ctx.logger.info('  排序：尝试点击排序下拉并选择"文件名降序"');
        const triggers = [
          // 方式1：带文字的下拉选择器
          uploadLocator.locator('.next-select-trigger, .next-select').filter({ hasText: /上传时间|文件名|排序/ }).first(),
          // 方式2：按钮角色
          uploadLocator.getByRole('button', { name: /上传时间|文件名|排序/ }).first(),
          // 方式3：data-testid 或 class 包含 sort
          uploadLocator.locator('[data-testid*="sort"], [class*="sort"], .PicList_sort, .picList_sort').locator('button, .next-select-trigger').first(),
          // 方式4：包含"排序"文字的元素
          uploadLocator.getByText(/排序/).locator('..').locator('button, .next-select-trigger').first(),
          // 方式5：下拉箭头图标（通常有 .next-icon-arrow-down）
          uploadLocator.locator('button').filter({ has: uploadLocator.locator('.next-icon-arrow-down, .arrow-down') }).first(),
          // 方式6：工具栏中的下拉按钮
          uploadLocator.locator('.toolbar, .action-bar, .filter-bar').locator('.next-select-trigger, select, button').first()
        ];

        let trigger = null;
        for (let i = 0; i < triggers.length; i++) {
          const t = triggers[i];
          try {
            const count = await t.count();
            if (count > 0) {
              ctx.logger.info(`  找到排序触发器（方式${i + 1}），共${count}个`);
              trigger = t;
              break;
            }
          } catch (e) {
            // 忽略单个选择器的错误，继续尝试下一个
          }
        }

        if (trigger) {
          await trigger.click({ force: true });
          await page.waitForTimeout(500);  // 增加等待时间，让下拉菜单完全展开

          const optionSelectors = [
            'li.next-menu-item:has-text("文件名降序")',
            'li:has-text("文件名降序")',
            'li:has-text("文件名倒序")',
            'li:has-text("名称降序")',
            'li:has-text("按文件名降序")',
            '[role="option"]:has-text("文件名降序")',
            '[role="menuitem"]:has-text("文件名降序")',
            '.next-menu-item:has-text("降序")',
            'text=/文件名.*降序/',
            'text=/名称.*降序/'
          ];

          let option = null;
          for (const sel of optionSelectors) {
            try {
              const candidate = page.locator(sel).first();  // 使用 page 而不是 uploadLocator，因为下拉菜单可能在外层
              const count = await candidate.count();
              if (count > 0) {
                ctx.logger.info(`  找到排序选项: ${sel}`);
                option = candidate;
                break;
              }
            } catch (e) {
              // 忽略单个选择器的错误
            }
          }

          if (option) {
            await option.click({ force: true });
            ctx.logger.info('  ✅ 已选择"文件名降序"');
            await page.waitForTimeout(400);
          } else {
            ctx.logger.warn('  ⚠️ 未找到"文件名降序/倒序"选项，继续默认排序');
            // 尝试按ESC键关闭可能打开的下拉菜单
            await page.keyboard.press('Escape');
          }
        } else {
          ctx.logger.warn('  ⚠️ 未找到排序下拉，继续默认排序');
        }
      } catch (e) {
        ctx.logger.warn(`  ⚠️ 排序操作失败（忽略继续）: ${e.message}`);
        // 尝试按ESC键关闭可能打开的下拉菜单
        try {
          await page.keyboard.press('Escape');
        } catch {}
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

		      // ==================== 确认选图并关闭素材库弹窗 ====================
		      ctx.logger.info('\n[步骤6.5] 确认选图结果并关闭素材库弹窗');

		      // 先尝试常规“确定/完成/主按钮”
		      const confirmed = await confirmMaterialPickerWithRetry(page, uploadLocator, ctx, productId);

		      // 如果未自动关闭（常见于：未满5张/无确定按钮/需要失焦），按“点空白/基础信息”方式强制收起
		      if (await isMaterialPickerOpen(page, ctx)) {
		        ctx.logger.warn('  ⚠️ 弹窗仍未关闭，尝试点击空白/基础信息以收起...');
		        await closeMaterialPickerWithRetry(page, uploadLocator, ctx, productId, { preferBlankClose: !confirmed });
		      }

	      if (await isMaterialPickerOpen(page, ctx)) {
	        throw new Error('素材库弹窗仍未关闭（可手动点击空白处/基础信息/右上角关闭后重试）');
	      }

	      // 回到基础信息，确保后续步骤不被遮挡
	      await clickBasicInfoTab(page, ctx).catch(() => {});
	      await clickBasicInfoTab(page, ctx).catch(() => {});

	      // 如出现裁剪弹窗，自动点击"确定"
	      await handleCropConfirm(page, ctx);

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

      // ==================== 发布页落地验证（限时） ====================
      ctx.logger.info('\n[步骤7.5] 检查发布页主图是否已落地...');
      const mainImagesOk = await waitForMainImagesFilled(page, ctx, 15000);
      if (!mainImagesOk) {
        throw new Error('主图未落到发布页（1:1主图仍为空），建议关闭弹窗后重试');
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
	    // 恢复上传位可点击，避免重跑时因 pointer-events=none 造成误判/无法点击
	    if (ctx.page1) {
	      try {
	        await ctx.page1.evaluate(() => {
	          const uploadBoxes = document.querySelectorAll('.upload-pic-box, [class*="upload"], .sell-field-mainImagesGroup .upload-item');
	          uploadBoxes.forEach((box) => {
	            box.style.pointerEvents = '';
	            box.style.opacity = '';
	          });
	        });
	      } catch (e) {
	        // 忽略恢复失败
	      }
	    }
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
 * 新规则：
 * - 默认：从最后往前依次点击 5 张（last1~last5）
 * - 卡拉威（Callaway）特例：保持“跳点点击”（原颜色策略）以匹配其素材分布
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

  const brandKey = (brand || '').trim().toLowerCase();
  const isCallaway = brandKey.includes('callaway') || (brand || '').includes('卡拉威');

  // 统一使用 locator nth + hoverBK 点击，避免“点击卡片只会单选/预览”导致只选中1张
  const cardSel = imageCardSelector || '.PicList_pic_background__pGTdV';
  const cardLocator = uploadFrame.locator(cardSel);
  const safeCount = await cardLocator.count().catch(() => 0);
  const totalCards = safeCount || imageCount;

  const clickCardForMultiSelect = async (cardIndex) => {
    const page = ctx.page1;
    const card = cardLocator.nth(cardIndex);

    await card.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 120));

    // hover 后优先点蓝色选中遮罩（多选更稳）
    await card.hover({ timeout: 1500 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 80));

    const overlayCandidates = [
      '.PicList_hoverBK__zH1fy',
      '[class*="hoverBK"]',
      '[class*="hoverBk"]'
    ];

    for (const sel of overlayCandidates) {
      const overlay = card.locator(sel).first();
      if (await overlay.isVisible({ timeout: 120 }).catch(() => false)) {
        await overlay.click({ force: true, timeout: 2000 }).catch(() => {});
        if (page) await page.waitForTimeout(80).catch(() => {});
        return true;
      }
    }

    // fallback：直接点卡片
    await card.click({ timeout: 3000 }).catch(() => {});
    if (page) await page.waitForTimeout(80).catch(() => {});
    return true;
  };

  // ========== 默认：倒序取5张（last1~last5）==========
  if (!isCallaway) {
    ctx.logger.info(`  ✅ 默认规则(${brand || '未知品牌'}): 直接从最后往前取 5 张主图\n`);

    // 确定要选择的图片数量（最多5张，如果少于5张则全取）
    const selectCount = Math.min(5, totalCards);
    ctx.logger.info(`  📋 计划选择: ${selectCount} 张图片（从最后往前）\n`);

    // 从最后一张往前选择
      for (let i = 0; i < selectCount; i++) {
        const targetIndex = totalCards - 1 - i;  // 倒数第(i+1)张
        ctx.logger.info(`第${i+1}张 → 索引${targetIndex} (倒数第${i+1}张)`);

        try {
        const clicked = await clickCardForMultiSelect(targetIndex);
        if (!clicked) throw new Error('点击失败');

        selectedCount++;
        ctx.logger.info(`  ✅ 第${i+1}张 → 索引${targetIndex} → 成功`);

        // 每次点击后检查是否出现裁剪弹窗
        const page = ctx.page1;
        if (page) {
          ctx.logger.info(`  🔍 检查裁剪弹窗...`);
          const cropDetected = await handleCropConfirm(page, ctx);
          if (cropDetected) {
            ctx.logger.info(`  ⚠️  检测到裁剪弹窗并处理，跳出选择循环，进入下一步`);
            break; // 立即跳出循环
          }
        }

      } catch (error) {
        ctx.logger.warn(`  ❌ 第${i+1}张 → 失败: ${error.message}`);
      }

      // 首张点击后额外停顿，避免过快触发弹窗未就绪
      if (i === 0) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // 点击间隔
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    ctx.logger.info(`\n✅ 默认规则图片选择完成：成功 ${selectedCount}/${selectCount} 张\n`);
    return selectedCount;
  }

  // ========== 卡拉威：跳点点击（原颜色策略）==========
  ctx.logger.info(`  ✨ 卡拉威特例(${brand}): 维持跳点点击（固定5次点击，根据颜色数智能选择索引）\n`);

  ctx.logger.info(`  📦 使用选择器 "${cardSel}"（total=${totalCards}）\n`);

  // 定义5次点击的索引选择规则
  const clickRules = [
    // 第1张：始终 last(1)
    {
      name: '第1张',
      getIndex: () => pickIndexLast(1, totalCards),
      getRuleName: () => 'last(1)'
    },

    // 第2张：colorCount >= 2 用 first(6)，否则 last(2)
    {
      name: '第2张',
      getIndex: () => {
        if (colorCount >= 2) return pickIndexFirst(6, totalCards);
        else return pickIndexLast(2, totalCards);
      },
      getRuleName: () => colorCount >= 2 ? 'first(6)' : 'last(2)'
    },

    // 第3张：根据颜色数选择
    {
      name: '第3张',
      getIndex: () => {
        if (colorCount === 2) return pickIndexLast(2, totalCards);
        else if (colorCount >= 3) return pickIndexFirst(12, totalCards);
        else return pickIndexLast(3, totalCards);  // colorCount === 1
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
        if (colorCount === 2) return pickIndexFirst(5, totalCards);
        else if (colorCount === 3) return pickIndexLast(2, totalCards);
        else if (colorCount >= 4) return pickIndexFirst(18, totalCards);
        else return pickIndexLast(4, totalCards);  // colorCount === 1
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
        if (colorCount === 1) return pickIndexLast(5, totalCards);
        else if (colorCount === 2) return pickIndexLast(3, totalCards);
        else if (colorCount === 3) return pickIndexFirst(5, totalCards);
        else if (colorCount === 4) return pickIndexFirst(24, totalCards);
        else if (colorCount === 5) return pickIndexFirst(30, totalCards);
        else return pickIndexFirst(30, totalCards);  // colorCount >= 6
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
      // 边界保护：确保索引在有效范围内
      const actualIndex = Math.min(Math.max(targetIndex, 0), totalCards - 1);
      ctx.logger.info(`  → 实际索引${actualIndex}`);

      const clicked = await clickCardForMultiSelect(actualIndex);
      if (!clicked) throw new Error('点击失败');

      selectedCount++;
      ctx.logger.info(`  ✅ ${rule.name} → 索引${actualIndex} → 成功`);

      // 每次点击后检查是否出现裁剪弹窗
      const page = ctx.page1;
      if (page) {
        ctx.logger.info(`  🔍 检查裁剪弹窗...`);
        const cropDetected = await handleCropConfirm(page, ctx);
        if (cropDetected) {
          ctx.logger.info(`  ⚠️  检测到裁剪弹窗并处理，跳出选择循环，进入下一步`);
          break; // 立即跳出循环
        }
      }

    } catch (error) {
      ctx.logger.warn(`  ❌ ${rule.name} → 失败: ${error.message}`);
      // 继续尝试剩余索引
    }

    // 首张点击后额外停顿，避免过快触发弹窗未就绪
    if (i === 0) {
      await new Promise(resolve => setTimeout(resolve, 800));
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
  ctx.logger.info('应用降级策略：尝试关闭弹窗并验证主图落地');

  try {
    // 如果主图已经落地，优先尝试关闭弹窗并返回（避免误判卡死）
    const mainImagesOk = await waitForMainImagesFilled(page, ctx, 8000);
    const picker = await waitForFolderSearchInput(page, ctx, 1200).catch(() => null);
    const working = picker ? picker.workingLocator : null;

    if (mainImagesOk) {
      if (await isMaterialPickerOpen(page, ctx)) {
        await closeMaterialPickerWithRetry(page, working, ctx, productId).catch(() => {});
      }
      ctx.logger.success('✅ 降级策略：主图已落地');
      return;
    }

    // 尝试清理遮挡弹窗（重要消息/通知等）
    await closeAllPopups(page, 2).catch(() => {});

	    // 仍在选图弹窗中：再试一次确认/关闭
	    if (await isMaterialPickerOpen(page, ctx)) {
	      if (working) {
	        const confirmed = await confirmMaterialPickerWithRetry(page, working, ctx, productId).catch(() => false);
	        await closeMaterialPickerWithRetry(page, working, ctx, productId, { preferBlankClose: !confirmed }).catch(() => {});
	      }
	      await closeMaterialPickerWithRetry(page, working, ctx, productId, { preferBlankClose: true }).catch(() => {});
	    }

    const mainImagesAfter = await waitForMainImagesFilled(page, ctx, 10000);
    if (!mainImagesAfter) {
      throw new Error('主图仍未落地');
    }

    ctx.logger.success('✅ 降级策略执行成功（主图已落地）');
  } catch (error) {
    ctx.logger.error(`降级策略失败: ${error.message}`);
    throw error;
  }
}

module.exports = { step5 };
