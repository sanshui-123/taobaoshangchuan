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
 * 强制验证文件是否真正在目标文件夹中
 */
async function forceVerifyFilesInFolder(page, productId, localData) {
  log('🔍 开始强制验证文件是否真正在目标文件夹中...');

  let filesActuallyInFolder = false;
  let maxRetryAttempts = 3;
  let retryCount = 0;

  while (!filesActuallyInFolder && retryCount < maxRetryAttempts) {
    retryCount++;
    log(`🔄 第 ${retryCount} 次验证文件是否在目标文件夹中...`);

    try {
      // 强制刷新页面，确保获取最新状态
      log('🔄 强制刷新页面...');
      await page.reload();
      await page.waitForTimeout(5000);

      // 清理广告弹窗
      await closeMaterialCenterPopups(page, { forceRemoveSearchPanel: true, keepSearchPanelAlive: true });
      await page.waitForTimeout(2000);

      // 重新导航到目标文件夹
      log('🔄 重新导航到目标文件夹...');

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
        log('❌ 无法重新点击2026文件夹，跳过本次验证', 'error');
        continue;
      }

      // 步骤2: 双击进入目标文件夹
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
            await page.waitForTimeout(3000);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!targetFolderEntered) {
        log('❌ 无法重新进入目标文件夹，跳过本次验证', 'error');
        continue;
      }

      // 步骤3: 检查是否看到"暂无图片"或文件内容
      const emptyPrompt = await page.$('text=暂无图片, text=暂无内容, text=暂无数据');
      if (emptyPrompt) {
        log('⚠️ 重新进入后发现文件夹显示"暂无图片"，说明文件可能没有上传成功', 'warning');
      }

      // 步骤4: 仔细检查 color_*.jpg 文件是否存在
      log('🔍 仔细检查 color_*.jpg 文件是否存在...');

      const fileCheckMethods = [
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
        // 方法3: 检查文件名文本
        async () => {
          const textElements = await page.$$('text=/color_/');
          return textElements.length;
        },
        // 方法4: 通过页面内容查找
        async () => {
          const pageContent = await page.content();
          const colorMatches = pageContent.match(/color_[\d_]+\.jpg/gi);
          return colorMatches ? colorMatches.length : 0;
        }
      ];

      let foundFilesCount = 0;
      let foundMethod = null;

      for (let i = 0; i < fileCheckMethods.length; i++) {
        try {
          const count = await fileCheckMethods[i]();
          if (count > 0) {
            foundFilesCount = count;
            foundMethod = `方法${i + 1}`;
            log(`✅ 通过${foundMethod}找到 ${count} 个color_文件`, 'success');
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (foundFilesCount >= localData.files.length) {
        log(`🎉 验证成功！找到 ${foundFilesCount} 个文件，与预期 ${localData.files.length} 个文件匹配`, 'success');
        filesActuallyInFolder = true;
      } else if (foundFilesCount > 0) {
        log(`⚠️ 找到部分文件 (${foundFilesCount}/${localData.files.length})，可能上传不完整`, 'warning');
      } else {
        log('❌ 未找到任何 color_*.jpg 文件，需要重新上传', 'error');
      }

      // 截图保存验证结果
      try {
        const screenshotPath = `step5-file-verification-${productId}-retry${retryCount}.png`;
        await page.screenshot({
          path: screenshotPath,
          fullPage: false,
          type: 'png',
          timeout: 3000
        });
        log(`📸 已保存验证截图: ${screenshotPath}`);
      } catch (screenshotError) {
        log(`⚠️ 验证截图失败: ${screenshotError.message}`, 'warning');
      }

    } catch (verifyError) {
      log(`❌ 验证过程出错: ${verifyError.message}`, 'error');
    }
  }

  // 最终验证结果
  if (filesActuallyInFolder) {
    log(`🎉 最终验证成功！文件确实存在于目标文件夹 ${productId} 中`, 'success');
    log(`📁 验证结果: 已验证 ${localData.files.length} 个 color_*.jpg 文件在目标文件夹中`, 'success');
    return true;
  } else {
    log(`❌ 最终验证失败！经过 ${maxRetryAttempts} 次尝试，文件仍然不在目标文件夹中`, 'error');
    log(`📁 验证结果: color_*.jpg 文件未在目标文件夹 ${productId} 中找到`, 'error');
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const productArg = args.find(arg => arg.startsWith('--product='));
  const isVerbose = args.includes('--verbose');

  if (!productArg) {
    log('缺少商品ID参数！使用方法: --product=<PRODUCT_ID>', 'error');
    log('示例: node scripts/tools/upload-material-folder.js --product=12345 --verbose', 'error');
    process.exit(1);
  }

  const productId = productArg.split('=')[1];

  if (!productId) {
    log('商品ID参数为空！', 'error');
    process.exit(1);
  }

  if (isVerbose) {
    log('详细模式: 开启', 'info');
  }

  // 验证本地文件夹
  const localData = validateLocalFolder(productId);
  if (!localData) {
    log(`本地图片文件夹验证失败: ${productId}`, 'error');
    process.exit(1);
  }

  let browser;
  let page;

  try {
    log(`开始Step5：素材库上传流程`);
    log(`商品ID: ${productId}`);

    // 连接到现有Chrome实例
    log('连接到Chrome (CDP 9222)...');
    browser = await chromium.connectOverCDP('http://localhost:9222');

    // 获取所有页面并找到合适的页面
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('没有找到浏览器上下文');
    }

    const context = contexts[0];
    const pages = context.pages();

    // 查找素材库相关页面
    page = pages.find(p => {
      const url = p.url();
      return url.includes('taobao.com') || url.includes('myseller.taobao.com');
    });

    if (!page) {
      // 如果没有找到合适的页面，使用第一个页面
      page = pages[0];
    }

    if (!page) {
      throw new Error('没有找到可用的页面');
    }

    log('Chrome连接成功');

    // 直接进行强制验证，检查文件是否真的在目标文件夹中
    log('⚡ 直接进行强制文件验证，检查当前文件夹状态...');

    const verificationResult = await forceVerifyFilesInFolder(page, productId, localData);

    if (verificationResult) {
      log(`🎯 Step5 验证完成！文件确实存在于商品 ${productId} 的文件夹中`, 'success');
      log(`📁 最终验证结果: ${localData.files.length} 个 color_*.jpg 文件已确认在目标文件夹中`, 'success');
      process.exit(0);
    } else {
      log(`❌ Step5 验证失败！文件不在商品 ${productId} 的文件夹中`, 'error');
      log(`📁 最终验证结果: 文件未在目标文件夹中找到，需要重新上传`, 'error');
      process.exit(1);
    }

  } catch (error) {
    log(`Step5执行失败: ${error.message}`, 'error');

    // 尝试错误截图
    if (page && productId) {
      try {
        await page.screenshot({
          path: `step5-verification-error-${productId}.png`,
          fullPage: true,
          type: 'png'
        });
        log(`错误截图已保存: step5-verification-error-${productId}.png`);
      } catch (screenshotError) {
        log(`错误截图失败: ${screenshotError.message}`, 'warning');
      }
    }

    process.exit(1);
  } finally {
    if (browser) {
      log('保持Chrome实例运行，供后续流程复用');
      // 不关闭浏览器，保持连接
    }
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('程序执行出错:', error);
    process.exit(1);
  });
}

module.exports = {
  validateLocalFolder,
  forceVerifyFilesInFolder
};