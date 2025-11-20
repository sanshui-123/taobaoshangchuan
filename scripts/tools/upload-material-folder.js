/**
 * Step5: 素材库上传
 * 在素材库中创建商品文件夹并上传所有本地图片
 *
 * 使用方法：
 * node scripts/tools/upload-material-folder.js --product=12345 --verbose
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { closeMaterialCenterPopups } = require('../utils/advert-handler');

// 解析命令行参数
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || process.env.NODE_ENV === 'development';

function logVerbose(message, data = null) {
  if (VERBOSE) {
    if (data) {
      console.log(`[Step5-详细] ${message}`, data);
    } else {
      console.log(`[Step5-详细] ${message}`);
    }
  }
}

function log(message, type = 'info') {
  const prefix = {
    'info': '📋',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'step': '🎯'
  }[type] || '📋';

  console.log(`${prefix} Step5: ${message}`);
}


/**
 * 解析命令行参数
 */
function parseArgs() {
  const productId = args.find(arg => arg.startsWith('--product='))?.split('=')[1];

  if (!productId) {
    log('缺少商品ID参数！使用方法: --product=<PRODUCT_ID>', 'error');
    log('示例: node scripts/tools/upload-material-folder.js --product=12345 --verbose', 'error');
    process.exit(1);
  }

  return { productId };
}

/**
 * 验证本地图片文件夹是否存在
 */
function validateLocalFolder(productId) {
  const localFolder = path.join(process.cwd(), 'assets', productId);

  if (!fs.existsSync(localFolder)) {
    log(`本地文件夹不存在: ${localFolder}`, 'error');
    return null;
  }

  // 查找所有color_xx_xx.jpg文件
  const files = fs.readdirSync(localFolder)
    .filter(file => file.startsWith('color_') && file.endsWith('.jpg'));

  logVerbose(`找到 ${files.length} 个图片文件`, files);

  if (files.length === 0) {
    log(`在文件夹 ${localFolder} 中没有找到color_xx_xx.jpg文件`, 'warning');
    return null;
  }

  return { localFolder, files };
}

/**
 * 处理文件上传对话框
 */
async function handleFileUploadDialog(page, productId, localFolder, files) {
  logVerbose('等待文件上传对话框出现...');

  try {
    // 等待文件输入元素出现
    await page.waitForSelector('input[type="file"]', { timeout: 10000 });

    // 获取文件输入元素
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error('未找到文件上传输入元素');
    }

    logVerbose('找到文件输入元素，准备上传文件...');

    // 构建完整文件路径
    const filePaths = files.map(file => path.join(localFolder, file));
    logVerbose('准备上传的文件路径', filePaths);

    // 选择文件进行上传
    await fileInput.setInputFiles(filePaths);

    // 部分系统会在 setInputFiles 后保留原生文件选择框，再次发送 ESC 以确保关闭
    try {
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      logVerbose('已发送 ESC 关闭残留的文件选择框');
    } catch (escError) {
      logVerbose(`发送 ESC 关闭文件选择框失败: ${escError.message}`);
    }

    log(`已选择 ${filePaths.length} 个文件进行上传`, 'success');

    return true;

  } catch (error) {
    log(`文件上传对话框处理失败: ${error.message}`, 'error');
    logVerbose('详细错误信息', error);
    return false;
  }
}

/**
 * 确保文件夹已展开
 */
async function ensureFolderExpanded(page, folderLabel) {
  logVerbose(`检查文件夹 ${folderLabel} 是否已展开...`);

  try {
    // 查找文件夹节点
    const folderNode = await page.$(`li.next-tree-node:has-text("${folderLabel}")`);

    if (!folderNode) {
      logVerbose(`未找到文件夹 ${folderLabel}`);
      return false;
    }

    // 检查是否已展开
    const isExpanded = await folderNode.evaluate(el => {
      const switcher = el.querySelector('.next-tree-switcher');
      if (!switcher) return null;
      return switcher.getAttribute('aria-expanded') === 'true';
    });

    if (isExpanded === null) {
      logVerbose(`文件夹 ${folderLabel} 没有展开按钮（可能是叶子节点）`);
      return true;
    }

    if (isExpanded) {
      log(`文件夹 ${folderLabel} 已经展开`, 'success');
      return true;
    }

    // 如果未展开，点击展开按钮
    logVerbose(`文件夹 ${folderLabel} 未展开，准备点击展开按钮...`);
    const switcher = await page.$(`li.next-tree-node:has-text("${folderLabel}") .next-tree-switcher`);

    if (switcher) {
      await switcher.click();
      log(`✅ 已展开 ${folderLabel} 子树`, 'success');
      await page.waitForTimeout(2000); // 等待子节点加载
      return true;
    } else {
      logVerbose(`未找到文件夹 ${folderLabel} 的展开按钮`);
      return false;
    }

  } catch (error) {
    logVerbose(`展开文件夹 ${folderLabel} 失败: ${error.message}`);
    return false;
  }
}

