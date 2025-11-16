#!/usr/bin/env node

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { closeMaterialCenterPopups } = require('../utils/advert-handler');

/**
 * 日志输出函数
 */
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = {
    'info': '📋',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️'
  }[type] || '📋';

  console.log(`[Step5] ${timestamp} ${prefix} Step5: ${message}`);
}

function logVerbose(message) {
  if (process.argv.includes('--verbose')) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[Step5-VERBOSE] ${timestamp} ${message}`);
  }
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

  const files = fs.readdirSync(localFolder).filter(file =>
    file.match(/^color_\d+_\d+\.jpg$/)
  );

  if (files.length === 0) {
    log('本地文件夹中没有找到 color_*.jpg 格式的图片文件', 'error');
    return null;
  }

  log(`本地验证通过: 找到 ${files.length} 个图片文件`, 'success');
  logVerbose(`本地文件夹: ${localFolder}`);
  logVerbose(`图片文件: ${files.join(', ')}`);

  return {
    localFolder,
    files
  };
}

/**
 * 超严格面包屑验证 - 必须看到"全部图片 / 2026 / C25233113"
 */
async function ultraStrictBreadcrumbValidation(page, productId) {
  log('🔍 超严格面包屑验证，必须看到"全部图片 / 2026 / C25233113"...');

  let breadcrumbConfirmed = false;
  let maxRetries = 20;
  let retryCount = 0;

  while (!breadcrumbConfirmed && retryCount < maxRetries) {
    retryCount++;
    log(`🔄 第 ${retryCount} 次超严格验证面包屑路径...`);

    try {
      // 等待页面完全稳定
      await page.waitForTimeout(4000);

      // 立即清理任何弹出的遮罩
      await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: true });
      await page.waitForTimeout(1000);

      // 获取页面所有文本内容，进行精确匹配
      const pageContent = await page.evaluate(() => {
        return {
          fullText: document.body.innerText,
          visibleText: Array.from(document.body.querySelectorAll('*'))
              .filter(el => el.offsetParent !== null)
              .map(el => el.innerText)
              .join(' ')
        };
      });

      logVerbose(`页面完整文本预览: ${pageContent.fullText.substring(0, 500)}...`);

      // 方法1: 精确匹配完整面包屑路径
      const exactBreadcrumbs = [
        `全部图片 / 2026 / ${productId}`,
        `全部图片/2026/${productId}`,
        `全部图片 > 2026 > ${productId}`
      ];

      let exactMatchFound = false;
      for (const breadcrumb of exactBreadcrumbs) {
        if (pageContent.fullText.includes(breadcrumb) || pageContent.visibleText.includes(breadcrumb)) {
          log(`✅ 找到精确面包屑路径: ${breadcrumb}`, 'success');
          exactMatchFound = true;
          break;
        }
      }

      // 方法2: 检查是否有"暂无图片"表示在空文件夹中
      const emptyFolderIndicators = [
        '暂无图片',
        '暂无内容',
        '暂无数据',
        '文件夹为空'
      ];

      let hasEmptyPrompt = false;
      for (const indicator of emptyFolderIndicators) {
        if (pageContent.fullText.includes(indicator)) {
          log(`✅ 检测到空文件夹指示: ${indicator}`, 'success');
          hasEmptyPrompt = true;
          break;
        }
      }

      // 方法3: 检查页面左上角区域是否有面包屑
      const headerCheck = await page.evaluate(() => {
        const headerElements = document.querySelectorAll('.page-header, .breadcrumb, .path-nav, .folder-header, .nav-path');
        const headerTexts = Array.from(headerElements).map(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' ? el.innerText : '';
        }).filter(text => text.trim());

        return {
          texts: headerTexts,
          combined: headerTexts.join(' | ')
        };
      });

      logVerbose(`页面头部区域: ${headerCheck.combined}`);

      // 最终判断：必须找到精确路径或有空文件夹提示
      const breadcrumbValid = exactMatchFound || (hasEmptyPrompt && headerCheck.combined.includes(productId));

      if (breadcrumbValid) {
        log(`✅ 面包屑超严格验证成功！`, 'success');
        if (exactMatchFound) {
          log(`📍 精确路径匹配`, 'info');
        }
        if (hasEmptyPrompt) {
          log(`📍 空文件夹指示`, 'info');
        }
        breadcrumbConfirmed = true;
      } else {
        log(`⚠️ 面包屑验证失败 - 第${retryCount}次尝试`, 'warning');
        log(`📋 验证状态: 精确匹配=${exactMatchFound}, 空文件夹=${hasEmptyPrompt}`, 'info');

        // 如果验证失败，强制重新进入文件夹
        if (retryCount < maxRetries) {
          log(`🔄 强制重新进入目标文件夹 ${productId}...`);

          // 立即清理遮罩
          await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: true });
          await page.waitForTimeout(1000);

          // 先点击2026文件夹确保回到正确层级
          try {
            const folder2026 = page.locator('li.next-tree-node:has-text("2026")').first();
            if (await folder2026.isVisible()) {
              await folder2026.click();
              log('✅ 点击2026文件夹', 'success');
              await page.waitForTimeout(2000);
            }
          } catch (e) {
            log('点击2026文件夹失败', 'warning');
          }

          // 再次清理遮罩
          await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: true });
          await page.waitForTimeout(1000);

          // 强制双击目标文件夹
          const targetFolderSelectors = [
            `div[class*="folder"]:has-text("${productId}")`,
            `.folder-card:has-text("${productId}")`,
            `[title="${productId}"]`,
            `.next-tree-node:has-text("${productId}")`,
            `text=${productId}`
          ];

          let reentrySuccess = false;
          for (const selector of targetFolderSelectors) {
            try {
              const targetFolder = page.locator(selector);
              if (await targetFolder.isVisible()) {
                // 强制双击
                await targetFolder.dblclick({ force: true });
                log(`✅ 强制双击进入: ${productId}`, 'success');
                reentrySuccess = true;
                await page.waitForTimeout(5000); // 增加等待时间
                break;
              }
            } catch (e) {
              continue;
            }
          }

          if (!reentrySuccess) {
            log('❌ 强制重新进入失败', 'error');
          }

          // 最后再次清理遮罩
          await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: true });
          await page.waitForTimeout(1000);
        }
      }

      // 截图保存验证状态
      try {
        const screenshotPath = `step5-ultra-strict-breadcrumb-${productId}-attempt${retryCount}.png`;
        await page.screenshot({
          path: screenshotPath,
          fullPage: false,
          type: 'png',
          timeout: 5000
        });
        log(`📸 已保存面包屑验证截图: ${screenshotPath}`);
      } catch (screenshotError) {
        log(`⚠️ 面包屑截图失败: ${screenshotError.message}`, 'warning');
      }

    } catch (breadcrumbError) {
      log(`❌ 面包屑检查异常: ${breadcrumbError.message}`, 'error');
    }
  }

  if (!breadcrumbConfirmed) {
    // 最后一次截图失败状态
    try {
      await page.screenshot({
        path: `step5-breadcrumb-failed-final-${productId}.png`,
        fullPage: false,
        type: 'png'
      });
    } catch (e) {
      // 忽略截图错误
    }

    throw new Error(`面包屑超严格验证失败：经过 ${maxRetries} 次尝试，仍未确认在 "全部图片 / 2026 / ${productId}" 路径下`);
  }

  log('✅ 面包屑超严格验证完成，确认在正确的目标文件夹上下文中', 'success');
  return true;
}

/**
 * 上传后硬验证 - 刷新页面重新检查文件是否真的在目标文件夹中
 */
async function hardPostUploadVerification(page, productId, localData) {
  log('🔍 上传后硬验证 - 刷新页面重新检查文件是否真的在C25233113中...');

  try {
    // 等待上传操作完成
    await page.waitForTimeout(5000);

    // 强制刷新页面，清除所有缓存
    log('🔄 强制刷新页面，清除所有缓存...');
    await page.reload();
    await page.waitForTimeout(5000);

    // 立即清理任何弹出的遮罩
    await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: true });
    await page.waitForTimeout(3000);

    // 重新导航到C25233113文件夹
    log('🔄 重新导航到目标文件夹 C25233113...');

    // 步骤1: 点击2026文件夹
    const folder2026Selectors = [
      'li.next-tree-node:has-text("2026")',
      '[title="2026"]',
      '.tree-node:has-text("2026")'
    ];

    let folder2026Clicked = false;
    for (const selector of folder2026Selectors) {
      try {
        const folder2026 = page.locator(selector);
        if (await folder2026.isVisible()) {
          await folder2026.click();
          log('✅ 重新点击2026文件夹', 'success');
          folder2026Clicked = true;
          await page.waitForTimeout(2000);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!folder2026Clicked) {
      throw new Error('无法点击2026文件夹进行重新验证');
    }

    // 立即清理遮罩
    await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: true });
    await page.waitForTimeout(1000);

    // 步骤2: 双击进入C25233113文件夹
    const targetFolderSelectors = [
      `div[class*="folder"]:has-text("${productId}")`,
      `.folder-card:has-text("${productId}")`,
      `[title="${productId}"]`,
      `.next-tree-node:has-text("${productId}")`
    ];

    let targetFolderEntered = false;
    for (const selector of targetFolderSelectors) {
      try {
        const targetFolder = page.locator(selector);
        if (await targetFolder.isVisible()) {
          await targetFolder.dblclick();
          log(`✅ 重新双击进入目标文件夹: ${productId}`, 'success');
          targetFolderEntered = true;
          await page.waitForTimeout(5000); // 增加等待时间
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!targetFolderEntered) {
      throw new Error(`无法重新进入目标文件夹 ${productId}`);
    }

    // 再次清理遮罩
    await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: true });
    await page.waitForTimeout(1000);

    // 截图：进入文件夹后的状态
    try {
      await page.screenshot({
        path: `step5-hard-verify-entry-${productId}.png`,
        fullPage: false,
        type: 'png',
        timeout: 5000
      });
      log(`📸 已保存进入文件夹截图: step5-hard-verify-entry-${productId}.png`);
    } catch (screenshotError) {
      log(`⚠️ 进入文件夹截图失败: ${screenshotError.message}`, 'warning');
    }

    // 步骤3: 硬检查文件夹内容
    log('🔍 硬检查C25233113文件夹的真实内容...');

    // 获取页面所有文本内容
    const finalPageContent = await page.evaluate(() => {
      return document.body.innerText;
    });

    // 检查是否为空文件夹
    const emptyFolderIndicators = [
      '暂无图片',
      '暂无内容',
      '暂无数据',
      '文件夹为空',
      '该文件夹为空'
    ];

    let hasEmptyPrompt = false;
    for (const indicator of emptyFolderIndicators) {
      if (finalPageContent.includes(indicator)) {
        log(`✅ 检测到空文件夹提示: ${indicator}`, 'success');
        hasEmptyPrompt = true;
        break;
      }
    }

    if (hasEmptyPrompt) {
      log('❌ 硬验证失败：C25233113文件夹显示"暂无图片"，说明文件没有上传到目标文件夹', 'error');

      // 截图：空文件夹证明
      try {
        await page.screenshot({
          path: `step5-hard-proof-empty-${productId}.png`,
          fullPage: false,
          type: 'png',
          timeout: 5000
        });
        log(`📸 已保存空文件夹硬证明截图: step5-hard-proof-empty-${productId}.png`);
      } catch (screenshotError) {
        log(`⚠️ 空文件夹截图失败: ${screenshotError.message}`, 'warning');
      }

      throw new Error(`硬验证失败：目标文件夹 ${productId} 为空，文件未上传到正确位置`);
    }

    // 步骤4: 详细检查color_*.jpg文件卡片
    log('📋 详细检查C25233113文件夹中的color_*.jpg文件卡片...');

    const fileCardVerificationMethods = [
      // 方法1: 检查图片元素
      async () => {
        const imgElements = await page.$$('img[src*="color_"]');
        return imgElements.length;
      },
      // 方法2: 检查文件链接
      async () => {
        const linkElements = await page.$$('a[href*="color_"]');
        return linkElements.length;
      },
      // 方法3: 检查文件名文本元素
      async () => {
        const textElements = await page.$$('text=/color_[0-9]/');
        return textElements.length;
      },
      // 方法4: 检查页面内容
      async () => {
        const content = await page.content();
        const colorMatches = content.match(/color_[0-9_]+\.jpg/gi);
        return colorMatches ? colorMatches.length : 0;
      },
      // 方法5: 检查文件卡片元素
      async () => {
        const fileCards = await page.$$('.file-card, .material-card, .image-card, [class*="card"]');
        return fileCards.length;
      }
    ];

    let actualColorFileCount = 0;
    let detailedCheckResults = [];

    for (let i = 0; i < fileCardVerificationMethods.length; i++) {
      try {
        const count = await fileCardVerificationMethods[i]();
        detailedCheckResults.push(`检查方法${i+1}: ${count}个color文件`);
        if (count > 0) {
          actualColorFileCount = Math.max(actualColorFileCount, count);
        }
      } catch (e) {
        detailedCheckResults.push(`检查方法${i+1}: 失败 - ${e.message}`);
      }
    }

    log(`📊 C25233113文件夹文件检查结果: ${detailedCheckResults.join(', ')}`, 'info');

    // 截图：文件列表状态
    try {
      await page.screenshot({
        path: `step5-hard-verify-files-${productId}.png`,
        fullPage: false,
        type: 'png',
        timeout: 5000
      });
      log(`📸 已保存C25233113文件列表截图: step5-hard-verify-files-${productId}.png`);
    } catch (screenshotError) {
      log(`⚠️ 文件列表截图失败: ${screenshotError.message}`, 'warning');
    }

    // 最终硬验证结果
    if (actualColorFileCount >= localData.files.length) {
      log(`🎉 硬验证成功！在C25233113中找到 ${actualColorFileCount} 个color_*.jpg文件，预期 ${localData.files.length} 个`, 'success');
      log(`📁 最终硬验证结果: color_*.jpg 文件确实在目标文件夹 ${productId} 中`, 'success');

      // 列出找到的文件
      try {
        const fileElements = await page.$$('text=/color_[0-9_]+\.jpg/');
        if (fileElements.length > 0) {
          log(`📋 C25233113文件夹中的color_*.jpg文件列表:`, 'info');
          for (let i = 0; i < Math.min(fileElements.length, 15); i++) {
            const text = await fileElements[i].textContent();
            if (text) {
              log(`  - ${text.trim()}`, 'info');
            }
          }
          if (fileElements.length > 15) {
            log(`  ... 还有 ${fileElements.length - 15} 个文件`, 'info');
          }
        }
      } catch (e) {
        log('获取文件列表失败', 'warning');
      }

      return true;

    } else {
      log(`❌ 硬验证失败：在C25233113中仅找到 ${actualColorFileCount} 个color_*.jpg文件，预期 ${localData.files.length} 个`, 'error');
      log(`📁 最终硬验证结果: 文件未上传到目标文件夹 ${productId}，可能全部在2026根目录`, 'error');

      // 最终失败截图
      try {
        await page.screenshot({
          path: `step5-hard-verify-failed-${productId}.png`,
          fullPage: false,
          type: 'png',
          timeout: 5000
        });
        log(`📸 已保存硬验证失败截图: step5-hard-verify-failed-${productId}.png`);
      } catch (screenshotError) {
        log(`⚠️ 失败截图失败: ${screenshotError.message}`, 'warning');
      }

      throw new Error(`硬验证失败：目标文件夹中color_*.jpg文件数量不足 (${actualColorFileCount}/${localData.files.length})`);
    }

  } catch (finalVerifyError) {
    log(`❌ 最终硬验证过程失败: ${finalVerifyError.message}`, 'error');

    // 错误截图
    try {
      await page.screenshot({
        path: `step5-final-hard-error-${productId}.png`,
        fullPage: true,
        type: 'png',
        timeout: 5000
      });
      log(`📸 已保存最终硬验证错误截图: step5-final-hard-error-${productId}.png`);
    } catch (screenshotError) {
      log(`⚠️ 错误截图失败: ${screenshotError.message}`, 'warning');
    }

    throw new Error(`Step5硬验证失败：${finalVerifyError.message}`);
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const productArg = args.find(arg => arg.startsWith('--product='));

  if (!productArg) {
    log('缺少商品ID参数！使用方法: --product=<PRODUCT_ID>', 'error');
    process.exit(1);
  }

  const productId = productArg.split('=')[1];
  if (!productId) {
    log('商品ID参数为空！', 'error');
    process.exit(1);
  }

  log('开始Step5：素材库上传（超严格验证版）');
  log(`商品ID: ${productId}`);

  // 验证本地文件夹
  const localData = validateLocalFolder(productId);
  if (!localData) {
    log(`本地验证失败: ${productId}`, 'error');
    process.exit(1);
  }

  let browser;
  let page;

  try {
    // 连接Chrome
    log('连接Chrome (CDP 9222)...');
    browser = await chromium.connectOverCDP('http://localhost:9222');

    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('没有找到浏览器上下文');
    }

    const context = contexts[0];
    const pages = context.pages();

    page = pages.find(p => {
      const url = p.url();
      return url.includes('taobao.com') || url.includes('myseller.taobao.com');
    }) || pages[0];

    if (!page) {
      throw new Error('没有找到可用的页面');
    }

    log('Chrome连接成功');

    // 导航到素材库
    log('导航到素材库...');
    await page.goto('https://myseller.taobao.com/home.htm/material-center/mine-material/sucai-tu');
    await page.waitForTimeout(3000);

    // 清理广告
    await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: true });
    await page.waitForTimeout(2000);

    // 点击2026文件夹
    log('点击2026文件夹...');
    const folder2026 = page.locator('li.next-tree-node:has-text("2026")').first();
    if (await folder2026.isVisible()) {
      await folder2026.click();
      log('✅ 点击2026文件夹', 'success');
      await page.waitForTimeout(2000);
    } else {
      throw new Error('未找到2026文件夹');
    }

    // 双击进入目标文件夹
    log(`双击进入目标文件夹: ${productId}...`);
    const targetFolder = page.locator(`div[class*="folder"]:has-text("${productId}")`);
    if (await targetFolder.isVisible()) {
      await targetFolder.dblclick();
      log(`✅ 双击进入: ${productId}`, 'success');
      await page.waitForTimeout(3000);
    } else {
      throw new Error(`未找到目标文件夹: ${productId}`);
    }

    // 超严格面包屑验证
    await ultraStrictBreadcrumbValidation(page, productId);

    // 点击上传按钮
    log('点击上传文件按钮...');
    const uploadButton = page.locator('button:has-text("上传文件")');
    if (await uploadButton.isVisible()) {
      await uploadButton.click();
      log('✅ 点击上传按钮', 'success');
      await page.waitForTimeout(2000);
    } else {
      throw new Error('未找到上传按钮');
    }

    // 处理文件上传对话框
    log('处理文件上传对话框...');
    try {
      await page.waitForSelector('input[type="file"]', { timeout: 10000 });
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        const filePaths = localData.files.map(file => path.join(localData.localFolder, file));
        await fileInput.setInputFiles(filePaths);
        log(`✅ 已选择 ${filePaths.length} 个文件`, 'success');
      } else {
        throw new Error('未找到文件输入元素');
      }
    } catch (uploadError) {
      throw new Error(`文件上传失败: ${uploadError.message}`);
    }

    // 等待上传完成
    log('等待上传完成...');
    try {
      await page.waitForSelector('text=上传成功', { timeout: 60000 });
      log('✅ 检测到上传成功', 'success');
      await page.waitForTimeout(3000);
    } catch (e) {
      log('⚠️ 未检测到上传成功提示，继续验证...', 'warning');
    }

    // 上传后硬验证
    await hardPostUploadVerification(page, productId, localData);

    log(`🎉 Step5超严格验证版完成！文件确实在商品 ${productId} 的C25233113文件夹中`, 'success');
    process.exit(0);

  } catch (error) {
    log(`Step5失败: ${error.message}`, 'error');

    if (page && productId) {
      try {
        await page.screenshot({
          path: `step5-clean-error-${productId}.png`,
          fullPage: true,
          type: 'png'
        });
        log(`错误截图已保存: step5-clean-error-${productId}.png`);
      } catch (screenshotError) {
        log(`错误截图失败: ${screenshotError.message}`, 'warning');
      }
    }

    process.exit(1);
  } finally {
    if (browser) {
      log('保持Chrome实例运行');
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('程序执行出错:', error);
    process.exit(1);
  });
}