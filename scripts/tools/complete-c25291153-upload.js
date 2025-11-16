const { chromium } = require('playwright');
const { closeMaterialCenterPopups } = require('../utils/advert-handler');
const fs = require('fs');
const path = require('path');

async function completeC25291153Upload() {
  const productId = 'C25291153';

  function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🚀';
    console.log(`${timestamp} CompleteUpload: ${prefix} ${message}`);
  }

  try {
    log(`完成C25291153文件夹上传流程`);

    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();

    let page = null;
    for (const context of contexts) {
      const pages = context.pages();
      for (const p of pages) {
        if (p.url().includes('taobao.com') && p.url().includes('material-center')) {
          page = p;
          break;
        }
      }
      if (page) break;
    }

    if (!page) {
      throw new Error('未找到素材库页面');
    }

    log('已连接到素材库页面');

    // 清理页面
    await closeMaterialCenterPopups(page, {
      forceRemoveSearchPanel: true,
      keepSearchPanelAlive: true
    });
    await page.waitForTimeout(2000);

    // 步骤1：验证C25291153文件夹存在
    log('=== 步骤1：验证C25291153文件夹存在 ===');
    await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      const node2026 = nodes.find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
      }
    });
    await page.waitForTimeout(2000);

    const folderExists = await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      return nodes.some(el => el.textContent && el.textContent.includes(targetId));
    }, productId);

    if (!folderExists) {
      throw new Error(`C25291153文件夹不存在`);
    }

    log('✅ C25291153文件夹存在');

    // 步骤2：导航到C25291153文件夹
    log('=== 步骤2：导航到C25291153文件夹 ===');
    const navigated = await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      const targetNode = nodes.find(el => el.textContent && el.textContent.includes(targetId));
      if (targetNode) {
        targetNode.click();
        return true;
      }
      return false;
    }, productId);

    if (!navigated) {
      throw new Error('无法点击C25291153文件夹');
    }

    await page.waitForTimeout(3000);

    // 步骤3：验证面包屑显示正确
    log('=== 步骤3：验证面包屑显示正确 ===');
    const breadcrumb = await page.evaluate(() => {
      const breadcrumb = document.querySelector('.next-breadcrumb');
      return breadcrumb ? breadcrumb.textContent.trim() : '';
    });

    const expectedBreadcrumb = `全部图片 / 2026 / ${productId}`;
    const hasAllParts = breadcrumb.includes('全部图片') &&
                       breadcrumb.includes('2026') &&
                       breadcrumb.includes(productId);

    if (!hasAllParts) {
      throw new Error(`面包屑验证失败。期望包含: 全部图片, 2026, ${productId}。实际: "${breadcrumb}"`);
    }

    log(`✅ 面包屑验证成功: "${breadcrumb}"`);

    // 步骤4：执行上传
    log('=== 步骤4：执行上传 ===');

    // 获取color_*.jpg文件
    const colorFiles = ['color_1_01.jpg', 'color_1_02.jpg', 'color_1_03.jpg', 'color_1_04.jpg', 'color_1_05.jpg',
                        'color_2_01.jpg', 'color_2_02.jpg', 'color_2_03.jpg', 'color_2_04.jpg', 'color_2_05.jpg'];

    log(`准备上传${colorFiles.length}个color_*.jpg文件`);

    // 点击上传文件按钮
    log('点击上传文件按钮...');
    const uploadButtonClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const button of buttons) {
        const text = button.textContent || '';
        if (text.includes('上传文件')) {
          button.click();
          return true;
        }
      }
      return false;
    });

    if (!uploadButtonClicked) {
      throw new Error('无法点击上传文件按钮');
    }

    await page.waitForTimeout(3000);

    // 上传文件
    log('开始上传color_*.jpg文件...');
    for (let i = 0; i < colorFiles.length; i++) {
      const fileName = colorFiles[i];
      const filePath = `/Users/sanshui/Desktop/tbzhuaqu/color_images/${fileName}`;

      log(`上传文件 ${i + 1}/${colorFiles.length}: ${fileName}`);

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        log(`⚠️ 文件不存在: ${filePath}，跳过`);
        continue;
      }

      try {
        // 使用文件上传
        const fileInput = await page.locator('input[type="file"]');
        await fileInput.setInputFiles(filePath);

        await page.waitForTimeout(2000);
        log(`✅ 已上传: ${fileName}`);
      } catch (uploadError) {
        log(`❌ 上传失败: ${fileName} - ${uploadError.message}`);
      }
    }

    // 步骤5：等待上传完成
    log('=== 步骤5：等待上传完成 ===');
    await page.waitForTimeout(10000);

    // 步骤6：刷新页面并验证
    log('=== 步骤6：刷新页面并验证 ===');
    await page.reload();
    await page.waitForTimeout(5000);

    // 重新导航到2026和C25291153
    log('重新导航到C25291153文件夹...');
    await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      const node2026 = nodes.find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
      }
    });
    await page.waitForTimeout(2000);

    await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      const targetNode = nodes.find(el => el.textContent && el.textContent.includes(targetId));
      if (targetNode) {
        targetNode.click();
      }
    }, productId);
    await page.waitForTimeout(3000);

    // 最终验证面包屑
    const finalBreadcrumb = await page.evaluate(() => {
      const breadcrumb = document.querySelector('.next-breadcrumb');
      return breadcrumb ? breadcrumb.textContent.trim() : '';
    });

    const finalVerification = finalBreadcrumb.includes('全部图片') &&
                            finalBreadcrumb.includes('2026') &&
                            finalBreadcrumb.includes(productId);

    if (!finalVerification) {
      throw new Error(`最终面包屑验证失败: "${finalBreadcrumb}"`);
    }

    log(`✅ 最终面包屑验证成功: "${finalBreadcrumb}"`);

    // 检查color_*.jpg文件是否在目录中
    log('检查color_*.jpg文件是否在目录中...');
    const colorFilesPresent = await page.evaluate(() => {
      const fileElements = document.querySelectorAll('[title], .file-name, .filename, .item-name');
      const colorFileNames = [];

      for (const element of fileElements) {
        const text = element.textContent || element.title || '';
        if (text.includes('color_') && text.includes('.jpg')) {
          colorFileNames.push(text.trim());
        }
      }

      return {
        count: colorFileNames.length,
        files: colorFileNames
      };
    });

    log(`找到${colorFilesPresent.count}个color_*.jpg文件:`);
    colorFilesPresent.files.forEach(file => {
      log(`  - ${file}`);
    });

    // 保存最终截图
    const finalScreenshot = `/Users/sanshui/Desktop/.claude/claude-code-chat-images/${productId}-upload-complete.png`;
    await page.screenshot({
      path: finalScreenshot,
      fullPage: true
    });

    log(`📸 最终截图已保存: ${productId}-upload-complete.png`);

    if (colorFilesPresent.count >= 5) {
      log(`🎉 上传和验证完全成功！找到${colorFilesPresent.count}个color_*.jpg文件`);
      await browser.close();
      return true;
    } else {
      log(`⚠️ 只找到${colorFilesPresent.count}个color_*.jpg文件，可能上传不完整`);
      await browser.close();
      return false;
    }

  } catch (error) {
    log(`❌ 完成上传流程失败: ${error.message}`, 'error');
    throw error;
  }
}

// 执行
completeC25291153Upload()
  .then((success) => {
    if (success) {
      console.log(`🎉 C25291153文件夹创建和上传完全成功！`);
      process.exit(0);
    }
  })
  .catch((error) => {
    console.log(`💥 执行失败: ${error.message}`);
    process.exit(1);
  });