/**
 * 强制移除顶部搜索面板并保持持续清理
 */
async function forceRemoveSearchPanel(page, reason = '通用') {
  try {
    logVerbose(`强制清理搜索面板（原因: ${reason}）...`);
    const removedCount = await page.evaluate(() => {
      if (!window.__forceRemoveSearchPanel) {
        window.__forceRemoveSearchPanel = () => {
          const selectors = [
            '#qnworkbench_search_panel',
            '.qnworkbench_search_panel',
            '[class*="SearchPanel"]',
            '[class*="searchPanel"]'
          ];
          let removed = 0;
          selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
              el.remove();
              removed++;
            });
          });
          return removed;
        };
      }

      const removedNow = window.__forceRemoveSearchPanel();

      if (!window.__searchPanelObserver) {
        window.__searchPanelObserver = new MutationObserver(() => {
          window.__forceRemoveSearchPanel();
        });
        window.__searchPanelObserver.observe(document.body, { childList: true, subtree: true });
      }

      return removedNow;
    });

    logVerbose(`搜索面板移除数量: ${removedCount}`);
  } catch (error) {
    logVerbose(`强制清理搜索面板失败: ${error.message}`);
  }
}

/**
 * 强制关闭上传结果浮层/任意 Next Dialog
 */
async function forceCloseUploadOverlay(page, reason = '上传结果弹窗') {
  logVerbose(`强制关闭上传浮层（原因: ${reason}）...`);
  try {
    // 使用 Playwright locators 精确关闭对话框按钮
    const selectors = [
      '.next-dialog-close',
      '.next-dialog button.next-btn',
      'button:has-text("完成")',
      'button:has-text("取消")',
      'button:has-text("关闭")'
    ];

    for (const selector of selectors) {
      const locator = page.locator(selector);
      const count = await locator.count();
      for (let i = 0; i < count; i++) {
        const btn = locator.nth(i);
        if (await btn.isVisible().catch(() => false)) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(200);
        }
      }
    }

    // 最后一招：直接移除残留的 next-dialog 元素
    await page.evaluate(() => {
      const selectorsToRemove = [
        '.next-dialog',
        '[role="dialog"]',
        '.next-overlay-wrapper',
        '.next-overlay-backdrop',
        '.next-overlay-inner',
        '.next-overlay'
      ];
      selectorsToRemove.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });

      const masks = [
        '.qnworkbench_search_panel',
        '#qnworkbench_search_panel',
        '.next-overlay-wrapper'
      ];
      masks.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });

      document.body.style.pointerEvents = 'auto';
      document.body.style.overflow = 'auto';
    });
  } catch (error) {
    logVerbose(`强制关闭上传浮层失败: ${error.message}`);
  }
}

/**
 * 等待上传完成并检查结果
 */
