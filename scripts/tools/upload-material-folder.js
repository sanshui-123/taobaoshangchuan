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

    log(`已选择 ${filePaths.length} 个文件进行上传`, 'success');

    return true;

  } catch (error) {
    log(`文件上传对话框处理失败: ${error.message}`, 'error');
    logVerbose('详细错误信息', error);
    return false;
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

    // 步骤4: 点击2026文件夹
    log('步骤4: 点击左侧2026文件夹...');

    // 在点击2026文件夹前，先清理所有弹窗和干扰层
    logVerbose('点击2026文件夹前清理弹窗...');
    await closeMaterialCenterPopups(page);

    // 等待页面加载完成，查找2026文件夹（使用正确的选择器）
    const year2026Selectors = [
      'li.next-tree-node:has-text("2026")',
      '.next-tree-node-label:has-text("2026")',
      'text=2026'
    ];

    let clickSuccess = false;
    for (const selector of year2026Selectors) {
      try {
        logVerbose(`尝试选择器: ${selector}`);
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        log('成功点击2026文件夹', 'success');
        await page.waitForTimeout(2000); // 等待文件夹加载
        clickSuccess = true;
        break;
      } catch (error) {
        logVerbose(`选择器 ${selector} 失败: ${error.message}`);
        continue;
      }
    }

    if (!clickSuccess) {
      throw new Error('无法找到或点击2026文件夹');
    }

    // 步骤5: 创建新文件夹
    log('步骤5: 创建新商品文件夹...');

    // 在创建文件夹前清理所有弹窗和干扰层
    logVerbose('创建文件夹前清理弹窗...');
    await closeMaterialCenterPopups(page);

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

    // 强制点击输入框以确保焦点正确
    log('📍 强制点击弹窗内文件夹名称输入框，确保焦点正确...');
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

    // 步骤5.5: 确认新文件夹出现在左侧列表中
    log('步骤5.5: 等待新文件夹出现在左侧列表...');

    const folderAppearSelectors = [
      `[title="${productId}"]`,
      `.material-folder-item:has-text("${productId}")`,
      `.next-tree-node:has-text("${productId}")`,
      `text=${productId}`,
      `li:has-text("${productId}")`,
      `.tree-node:has-text("${productId}")`,
      `[class*="folder"]:has-text("${productId}")`
    ];

    let folderAppearSuccess = false;
    let foundFolderSelector = null;

    // 增加等待时间和重试逻辑
    for (const selector of folderAppearSelectors) {
      try {
        logVerbose(`等待文件夹出现: ${selector}`);

        // 尝试多次检查，每次等待3秒，总共15秒
        let found = false;
        for (let i = 0; i < 5; i++) {
          try {
            const element = await page.$(selector);
            if (element && await element.isVisible()) {
              found = true;
              break;
            }
          } catch (e) {
            // 继续下一次尝试
          }

          if (!found && i < 4) {
            await page.waitForTimeout(3000);
          }
        }

        if (found) {
          foundFolderSelector = selector;
          folderAppearSuccess = true;
          log(`✅ 找到新文件夹: ${selector}`, 'success');

          // 截图确认文件夹在左侧树中可见
          logVerbose('截图保存文件夹创建证据...');
          try {
            await Promise.race([
              page.screenshot({
                path: `step5-folder-created-${productId}.png`,
                fullPage: false,
                type: 'png'
              }),
              new Promise(resolve => setTimeout(resolve, 10000)) // 10秒超时
            ]);
            log(`📸 已保存文件夹创建截图: step5-folder-created-${productId}.png`);
          } catch (e) {
            log('⚠️ 截图保存失败，但继续执行', 'warning');
            logVerbose('截图失败详情', e);
          }

          break;
        }
      } catch (error) {
        logVerbose(`等待文件夹 ${selector} 超时: ${error.message}`);
        continue;
      }
    }

    if (!folderAppearSuccess) {
      throw new Error(`新文件夹未在10秒内出现在列表中: ${productId}`);
    }

    // 步骤6: 进入新创建的文件夹
    log('步骤6: 进入新创建的文件夹...');

    let enterSuccess = false;

    // 使用找到的选择器进行点击
    if (foundFolderSelector) {
      try {
        logVerbose(`使用选择器进入文件夹: ${foundFolderSelector}`);

        // 强制关闭任何可能的对话框或遮罩层
        logVerbose('强制关闭所有对话框和遮罩层...');
        await page.evaluate(() => {
          // 关闭所有遮罩层
          const overlays = document.querySelectorAll('.next-overlay-wrapper.opened, .next-dialog, .modal');
          overlays.forEach(overlay => {
            overlay.style.display = 'none';
            overlay.remove();
          });

          // 关闭所有对话框
          const dialogs = document.querySelectorAll('[role="dialog"], .next-dialog-body');
          dialogs.forEach(dialog => {
            dialog.style.display = 'none';
            dialog.remove();
          });
        });

        await page.waitForTimeout(1000);

        // 更精确的文件夹定位策略
        logVerbose('开始精确定位文件夹...');

        // 先清理所有可能的弹窗干扰
        await closeMaterialCenterPopups(page);
        await page.waitForTimeout(1000);

        // 使用更具体的选择器，确保点击的是文件夹节点而不是广告
        const preciseFolderSelectors = [
          `li.next-tree-node[title="${productId}"] .next-tree-node-content`,
          `li.next-tree-node:has-text("${productId}") .next-tree-node-content`,
          `[title="${productId}"] .next-tree-node-title`,
          `li.next-tree-node:has-text("${productId}"):not(.ad):not(.popup)`
        ];

        let folderElement = null;
        let usedSelector = null;

        for (const selector of preciseFolderSelectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              folderElement = element;
              usedSelector = selector;
              logVerbose(`✅ 找到精确文件夹元素: ${selector}`);
              break;
            }
          } catch (e) {
            logVerbose(`选择器失败: ${selector}`, e);
            continue;
          }
        }

        if (!folderElement) {
          throw new Error(`无法精确获取文件夹元素: ${productId}`);
        }

        // 滚动到可见位置
        logVerbose('滚动文件夹到可见位置...');
        await folderElement.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);

        // 再次清理广告弹窗，确保点击不受干扰
        logVerbose('点击前再次清理弹窗...');
        await closeMaterialCenterPopups(page);

        // 等待并确保没有遮罩层
        await page.waitForTimeout(1000);

        // 使用真正的双击方法进入文件夹
        logVerbose(`使用选择器进行双击操作: ${usedSelector}`);

        // 确保文件夹可见并获得焦点
        logVerbose('确保文件夹可见并获取焦点...');
        await folderElement.scrollIntoViewIfNeeded();
        await folderElement.hover(); // 鼠标悬停
        await page.waitForTimeout(1000);

        // 第一次单击：选中文件夹
        logVerbose('第一次单击：选中文件夹...');
        await folderElement.click({ force: true });
        await page.waitForTimeout(500);

        // 真正的双击：进入文件夹
        logVerbose('执行真正的双击进入文件夹...');
        await folderElement.dblclick({ force: true });
        await page.waitForTimeout(1000);

        // 等待页面响应和加载
        await page.waitForTimeout(4000);

        // 验证是否成功进入文件夹
        logVerbose('验证是否进入文件夹...');

        // 更精确的文件夹进入验证机制
        logVerbose('开始精确验证是否进入文件夹...');

        // 方法1：检查面包屑导航是否显示当前文件夹
        let successConfirmed = false;
        let breadcrumbFound = false;

        try {
          const breadcrumbSelectors = [
            `text=全部图片/2026/${productId}`,
            `text=*/${productId}`,
            `text=${productId}`,
            '.breadcrumb:has-text("' + productId + '")'
          ];

          for (const breadcrumb of breadcrumbSelectors) {
            try {
              await page.waitForSelector(breadcrumb, { timeout: 2000 });
              breadcrumbFound = true;
              logVerbose(`✅ 找到面包屑导航: ${breadcrumb}`);
              break;
            } catch (e) {
              continue;
            }
          }

          // 方法2：检查URL是否包含文件夹路径
          const currentUrl = page.url();
          if (currentUrl.includes(productId) ||
              (currentUrl.includes('sucai-tu') && breadcrumbFound)) {
            successConfirmed = true;
            logVerbose(`✅ URL验证通过: ${currentUrl}`);
          }

          // 方法3：检查文件夹标题或当前路径指示器
          if (!successConfirmed) {
            const pathIndicators = [
              `text=${productId}`,
              '.folder-name:has-text("' + productId + '")',
              '[class*="current"]:has-text("' + productId + '")'
            ];

            for (const indicator of pathIndicators) {
              try {
                const element = await page.$(indicator);
                if (element && await element.isVisible()) {
                  successConfirmed = true;
                  logVerbose(`✅ 找到路径指示器: ${indicator}`);
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }

          // 方法4：检查是否真的在文件夹内（而不是根目录）
          if (!successConfirmed) {
            // 确保不在根目录 - 检查根目录的特有元素是否存在
            const isRootFolder = await page.$('text=全部图片, text=2026, li.next-tree-node:has-text("2026").expanded');

            // 如果找到了根目录的2026文件夹，且它处于展开状态，说明还在根目录
            if (isRootFolder) {
              logVerbose('⚠️ 检测到仍在根目录，未成功进入文件夹');
              successConfirmed = false;
            } else {
              // 检查是否有上传按钮（文件夹内有上传按钮）
              const uploadButton = await page.$('button:has-text("上传文件")');
              if (uploadButton) {
                successConfirmed = true;
                logVerbose('✅ 检测到上传按钮，确认在文件夹内');
              }
            }
          }

        } catch (error) {
          logVerbose('验证过程中出现错误:', error);
        }

        if (successConfirmed) {
          enterSuccess = true;
          log(`🎉 成功进入文件夹: ${productId}`, 'success');
          logVerbose('当前页面URL', page.url());

          // 保存进入文件夹的截图，确认"暂无图片"
          try {
            // 使用较短的超时时间，避免卡住
            await Promise.race([
              page.screenshot({
                path: `step5-folder-empty-${productId}.png`,
                fullPage: false,
                type: 'png'
              }),
              new Promise(resolve => setTimeout(resolve, 10000)) // 10秒超时
            ]);
            log(`📸 已保存空文件夹截图: step5-folder-empty-${productId}.png`);
          } catch (e) {
            log(`⚠️ 截图保存失败，但继续执行: ${e.message}`, 'warning');
          }
        } else {
          log('⚠️ 点击完成但未确认进入文件夹', 'warning');
        }

      } catch (error) {
        log(`进入文件夹失败: ${error.message}`, 'error');
        logVerbose('详细错误信息', error);
      }
    }

    if (!enterSuccess) {
      throw new Error(`无法进入商品文件夹: ${productId}`);
    }

    // 步骤7: 检查"暂无图片"提示
    log('步骤7: 检查是否进入正确位置...');

    try {
      const noImageText = await page.$('text=暂无图片, text=暂无内容, text=暂无数据');
      if (noImageText) {
        log('确认进入正确位置: 显示"暂无图片"', 'success');
      } else {
        log('文件夹中已有内容，继续上传流程', 'warning');
      }
    } catch (e) {
      logVerbose('未找到"暂无图片"提示，继续执行...');
    }

    // 步骤8: 点击上传文件按钮
    log('步骤8: 点击上传文件按钮...');

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

    await uploadButton.click();
    log('点击了上传文件按钮', 'success');
    await page.waitForTimeout(2000);

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

    // 步骤9: 处理文件上传对话框
    log('步骤9: 处理文件上传对话框...');

    const uploadSuccess = await handleFileUploadDialog(page, productId, localData.localFolder, localData.files);
    if (!uploadSuccess) {
      throw new Error('文件上传对话框处理失败');
    }

    // 步骤10: 等待上传完成
    log('步骤10: 等待上传完成...');
    const isUploadComplete = await waitForUploadComplete(page);

    if (isUploadComplete) {
      log(`🎉 Step5完成！成功上传 ${localData.files.length} 个图片文件到商品 ${productId} 的文件夹`, 'success');

      // 保存上传完成截图
      try {
        await Promise.race([
          page.screenshot({
            path: `step5-upload-finished-${productId}.png`,
            fullPage: false,
            type: 'png'
          }),
          new Promise(resolve => setTimeout(resolve, 10000)) // 10秒超时
        ]);
        log(`📸 已保存上传完成截图: step5-upload-finished-${productId}.png`);
      } catch (e) {
        log('⚠️ 上传完成截图保存失败', 'warning');
        logVerbose('截图失败详情', e);
      }

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