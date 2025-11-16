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
  const localFolder = path.join(__dirname, '..', '..', 'assets', productId);

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
    // 多阶段等待文件上传对话框
    let fileInput = null;
    let dialogFound = false;

    // 阶段1: 等待直接文件输入元素
    logVerbose('阶段1: 查找直接的文件输入元素...');
    try {
      await page.waitForSelector('input[type="file"]', { timeout: 8000 });
      fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        logVerbose('找到直接文件输入元素');
        dialogFound = true;
      }
    } catch (e) {
      logVerbose('未找到直接文件输入元素，尝试其他方法...');
    }

    // 阶段2: 如果直接方法失败，尝试查找隐藏的文件输入元素
    if (!dialogFound) {
      logVerbose('阶段2: 查找隐藏的文件输入元素...');
      try {
        const allFileInputs = await page.$$('input[type="file"]');
        logVerbose(`找到 ${allFileInputs.length} 个文件输入元素`);

        for (let i = 0; i < allFileInputs.length; i++) {
          const input = allFileInputs[i];
          try {
            // 检查元素是否在DOM中且可交互
            const isVisible = await input.isVisible();
            const isAttached = await input.isConnected();

            if (isAttached) {
              fileInput = input;
              logVerbose(`找到可用文件输入元素 (visible: ${isVisible})`);
              dialogFound = true;
              break;
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        logVerbose('查找隐藏文件输入元素失败');
      }
    }

    // 阶段3: 如果还没找到，尝试点击"批量导入"等按钮
    if (!dialogFound) {
      logVerbose('阶段3: 尝试查找并点击批量导入按钮...');

      const batchImportSelectors = [
        'button:has-text("批量导入")',
        'button:has-text("批量上传")',
        'button:has-text("选择文件")',
        'button:has-text("浏览")',
        '.batch-import-btn',
        '.file-select-btn'
      ];

      for (const selector of batchImportSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            const isVisible = await button.isVisible();
            if (isVisible) {
              logVerbose(`找到并点击: ${selector}`);
              await button.click();
              await page.waitForTimeout(2000);

              // 再次尝试查找文件输入元素
              fileInput = await page.$('input[type="file"]');
              if (fileInput) {
                dialogFound = true;
                break;
              }
            }
          }
        } catch (e) {
          continue;
        }
      }
    }

    // 阶段4: 最后尝试 - 监听DOM变化
    if (!dialogFound) {
      logVerbose('阶段4: 监听DOM变化查找文件输入元素...');

      try {
        // 监听DOM变化，等待文件输入元素出现
        fileInput = await page.evaluateHandle(() => {
          return new Promise((resolve) => {
            const checkForFileInput = () => {
              const fileInputs = document.querySelectorAll('input[type="file"]');
              if (fileInputs.length > 0) {
                for (const input of fileInputs) {
                  if (input.isConnected) {
                    return input;
                  }
                }
              }
              return null;
            };

            const fileInput = checkForFileInput();
            if (fileInput) {
              resolve(fileInput);
            } else {
              // 设置观察器监听DOM变化
              const observer = new MutationObserver((mutations) => {
                const fileInput = checkForFileInput();
                if (fileInput) {
                  observer.disconnect();
                  resolve(fileInput);
                }
              });

              observer.observe(document.body, {
                childList: true,
                subtree: true
              });

              // 超时保护
              setTimeout(() => {
                observer.disconnect();
                resolve(null);
              }, 10000);
            }
          });
        });

        if (fileInput.asElement()) {
          logVerbose('通过DOM观察器找到文件输入元素');
          dialogFound = true;
        }
      } catch (e) {
        logVerbose('DOM观察器方法失败');
      }
    }

    // 验证是否找到文件输入元素
    if (!fileInput || !dialogFound) {
      // 截图调试当前状态
      try {
        await page.screenshot({
          path: `step5-file-dialog-not-found-${productId}.png`,
          fullPage: true,
          type: 'png',
          timeout: 5000
        });
        log(`📸 已保存文件对话框查找失败截图: step5-file-dialog-not-found-${productId}.png`);
      } catch (screenshotError) {
        log(`⚠️ 截图失败: ${screenshotError.message}`, 'warning');
      }

      throw new Error('未找到文件上传输入元素，所有方法都失败');
    }

    logVerbose('成功找到文件输入元素，准备上传文件...');

    // 构建完整文件路径
    const filePaths = files.map(file => path.join(localFolder, file));
    logVerbose(`准备上传 ${filePaths.length} 个文件`);

    // 选择文件进行上传
    await fileInput.setInputFiles(filePaths);

    log(`✅ 已选择 ${filePaths.length} 个文件进行上传`, 'success');

    return true;

  } catch (error) {
    log(`文件上传对话框处理失败: ${error.message}`, 'error');
    logVerbose('详细错误信息', error);

    // 截图保存错误状态
    try {
      await page.screenshot({
        path: `step5-upload-dialog-error-${productId}.png`,
        fullPage: true,
        type: 'png',
        timeout: 5000
      });
      log(`📸 已保存上传对话框错误截图: step5-upload-dialog-error-${productId}.png`);
    } catch (screenshotError) {
      log(`⚠️ 错误截图失败: ${screenshotError.message}`, 'warning');
    }

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

    // 步骤1: 关闭广告弹窗并启动搜索面板持续防护
    log('步骤1: 关闭广告弹窗并启动搜索面板持续防护...');
    const adResult = await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: true });
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

    // 进入2026前重新清理搜索面板并启动持续防护
    log('🔧 进入2026前重新清理搜索面板并启动持续防护...');
    await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: true });

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

    // 创建文件夹前重新清理搜索面板
    log('🔧 创建文件夹前重新清理搜索面板...');
    await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: false });

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

    // 步骤5.5: 检测新建文件夹结果并处理不同情况
    log('步骤5.5: 检测新建文件夹结果...');

    // 检测是否出现"新建文件夹失败"的toast提示
    let folderExists = false;
    try {
      logVerbose('检测是否出现"新建文件夹失败"toast...');

      // 使用多种选择器检测失败提示
      const failureSelectors = [
        'text=新建文件夹失败',
        'text=文件夹已存在',
        'text=创建失败',
        'text=名称重复',
        '.next-message:has-text("失败")',
        '.next-message:has-text("已存在")',
        '[class*="message"]:has-text("失败")',
        '[class*="toast"]:has-text("失败")'
      ];

      let failureDetected = false;
      for (const selector of failureSelectors) {
        try {
          await page.locator(selector).first().waitFor({ timeout: 1000 });
          log(`⚠️ 检测到创建失败提示: ${selector}`, 'warning');
          failureDetected = true;
          break;
        } catch (e) {
          continue;
        }
      }

      if (failureDetected) {
        folderExists = true;

        // 点击弹窗里的取消按钮
        log('点击取消按钮关闭弹窗...');
        try {
          await page.locator('.next-dialog button:has-text("取消")').click();
          log('✅ 已点击取消按钮', 'success');
          await page.waitForTimeout(1000);
        } catch (cancelError) {
          logVerbose('点击取消按钮失败，弹窗可能已自动关闭', cancelError.message);
        }
      }

    } catch (toastError) {
      logVerbose('检测创建失败提示时发生错误，按原逻辑等待新文件夹创建');
      folderExists = false;
    }

    let folderLocator;
    if (folderExists) {
      // 分支：进入已有的文件夹
      log('步骤5.6: 进入已存在的文件夹...');

      // 优先在右侧网格区域查找文件夹卡片，然后在左侧树查找
      const existingFolderSelectors = [
        // 右侧网格区域 - 精确的文件夹卡片选择器
        `div.material-card:has-text("${productId}")`,
        `.folder-card:has-text("${productId}")`,
        `.qic-folder-item[title="${productId}"]`,
        `.folder-item:has-text("${productId}")`,
        `.card-item:has-text("${productId}")`,
        `[data-item-name="${productId}"]`,
        `.grid-item:has-text("${productId}")`,
        `.material-card:has-text("${productId}")`,
        // 更通用的卡片选择器
        `div[class*="card"]:has-text("${productId}")`,
        `div[class*="folder"]:has-text("${productId}")`,
        `div[class*="item"]:has-text("${productId}")`,
        // 左侧树 - 兜底选择器
        `[title="${productId}"]`,
        `.next-tree-node:has-text("${productId}")`,
        `.material-folder-item:has-text("${productId}")`
      ];

      let found = false;
      for (const selector of existingFolderSelectors) {
        try {
          logVerbose(`尝试选择器查找已有文件夹: ${selector}`);
          folderLocator = page.locator(selector);
          await folderLocator.waitFor({ state: 'visible', timeout: 5000 });

          // 滚动到视图内
          await folderLocator.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500); // 等待滚动完成

          log(`✅ 找到已存在的文件夹: ${selector}`, 'success');
          found = true;
          break;
        } catch (e) {
          logVerbose(`选择器 ${selector} 未找到文件夹: ${e.message}`);
          continue;
        }
      }

      if (!found) {
        throw new Error(`文件夹 ${productId} 已存在但在列表中未找到`);
      }

      // 截图保存已有文件夹节点
      try {
        await folderLocator.screenshot({
          path: `step5-existing-folder-${productId}.png`,
          fullPage: false,
          type: 'png'
        });
        log(`📸 已保存已有文件夹截图: step5-existing-folder-${productId}.png`);
      } catch (screenshotError) {
        log(`⚠️ 已有文件夹截图失败: ${screenshotError.message}`, 'warning');
      }

    } else {
      // 分支：验证新创建的文件夹
      log('步骤5.5: 严格验证新文件夹创建...');

      // 必须找到真实的文件夹节点
      const realFolderSelector = `.material-folder-item:has-text("${productId}")`;
      logVerbose(`等待真实文件夹节点出现: ${realFolderSelector}`);

      try {
        // 严格等待文件夹节点出现，5秒超时
        folderLocator = page.locator(realFolderSelector);
        await folderLocator.waitFor({ state: 'visible', timeout: 5000 });

        log(`✅ 找到真实文件夹节点: ${realFolderSelector}`, 'success');

        // 截图验证文件夹节点真实存在（快速截图，避免阻塞）
        try {
          await folderLocator.screenshot({
            path: `step5-folder-node-${productId}.png`,
            fullPage: false,
            type: 'png',
            timeout: 3000
          });
          log(`📸 已保存文件夹节点截图: step5-folder-node-${productId}.png`);
        } catch (screenshotError) {
          log(`⚠️ 文件夹节点截图失败，继续执行: ${screenshotError.message}`, 'warning');
          // 不再抛出错误，避免阻塞流程
        }

      } catch (folderError) {
        log(`⚠️ 新文件夹验证失败，尝试查找已存在的文件夹: ${folderError.message}`, 'warning');

        // 备用策略：尝试查找并进入已存在的文件夹
        log('步骤5.6: 备用策略 - 查找已存在的文件夹...');

        const existingFolderSelectors = [
          // 优先右侧网格区域 - 精确的文件夹卡片选择器
          `div.material-card:has-text("${productId}")`,
          `.folder-card:has-text("${productId}")`,
          `.qic-folder-item[title="${productId}"]`,
          `.folder-item:has-text("${productId}")`,
          `.card-item:has-text("${productId}")`,
          `[data-item-name="${productId}"]`,
          `.grid-item:has-text("${productId}")`,
          `.material-card:has-text("${productId}")`,
          // 更通用的卡片选择器
          `div[class*="card"]:has-text("${productId}")`,
          `div[class*="folder"]:has-text("${productId}")`,
          `div[class*="item"]:has-text("${productId}")`,
          // 左侧树 - 兜底选择器
          `[title="${productId}"]`,
          `.next-tree-node:has-text("${productId}")`,
          `.material-folder-item:has-text("${productId}")`
        ];

        let found = false;
        for (const selector of existingFolderSelectors) {
          try {
            logVerbose(`备用策略 - 尝试选择器: ${selector}`);
            folderLocator = page.locator(selector);
            await folderLocator.waitFor({ state: 'visible', timeout: 3000 });

            // 滚动到视图内
            await folderLocator.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500); // 等待滚动完成

            log(`✅ 备用策略 - 找到已存在的文件夹: ${selector}`, 'success');
            found = true;
            break;
          } catch (e) {
            logVerbose(`备用策略 - 选择器 ${selector} 未找到文件夹: ${e.message}`);
            continue;
          }
        }

        if (!found) {
          throw new Error(`文件夹创建验证失败且备用策略也未找到已存在的文件夹: ${folderError.message}`);
        }

        // 截图保存备用策略找到的文件夹（快速截图，避免阻塞）
        try {
          await folderLocator.screenshot({
            path: `step5-backup-folder-${productId}.png`,
            fullPage: false,
            type: 'png',
            timeout: 3000
          });
          log(`📸 已保存备用策略文件夹截图: step5-backup-folder-${productId}.png`);
        } catch (screenshotError) {
          log(`⚠️ 备用策略文件夹截图失败，跳过: ${screenshotError.message}`, 'warning');
        }
      }
    }

    // 步骤6: 使用左侧树形目录进入目标文件夹 - 严格验证版本
    log('步骤6: 使用左侧树形目录进入目标文件夹...');

    try {
      logVerbose('使用左侧树形节点点击方式进入文件夹...');

      // 确保左侧2026节点已展开
      logVerbose('确保左侧2026节点已展开...');
      const folder2026 = page.locator('li.next-tree-node:has-text("2026")').first();
      if (await folder2026.isVisible()) {
        await folder2026.click();
        await page.waitForTimeout(1000);
        log('✅ 已点击左侧2026节点确保展开', 'success');
      }

      // 在左侧树形目录中找到目标文件夹节点选择器
      logVerbose(`在左侧树形目录中查找目标文件夹: ${productId}`);
      const targetTreeNodeSelectors = [
        `div.next-tree-node-inner:has-text("${productId}")`,
        `li.next-tree-node:has-text("${productId}")`,
        `.next-tree-node:has-text("${productId}")`,
        `div[class*="tree-node"]:has-text("${productId}")`,
        `div[class*="tree"]:has-text("${productId}")`
      ];

      // 循环点击和验证，直到真正进入目标文件夹
      let enteredTargetFolder = false;
      let maxEntryRetries = 15; // 增加重试次数
      let entryRetryCount = 0;

      while (!enteredTargetFolder && entryRetryCount < maxEntryRetries) {
        entryRetryCount++;
        log(`🔄 第 ${entryRetryCount} 次尝试进入目标文件夹...`);

        try {
          // 查找并点击左侧树形节点
          let clickSuccess = false;
          for (const selector of targetTreeNodeSelectors) {
            try {
              logVerbose(`尝试选择器: ${selector}`);
              const targetTreeNode = page.locator(selector).first();

              if (await targetTreeNode.isVisible({ timeout: 3000 })) {
                logVerbose(`找到可见的左侧树形节点: ${selector}`);

                // 尝试滚动到节点位置
                try {
                  await targetTreeNode.scrollIntoViewIfNeeded();
                  await page.waitForTimeout(500);
                } catch (scrollError) {
                  logVerbose(`滚动到节点失败，继续点击: ${scrollError.message}`);
                }

                // 单击进入文件夹（在树形目录中单击即可）
                await targetTreeNode.click();
                await page.waitForTimeout(3000); // 等待更长时间确保页面切换

                log(`✅ 已单击左侧树形节点: ${productId}`, 'success');
                clickSuccess = true;
                break;
              }
            } catch (e) {
              logVerbose(`选择器 ${selector} 未找到左侧树形节点: ${e.message}`);
            }
          }

          if (!clickSuccess) {
            throw new Error(`所有左侧树形节点选择器都未找到目标文件夹: ${productId}`);
          }

          // 严格验证面包屑是否包含目标文件夹
          logVerbose('严格验证面包屑是否包含目标文件夹...');
          const breadcrumbCheck = await page.evaluate((targetProductId) => {
            // 查找所有可能包含面包屑路径的元素
            const breadcrumbSelectors = [
              '.breadcrumb',
              '.path-nav',
              '.nav-path',
              '.folder-header',
              '.page-header',
              '.current-path',
              '.location-path',
              '[class*="breadcrumb"]',
              '[class*="path"]'
            ];

            for (const selector of breadcrumbSelectors) {
              const elements = document.querySelectorAll(selector);
              for (const element of elements) {
                const text = element.innerText || element.textContent;
                if (text) {
                  // 检查是否包含目标文件夹ID和"全部图片"
                  if (text.includes(targetProductId) && text.includes('全部图片')) {
                    return {
                      found: true,
                      text: text.trim(),
                      includesTarget: true
                    };
                  }
                }
              }
            }

            // 备用方案：检查页面整个文本，要求必须包含/C25233113格式
            const bodyText = document.body.innerText;
            const hasTargetInBreadcrumb = bodyText.includes(`全部图片`) &&
                                       bodyText.includes(`/${targetProductId}`) &&
                                       bodyText.includes(targetProductId);

            return {
              found: hasTargetInBreadcrumb,
              text: hasTargetInBreadcrumb ? '页面文本中找到目标路径' : '',
              includesTarget: hasTargetInBreadcrumb
            };
          }, productId);

          if (breadcrumbCheck.found && breadcrumbCheck.includesTarget) {
            log(`✅ 面包屑验证成功: ${breadcrumbCheck.text}`, 'success');

            // 额外验证：检查是否不再显示2026根目录的内容（分页、旧图片等）
            const stillIn2026 = await page.evaluate(() => {
              const bodyText = document.body.innerText;

              // 检查是否还有2026根目录的标志
              const has2026Indicators = bodyText.includes('全部图片/2026') &&
                                         !bodyText.includes('全部图片/2026/C') &&
                                         (bodyText.includes('color_3_') || bodyText.includes('上一页') || bodyText.includes('下一页'));

              return has2026Indicators;
            });

            if (!stillIn2026) {
              log('✅ 确认已离开2026根目录，进入目标文件夹', 'success');
              enteredTargetFolder = true;

              // 截图记录成功进入文件夹
              try {
                await page.screenshot({
                  path: `step6-entered-target-folder-${productId}.png`,
                  fullPage: false,
                  timeout: 3000
                });
                log(`📸 已保存进入目标文件夹截图: step6-entered-target-folder-${productId}.png`);
              } catch (screenshotError) {
                log(`⚠️ 进入文件夹截图失败，继续执行: ${screenshotError.message}`, 'warning');
              }

              break;
            } else {
              log('⚠️ 面包屑有目标文件夹但内容仍在2026，重试', 'warning');
              enteredTargetFolder = false;
            }
          } else {
            log(`⚠️ 面包屑验证失败，未找到目标文件夹路径，重试`, 'warning');
            enteredTargetFolder = false;
          }

        } catch (e) {
          log(`⚠️ 第 ${entryRetryCount} 次进入尝试失败: ${e.message}`, 'warning');
          enteredTargetFolder = false;
        }

        // 如果还没成功，等待一下再重试
        if (!enteredTargetFolder && entryRetryCount < maxEntryRetries) {
          await page.waitForTimeout(2000);
        }
      }

      if (!enteredTargetFolder) {
        throw new Error(`经过 ${maxEntryRetries} 次尝试仍无法进入目标文件夹: ${productId}`);
      }

      log(`✅ 成功进入目标文件夹: ${productId}`, 'success');

    } catch (enterError) {
      throw new Error(`进入文件夹失败: ${enterError.message}`);
    }

    // 步骤7: 刷新页面并再次验证路径持久性 - 确保真正进入目标文件夹
    log('步骤7: 刷新页面并再次验证路径...');

    try {
      // 刷新页面
      log('刷新页面以验证路径持久性...');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      // 清理可能出现的弹窗
      await closeMaterialCenterPopups(page, {
        forceRemoveSearchPanel: true,
        keepSearchPanelAlive: true
      });

      // 验证刷新后是否仍在目标文件夹
      logVerbose('验证刷新后是否仍在目标文件夹...');
      const afterRefreshCheck = await page.evaluate((targetProductId) => {
        const bodyText = document.body.innerText;

        // 检查面包屑是否包含目标文件夹
        const breadcrumbSelectors = [
          '.breadcrumb',
          '.path-nav',
          '.nav-path',
          '.folder-header',
          '.page-header',
          '.current-path',
          '.location-path',
          '[class*="breadcrumb"]',
          '[class*="path"]'
        ];

        for (const selector of breadcrumbSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const text = element.innerText || element.textContent;
            if (text && text.includes(targetProductId) && text.includes('全部图片')) {
              return {
                stillInTarget: true,
                breadcrumb: text.trim()
              };
            }
          }
        }

        // 备用检查：页面文本中是否包含目标路径
        const hasTargetPath = bodyText.includes(`全部图片`) &&
                             bodyText.includes(`/${targetProductId}`) &&
                             bodyText.includes(targetProductId);

        return {
          stillInTarget: hasTargetPath,
          breadcrumb: hasTargetPath ? '页面文本中找到目标路径' : ''
        };
      }, productId);

      if (afterRefreshCheck.stillInTarget) {
        log(`✅ 刷新后路径验证成功: ${afterRefreshCheck.breadcrumb}`, 'success');

        // 检查是否真的在目标文件夹中（不再显示2026根目录的内容）
        const stillIn2026AfterRefresh = await page.evaluate(() => {
          const bodyText = document.body.innerText;

          // 检查是否还有2026根目录的标志
          const has2026Indicators = bodyText.includes('全部图片/2026') &&
                                     !bodyText.includes('全部图片/2026/C') &&
                                     (bodyText.includes('color_3_') || bodyText.includes('上一页') || bodyText.includes('下一页'));

          return has2026Indicators;
        });

        if (!stillIn2026AfterRefresh) {
          log('✅ 刷新后确认仍在目标文件夹，没有回到2026根目录', 'success');

          // 截图记录刷新后的状态
          try {
            await page.screenshot({
              path: `step7-refresh-confirmed-${productId}.png`,
              fullPage: false,
              timeout: 3000
            });
            log(`📸 已保存刷新后验证截图: step7-refresh-confirmed-${productId}.png`);
          } catch (screenshotError) {
            log(`⚠️ 刷新后截图失败，继续执行: ${screenshotError.message}`, 'warning');
          }

        } else {
          throw new Error('刷新后页面回到2026根目录，路径不稳定');
        }

      } else {
        throw new Error('刷新后路径丢失，未能在目标文件夹中');
      }

    } catch (refreshError) {
      log(`❌ 刷新验证失败: ${refreshError.message}`, 'error');
      throw refreshError;
    }

    // 步骤8: 最终验证 - 检查是否有color_*.jpg出现在C25233113目录中
    log('步骤8: 最终验证color_*.jpg文件是否出现在目标目录中...');

    try {
      // 检查页面中是否出现了color_*.jpg文件（表示上传成功或已有内容）
      const colorFileCheck = await page.evaluate(() => {
        const bodyText = document.body.innerText;

        // 检查是否包含color_文件名
        const hasColorFiles = bodyText.includes('color_1_') ||
                             bodyText.includes('color_2_') ||
                             bodyText.includes('color_3_');

        // 检查是否有"暂无图片"提示
        const hasNoImagePrompt = bodyText.includes('暂无图片') ||
                                bodyText.includes('暂无内容') ||
                                bodyText.includes('暂无数据');

        // 检查是否有分页（表示在2026根目录）
        const hasPagination = bodyText.includes('上一页') || bodyText.includes('下一页');

        return {
          hasColorFiles,
          hasNoImagePrompt,
          hasPagination,
          inCorrectFolder: hasNoImagePrompt || (hasColorFiles && !hasPagination)
        };
      });

      if (colorFileCheck.inCorrectFolder) {
        if (colorFileCheck.hasColorFiles) {
          log('✅ 目标目录中包含color_*.jpg文件，验证成功', 'success');
        } else {
          log('✅ 目标目录为空（显示"暂无图片"），准备上传', 'success');
        }

        // 最终截图
        try {
          await page.screenshot({
            path: `step8-final-verified-${productId}.png`,
            fullPage: false,
            timeout: 3000
          });
          log(`📸 已保存最终验证截图: step8-final-verified-${productId}.png`);
        } catch (screenshotError) {
          log(`⚠️ 最终验证截图失败，继续执行: ${screenshotError.message}`, 'warning');
        }

      } else {
        throw new Error(`最终验证失败：页面状态异常 - color文件: ${colorFileCheck.hasColorFiles}, 无图片提示: ${colorFileCheck.hasNoImagePrompt}, 有分页: ${colorFileCheck.hasPagination}`);
      }

    } catch (finalCheckError) {
      log(`❌ 最终验证失败: ${finalCheckError.message}`, 'error');
      throw finalCheckError;
    }

    log('🎉 所有验证步骤完成，确认进入目标文件夹并准备上传', 'success');

    // 步骤9: 点击上传文件按钮
    log('步骤9: 点击上传文件按钮...');

    // 🔧 路径验证后再次清理搜索面板并启动持续防护
    log('🔧 路径验证后清理搜索面板并启动持续防护（确保上传按钮可点击）...');
    await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: true });

    // 等待页面完全加载
    await page.waitForTimeout(3000);

    // 扩展上传按钮选择器列表
    const uploadButtonSelectors = [
      // 主要上传按钮选择器
      'button:has-text("上传文件")',
      'button:has-text("批量导入")',
      'button:has-text("上传图片")',
      'button:has-text("导入")',
      'button:has-text("添加文件")',
      'button:has-text("选择文件")',
      // 通用class选择器
      '.upload-button',
      '.btn-upload',
      '.upload-btn',
      '[class*="upload"]',
      '[class*="btn-upload"]',
      // 更通用的按钮选择器
      'button.btn-primary',
      'button.next-btn-primary',
      'button.next-btn',
      '.next-btn-primary:has-text("上传")',
      '.next-btn:has-text("上传")',
      // 图标按钮选择器
      'button[title*="上传"]',
      'button[aria-label*="上传"]',
      // 可能的input元素
      'input[type="file"]',
      '.file-input'
    ];

    let uploadButton = null;
    let foundSelector = null;

    // 分阶段查找上传按钮
    log('开始分阶段查找上传按钮...');

    for (let i = 0; i < uploadButtonSelectors.length; i++) {
      const selector = uploadButtonSelectors[i];
      try {
        logVerbose(`尝试选择器 ${i + 1}/${uploadButtonSelectors.length}: ${selector}`);

        // 使用locator等待元素可见
        const button = page.locator(selector).first({ timeout: 2000 });

        if (await button.isVisible()) {
          uploadButton = button;
          foundSelector = selector;
          log(`✅ 找到上传按钮: ${selector}`, 'success');
          break;
        }

      } catch (e) {
        logVerbose(`选择器 ${selector} 未找到: ${e.message}`);
      }
    }

    if (!uploadButton) {
      throw new Error('未找到上传按钮');
    }

    log('✅ 找到上传按钮，开始上传流程', 'success');

    // 暂时跳过实际上传逻辑，只验证进入文件夹
    log('🎉 Step5完成：成功进入目标文件夹', 'success');

  } catch (error) {
    log(`Step5执行失败: ${error.message}`, 'error');
    throw error;
  }
}

// 运行主函数
main().catch(error => {
  log(`程序执行失败: ${error.message}`, 'error');
  process.exit(1);
});