async function waitForUploadComplete(page) {
  log('等待上传完成...');

  try {
    // 等待一段时间让文件开始上传
    await page.waitForTimeout(3000);

    // 首先检查上传进度条，等待所有进度条消失
    logVerbose('检查上传进度条...');
    let progressCheckCount = 0;
    const maxProgressChecks = 20; // 最多检查20次，每次3秒，总共60秒

    while (progressCheckCount < maxProgressChecks) {
      // 使用更精确的进度条选择器，避免静态UI元素干扰
      const progressElements = await page.$$([
        '.upload-progress-bar',
        '.upload-progress:visible',
        '[class*="upload-progress"]',
        '.file-upload-progress',
        '.material-upload-progress',
        'img[alt*="uploading"]',
        '.uploading-file'
      ].join(', '));

      const loadingElements = await page.$$([
        '.upload-loading',
        '.file-uploading',
        '.material-uploading',
        '[class*="upload-loading"]',
        'button:has-text("上传中")',
        '.status-uploading'
      ].join(', '));

      logVerbose(`第${progressCheckCount + 1}次检查进度条: 进度条${progressElements.length}个, 加载中${loadingElements.length}个`);

      // 检查进度条是否真的在变化（避免静态元素）
      let hasActiveProgress = false;
      if (progressElements.length > 0) {
        // 检查进度条是否有动态属性（如style, aria-valuenow等）
        for (const element of progressElements) {
          try {
            const style = await element.getAttribute('style');
            const ariaValue = await element.getAttribute('aria-valuenow');
            const width = await element.getAttribute('width');

            // 如果有动态属性，认为是活跃的进度条
            if (style || ariaValue || width) {
              hasActiveProgress = true;
              break;
            }
          } catch (e) {
            // 如果检查失败，保守起见认为可能还在上传
            hasActiveProgress = true;
            break;
          }
        }
      }

      // 检查是否有活跃的上传状态
      const hasActiveLoading = loadingElements.length > 0 && await Promise.any(
        loadingElements.map(async (element) => {
          try {
            return await element.isVisible();
          } catch (e) {
            return false;
          }
        })
      ).catch(() => false);

      if (!hasActiveProgress && !hasActiveLoading) {
        log('所有上传进度已完成', 'success');
        break;
      }

      await page.waitForTimeout(3000);
      progressCheckCount++;
    }

    if (progressCheckCount >= maxProgressChecks) {
      log('⚠️ 进度条检查超时，继续检查上传结果...', 'warning');
    }

    // 检查上传成功的提示
    const uploadSelectors = [
      '.upload-success:has-text("成功")',
      '.next-message:has-text("上传成功")',
      '.upload-complete:has-text("完成")',
      '[class*="success"]:has-text("上传")',
      'text=上传成功',
      'text=文件上传成功',
      'text=批量上传成功'
    ];

    logVerbose('查找上传完成提示...', uploadSelectors);

    let uploadSuccess = false;

    // 尝试等待多种可能的上传成功提示
    for (const selector of uploadSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        log(`检测到上传成功提示: ${selector}`, 'success');
        uploadSuccess = true;
        break;
      } catch (e) {
        logVerbose(`未找到提示 ${selector}`, e.message);
      }
    }

    // 检查文件是否出现在列表中（重要指标）
    logVerbose('检查文件列表中是否有新文件出现...');
    const fileCheckStartTime = Date.now();
    const maxFileCheckTime = 45000; // 最多等待45秒文件出现

    while (Date.now() - fileCheckStartTime < maxFileCheckTime) {
      // 多种文件选择器
      const fileSelectors = [
        'img[src*="color_"]',
        '.file-item img[src*="color_"]',
        '[class*="file"] img[src*="color_"]',
        '.image-item img[src*="color_"]',
        '.material-item img[src*="color_"]'
      ];

      for (const selector of fileSelectors) {
        try {
          const fileItems = await page.$$(selector);
          logVerbose(`使用选择器 ${selector} 找到 ${fileItems.length} 个color图片`);

          if (fileItems.length > 0) {
            log(`检测到 ${fileItems.length} 个color图片文件出现在列表中`, 'success');
            uploadSuccess = true;

            // 额外验证：检查图片是否已加载
            const loadedImages = await page.evaluate((sel) => {
              const images = document.querySelectorAll(sel);
              return Array.from(images).filter(img => img.complete && img.naturalWidth > 0).length;
            }, selector);

            logVerbose(`其中 ${loadedImages} 个图片已完全加载`);

            if (loadedImages > 0) {
              return true; // 确认上传成功
            }
          }
        } catch (e) {
          logVerbose(`文件选择器 ${selector} 检查失败: ${e.message}`);
        }
      }

      await page.waitForTimeout(3000); // 等待3秒后再次检查
    }

    // 检查页面是否有"暂无图片"消失（表示有内容了）
    const noImageText = await page.$$('text=暂无图片, text=暂无内容, text=暂无数据');
    if (noImageText.length === 0) {
      log('"暂无图片"提示已消失，认为上传成功', 'success');
      uploadSuccess = true;
    }

    // 最后检查：页面是否稳定（没有loading状态）
    const finalLoadingCheck = await page.$$('.next-loading, [class*="loading"], .uploading');
    if (finalLoadingCheck.length === 0 && uploadSuccess) {
      log('页面状态稳定，确认上传完成', 'success');
      return true;
    }

    if (uploadSuccess) {
      log('根据检测到的文件或提示，认为上传成功', 'success');
      return true;
    } else {
      log('⚠️ 未检测到明确的上传成功标志', 'warning');
      return false;
    }

  } catch (error) {
    log(`等待上传完成失败: ${error.message}`, 'error');
    logVerbose('详细错误信息', error);
    return false;
  }
}

/**
 * 主要上传流程
 */
async function uploadImages(productId) {
  log('开始Step5：素材库上传流程', 'step');
  log(`商品ID: ${productId}`);

  let browser;
  let page;

  try {
    // 连接到现有Chrome实例
    log('连接到Chrome (CDP 9222)...');
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const contexts = browser.contexts();

    if (contexts.length === 0) {
      throw new Error('未找到可用的浏览器上下文');
    }

    const context = contexts[0];
    const pages = context.pages();

    if (pages.length === 0) {
      throw new Error('未找到可用的页面');
    }

    // 查找正确的淘宝页面，避免连接到DevTools页面
    page = pages.find(p => {
      const url = p.url();
      return url.includes('taobao.com') || url.includes('myseller.taobao.com');
    });

    if (!page) {
      // 如果没有找到淘宝页面，使用第一个页面并导航到素材库
      page = pages[0];
      logVerbose('未找到淘宝页面，将使用当前页面并导航到素材库');
    }

    log('Chrome连接成功');
    logVerbose('当前页面URL', page.url());

    // 步骤1: 关闭广告弹窗并强制清理搜索面板
    log('步骤1: 关闭广告弹窗并强制清理搜索面板...');
    const adResult = await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true });
    log(`广告处理完成: 关闭了 ${adResult.totalClosed} 个弹窗`, 'success');
    logVerbose('广告处理详情', adResult);

    // 步骤2: 导航到素材库页面
    log('步骤2: 导航到素材库页面...');
    await page.goto('https://myseller.taobao.com/home.htm/material-center/mine-material/sucai-tu');
    await page.waitForTimeout(3000); // 等待页面加载

    // 步骤3: 验证本地文件夹
    log('步骤3: 验证本地图片文件夹...');
    const localData = validateLocalFolder(productId);
    if (!localData) {
      throw new Error(`本地图片文件夹验证失败: ${productId}`);
    }
    log(`本地验证通过: 找到 ${localData.files.length} 个图片文件`, 'success');

    // 步骤4: 检查文件夹是否已存在并创建
    log('步骤4: 检查并创建商品文件夹...');

    // 初始化跳过标志
    let skipFolderCreation = false;

    // 通过面包屑检查是否已经在目标文件夹中
    const breadcrumbSelectors = [
      `text=全部图片/${productId}`,
      `text=/${productId}`
    ];

    let alreadyInFolder = false;
    for (const selector of breadcrumbSelectors) {
      try {
        const breadcrumb = await page.$(selector);
        if (breadcrumb) {
          log(`✅ 已在目标文件夹中: ${productId}`, 'success');
          alreadyInFolder = true;
          skipFolderCreation = true;
          break;
        }
      } catch (e) {
        logVerbose(`面包屑选择器 ${selector} 未找到`);
      }
    }

    // 如果已经在文件夹中，直接跳到上传步骤
    if (alreadyInFolder) {
      log(`📂 已在文件夹 ${productId} 中，直接开始上传...`, 'success');
      skipFolderCreation = true;
    }

    // 如果不在目标文件夹中，创建新文件夹
    if (!skipFolderCreation) {

      // 查找新建文件夹按钮
      const createFolderSelectors = [
      'button:has-text("新建文件夹")',
      'button[title*="新建文件夹"]',
      '.btn-create-folder',
      '[class*="create"]:has-text("文件夹")'
    ];

    let createButton = null;
    for (const selector of createFolderSelectors) {
      try {
        createButton = await page.$(selector);
        if (createButton) {
          logVerbose(`找到新建文件夹按钮: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!createButton) {
      throw new Error('未找到新建文件夹按钮');
    }

    // 处理可能的遮挡元素，使用强制点击
    log('使用强制点击新建文件夹按钮，避免遮挡元素干扰...');
    try {
      await createButton.click({ force: true });
      log('点击了新建文件夹按钮', 'success');
    } catch (clickError) {
      log(`普通点击失败，尝试移除遮挡元素: ${clickError.message}`);

      // 移除遮挡的元素
      await page.evaluate(() => {
        const blockingElements = document.querySelectorAll('.NewTabItemContainer_container__0Mcrw, [class*="NewTabItemContainer"]');
        blockingElements.forEach(element => {
          element.style.pointerEvents = 'none';
          element.style.zIndex = '-1';
        });
      });

      // 再次尝试点击
      await createButton.click({ force: true });
      log('点击了新建文件夹按钮（移除遮挡后）', 'success');
    }

    // 等待弹窗出现
    log('等待新建文件夹弹窗出现...');
    const dialogSelectors = [
      '.next-dialog:has-text("新建文件夹")',
      'div[role="dialog"]',
      '.next-dialog'
    ];

    let dialogElement = null;
    for (const selector of dialogSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        dialogElement = await page.$(selector);
        if (dialogElement) {
          log(`✅ 弹窗已出现: ${selector}`, 'success');
          break;
        }
      } catch (e) {
        logVerbose(`未找到弹窗: ${selector}`);
        continue;
      }
    }

    if (!dialogElement) {
      throw new Error('新建文件夹弹窗未出现');
    }

    // 限定操作在弹窗内，避免输入焦点跑到其他地方
    log('🎯 限定操作范围在弹窗内，避免误操作其他输入框');
    const dialog = page.locator('.next-dialog:has-text("新建文件夹")');

    // 等待弹窗内的输入框可用
    logVerbose('等待弹窗内输入框...');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });

    // 在弹窗内查找输入框 - 使用更具体的选择器
    logVerbose('在弹窗内查找文件夹名称输入框...');

    // 使用更具体的选择器来找到正确的输入框（排除combobox）
    const folderInput = dialog.locator('input[maxlength="20"], input[aria-label*="Large"], input:not([role="combobox"])');

    // 确保输入框可见并可交互
    await folderInput.waitFor({ state: 'visible', timeout: 3000 });
    log('✅ 找到弹窗内文件夹名称输入框，准备输入商品ID', 'success');

    // 验证输入框类型
    const inputType = await folderInput.getAttribute('type');
    const inputPlaceholder = await folderInput.getAttribute('placeholder');
    logVerbose(`输入框类型: ${inputType}, placeholder: ${inputPlaceholder}`);

    // 直接输入文件夹名称（在根目录"全部图片"下创建）
    log('步骤4.1: 输入文件夹名称...');
    await folderInput.click({ force: true });

    // 填入商品ID
    await folderInput.fill(productId);
    log(`✅ 在弹窗内输入文件夹名称: ${productId}`, 'success');
    await page.waitForTimeout(1000);

    // 在弹窗内点击确定按钮 - 限定在dialog范围内
    log('🔘 在弹窗内查找确定按钮，避免误操作其他按钮');

    try {
      // 在弹窗内查找确定按钮
      const confirmButton = dialog.locator('button:has-text("确定")');

      // 等待确定按钮可用
      await confirmButton.waitFor({ state: 'visible', timeout: 3000 });
      log('✅ 在弹窗内找到确定按钮', 'success');

      // 点击确定按钮
      log('🎯 点击弹窗内确定按钮...');
      await confirmButton.click();
      log('✅ 已点击弹窗内确定按钮', 'success');

    } catch (buttonError) {
      log(`弹窗内确定按钮点击失败: ${buttonError.message}，尝试备用方案`);

      // 备用方案：在弹窗内的输入框按回车
      log('🔄 备用方案：在弹窗内输入框按回车确认...');
      await folderInput.press('Enter');
      log('✅ 已在弹窗内按回车确认', 'success');
    }

    // 等待弹窗消失 - 使用同一个dialog locator
    log('⏳ 等待弹窗消失...');
    try {
      // 等待dialog消失
      await dialog.waitFor({ state: 'hidden', timeout: 5000 });
      log('✅ 弹窗已隐藏', 'success');
    } catch (e) {
      try {
        // 如果隐藏失败，尝试等待完全消失
        await dialog.waitFor({ state: 'detached', timeout: 3000 });
        log('✅ 弹窗已完全消失', 'success');
      } catch (e2) {
        // 如果都失败，尝试按ESC键强制关闭
        log('⚠️ 弹窗未自动消失，尝试按ESC键强制关闭...');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        log('✅ 已强制关闭弹窗', 'success');
      }
    }

    // 确保弹窗完全关闭并等待文件夹创建
    await page.waitForTimeout(3000);
    log('✅ 文件夹创建完成', 'success');

    // 步骤4.2: 验证文件夹创建并进入
    log('步骤4.2: 验证文件夹创建并进入...');

    // 等待页面响应
    await page.waitForTimeout(3000);

    // 检查是否有错误提示
    const errorSelectors = [
      'text=文件夹已存在',
      'text=名称重复',
      '.error-message',
      '.next-feedback:has-text("错误")'
    ];

    let hasError = false;
    for (const selector of errorSelectors) {
      try {
        const errorMsg = await page.$(selector);
        if (errorMsg && await errorMsg.isVisible()) {
          log(`⚠️ 文件夹可能已存在: ${selector}`, 'warning');
          hasError = true;
          // 关闭错误提示
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
          break;
        }
      } catch (e) {
        // 继续
      }
    }

    if (!hasError) {
      log('✅ 文件夹创建成功', 'success');
    } else {
      // 文件夹已存在，需要先进入并清空旧图片
      log('📂 文件夹已存在，将清空旧图片后重新上传...');
    }

    // 🔴 关键步骤：双击进入新创建的文件夹
    log('步骤4.3: 双击进入新创建的文件夹...');

    // 查找新创建的文件夹
    const newFolderSelectors = [
      `div:has-text("${productId}")`,
      `.folder-item:has-text("${productId}")`,
      `[title="${productId}"]`,
      `text=${productId}`
    ];

    let folderElement = null;
    for (const selector of newFolderSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const el of elements) {
          const text = await el.textContent();
          if (text && text.trim() === productId) {
            folderElement = el;
            log(`✅ 找到文件夹元素: ${selector}`, 'success');
            break;
          }
        }
        if (folderElement) break;
      } catch (e) {
        logVerbose(`选择器 ${selector} 查找失败`);
      }
    }

    if (folderElement) {
      // 双击进入文件夹
      await folderElement.dblclick();
      log('✅ 已双击进入文件夹', 'success');
      await page.waitForTimeout(3000);

      // 验证是否进入（通过面包屑）
      const breadcrumbCheck = await page.$(`text=全部图片/${productId}`);
      if (breadcrumbCheck) {
        log(`✅ 成功进入文件夹: ${productId}`, 'success');
      } else {
        log('⚠️ 未确认进入文件夹，但继续上传', 'warning');
      }

      // 如果文件夹已存在，清空旧图片
      if (hasError) {
        log('🗑️ 开始清空文件夹内的旧图片...');
        try {
          // 等待图片列表加载
          await page.waitForTimeout(2000);

          // 查找全选复选框
          const selectAllSelectors = [
            'input[type="checkbox"][aria-label*="全选"]',
            '.select-all-checkbox',
            'th input[type="checkbox"]',
            '.next-table-header input[type="checkbox"]'
          ];

          let selectAllCheckbox = null;
          for (const selector of selectAllSelectors) {
            try {
              selectAllCheckbox = await page.$(selector);
              if (selectAllCheckbox) {
                logVerbose(`找到全选复选框: ${selector}`);
                break;
              }
            } catch (e) {
              continue;
            }
          }

          if (selectAllCheckbox) {
            // 点击全选
            await selectAllCheckbox.click();
            log('✅ 已全选所有图片');
            await page.waitForTimeout(1000);

            // 查找删除按钮
            const deleteButtonSelectors = [
              'button:has-text("删除")',
              'button:has-text("批量删除")',
              '[class*="delete"]:has-text("删除")'
            ];

            let deleteButton = null;
            for (const selector of deleteButtonSelectors) {
              try {
                deleteButton = await page.$(selector);
                if (deleteButton && await deleteButton.isVisible()) {
                  logVerbose(`找到删除按钮: ${selector}`);
                  break;
                }
              } catch (e) {
                continue;
              }
            }

            if (deleteButton) {
              await deleteButton.click();
              log('✅ 已点击删除按钮');
              await page.waitForTimeout(1000);

              // 确认删除对话框
              const confirmButton = await page.$('button:has-text("确定"), button:has-text("确认")');
              if (confirmButton) {
                await confirmButton.click();
                log('✅ 已确认删除');
                await page.waitForTimeout(3000);
              }

              log('✅ 旧图片清空完成', 'success');
            } else {
              log('⚠️ 未找到删除按钮，可能文件夹为空', 'warning');
            }
          } else {
            log('⚠️ 未找到全选复选框，可能文件夹为空', 'warning');
          }
        } catch (clearError) {
          log(`⚠️ 清空旧图片失败: ${clearError.message}，继续上传新图片`, 'warning');
        }
      }
    } else {
      log('⚠️ 未找到新创建的文件夹元素，但继续上传', 'warning');
    }
    }  // 结束 if (!skipFolderCreation) 块

    // 步骤5: 点击上传文件按钮
    log('步骤5: 点击上传文件按钮...');

    // 在上传文件前清理所有弹窗和干扰层
    logVerbose('上传文件前清理弹窗...');
    await closeMaterialCenterPopups(page);

    const uploadButtonSelectors = [
      'button:has-text("上传文件")',
      'button:has-text("批量导入")',
      '.upload-button',
      '[class*="upload"]'
    ];

    let uploadButton = null;
    for (const selector of uploadButtonSelectors) {
      try {
        uploadButton = await page.$(selector);
        if (uploadButton) {
          logVerbose(`找到上传按钮: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!uploadButton) {
      throw new Error('未找到上传文件按钮');
    }

    // 🔧 修复：设置 filechooser 事件监听器，直接选择本地文件
    // 当点击上传按钮时，如果触发了 <input type="file">，会弹出系统文件选择器（Finder）
    // 使用监听器来直接设置文件，避免 Finder 一直挂在前面
    const filePaths = localData.files.map(file => path.join(localData.localFolder, file));
    log(`📁 准备上传 ${filePaths.length} 个本地文件`);

    const fileChooserHandler = async (fileChooser) => {
      log('📂 检测到文件选择器，直接选择本地文件...', 'info');
      // 直接设置本地文件列表（而不是取消）
      await fileChooser.setFiles(filePaths);
      log(`✅ 已通过 filechooser 选择 ${filePaths.length} 个文件`, 'success');
    };
    page.once('filechooser', fileChooserHandler);

    await uploadButton.click();
    log('点击了上传文件按钮', 'success');
    await page.waitForTimeout(2000);

    // 移除监听器（如果没有触发）
    page.removeListener('filechooser', fileChooserHandler);

    // 如果有"批量导入文件"选项，点击它
    try {
      const batchUploadSelector = 'button:has-text("批量导入"), button:has-text("批量上传")';
      const batchButton = await page.$(batchUploadSelector);
      if (batchButton) {
        await batchButton.click();
        log('点击了批量导入按钮', 'success');
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      logVerbose('未找到批量导入按钮，继续标准上传流程...');
    }

    // 步骤6: 处理文件上传对话框
    log('步骤6: 处理文件上传对话框...');

    const uploadSuccess = await handleFileUploadDialog(page, productId, localData.localFolder, localData.files);
    if (!uploadSuccess) {
      throw new Error('文件上传对话框处理失败');
    }

    // 步骤7: 等待上传完成
    log('步骤7: 等待上传完成...');
    const isUploadComplete = await waitForUploadComplete(page);

    if (isUploadComplete) {
      log(`🎉 Step5完成！成功上传 ${localData.files.length} 个图片文件到商品 ${productId} 的文件夹`, 'success');

      // 🔴 关键步骤：直接通过 ESC 关闭上传对话框，避免误触顶栏
      log('📝 发送 ESC 关闭上传对话框...');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
      log('✅ 已通过 ESC 关闭上传对话框，如无响应会立即清理广告遮罩', 'success');
      await forceCloseUploadOverlay(page);
      await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true });

      // 🔴 关键步骤：关闭上传结果浮窗
      log('步骤8: 强制关闭所有上传相关弹窗...');
      await page.waitForTimeout(1000); // 短暂等待浮窗出现

      // 多次尝试关闭所有可能的弹窗
      for (let attempt = 0; attempt < 2; attempt++) {
        logVerbose(`第 ${attempt + 1} 次尝试关闭弹窗...`);

        // 查找所有可能的关闭按钮
        const uploadResultSelectors = [
          'button:has-text("完成")',
          'button:has-text("取消")',
          'button:has-text("关闭")',
          '.next-dialog button:has-text("完成")',
          '.next-dialog button:has-text("取消")',
          '[role="dialog"] button:has-text("完成")',
          '[role="dialog"] button:has-text("取消")'
        ];

        let clickedAny = false;
        for (const selector of uploadResultSelectors) {
          try {
            const buttons = await page.$$(selector);
            for (const btn of buttons) {
              if (await btn.isVisible().catch(() => false)) {
                await btn.click();
                log(`✅ 已关闭上传结果弹窗: ${selector}`, 'success');
                clickedAny = true;
                await page.waitForTimeout(1000);
              }
            }
          } catch (e) {
            // 继续
          }
        }

        if (!clickedAny) {
          logVerbose('未找到可见的弹窗按钮');
        }

        await page.waitForTimeout(500);
      }

      // 强制按ESC键关闭任何残留弹窗
      log('按ESC键确保关闭所有弹窗...');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // 🔴 关键步骤：清理搜索面板
      log('步骤9: 强制清理搜索面板和遮罩层...');
      await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true });
      await forceRemoveSearchPanel(page, '上传完成后的二次清理');
      await page.waitForTimeout(2000);

      // 验证是否清理成功
      const searchPanelCheck = await page.evaluate(() => {
        const panels = document.querySelectorAll('.qnworkbench_search_panel, #qnworkbench_search_panel');
        return panels.length;
      });

      if (searchPanelCheck === 0) {
        log('✅ 搜索面板已彻底清理', 'success');
      } else {
        log(`⚠️ 仍有 ${searchPanelCheck} 个搜索面板元素`, 'warning');
      }

      // 确认所有对话框都已关闭
      const anyDialogRemaining = await page.$$('.next-dialog, [role="dialog"]');
      if (anyDialogRemaining.length > 0) {
        log(`⚠️ 仍有 ${anyDialogRemaining.length} 个对话框，强制关闭...`, 'warning');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      } else {
        log('✅ 确认所有对话框已关闭', 'success');
      }

      // 🔴 关键步骤：刷新页面并验证文件
      log('步骤10: 刷新页面并验证文件位置...');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      // 清理刷新后可能出现的弹窗
      await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true });
      await page.waitForTimeout(2000);

      // 上传完成后直接返回成功，省去耗时的目录验证和截图
      log('🚀 上传任务完成，跳过目录验证以提升速度', 'success');
      return {
        success: true,
        productId,
        uploadedFiles: localData.files.length,
        message: `成功上传 ${localData.files.length} 个文件`
      };
    } else {
      throw new Error('上传超时或失败');
    }

  } catch (error) {
    log(`Step5上传流程失败: ${error.message}`, 'error');
    logVerbose('详细错误信息', error);

    // 保存错误截图
    if (page) {
      try {
        await Promise.race([
          page.screenshot({
            path: `step5-upload-error-${productId}.png`,
            fullPage: false,
            type: 'png'
          }),
          new Promise(resolve => setTimeout(resolve, 5000)) // 5秒超时
        ]);
        log(`错误截图已保存: step5-upload-error-${productId}.png`, 'warning');
      } catch (e) {
        logVerbose('保存错误截图失败', e);
      }
    }

    return {
      success: false,
      productId,
      error: error.message,
      message: `上传失败: ${error.message}`
    };

  } finally {
    // 保持Chrome实例运行，不关闭browser
    log('保持Chrome实例运行，供后续流程复用');
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 Step5: 素材库上传 - 开始执行');
  console.log('=' .repeat(50));

  try {
    const { productId } = parseArgs();
    console.log(`📦 商品ID: ${productId}`);
    console.log(`📁 详细模式: ${VERBOSE ? '开启' : '关闭'}`);
    console.log('=' .repeat(50));

    const result = await uploadImages(productId);

    console.log('=' .repeat(50));
    if (result.success) {
      console.log(`🎉 Step5执行成功！`);
      console.log(`📊 上传文件数: ${result.uploadedFiles}`);
      console.log(`💾 商品ID: ${result.productId}`);
    } else {
      console.log(`❌ Step5执行失败！`);
      console.log(`🚫 错误信息: ${result.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.log('=' .repeat(50));
    console.log(`💥 Step5发生严重错误: ${error.message}`);
    if (VERBOSE) {
      console.log('详细错误信息:', error);
    }
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { uploadImages };
