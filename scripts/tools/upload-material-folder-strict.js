const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function uploadMaterialFolderStrict() {
  const productId = process.argv.find(arg => arg.startsWith('--product='))?.split('=')[1] || 'C25291153';
  const verbose = process.argv.includes('--verbose');

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '📋';
    console.log(`${timestamp} StrictUpload: ${prefix} ${message}`);
  };

  const throwOnError = (message) => {
    log(`ERROR: ${message}`, 'error');
    throw new Error(message);
  };

  try {
    log(`开始严格上传流程，商品ID: ${productId}`);
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

    if (!page) throwOnError('未找到素材库页面');
    log('已连接到素材库页面');

    // 步骤1：清理所有弹窗
    log('清理所有弹窗');
    await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog, .next-overlay-wrapper');
      dialogs.forEach(dialog => {
        const style = window.getComputedStyle(dialog);
        if (style.display !== 'none') {
          dialog.style.display = 'none';
        }
      });
    });

    // 步骤2：强制关闭搜索面板
    log('强制关闭搜索面板');
    await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if (el.textContent && el.textContent.includes('如何设置电子发票')) {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
        }
      }
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
    });

    await page.waitForTimeout(2000);

    // 步骤3：左侧树展开2026
    log('展开2026节点');
    await page.evaluate(() => {
      const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
        .find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
      }
    });

    await page.waitForTimeout(1000);

    // 步骤4：严格点击C25291153节点并验证面包屑
    log(`开始严格导航到${productId}节点`);

    let navigationSuccess = false;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      log(`第${attempt}次尝试导航到${productId}`);

      // 点击目标节点
      const nodeClicked = await page.evaluate((targetId) => {
        const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
        const targetNode = nodes.find(el => el.textContent && el.textContent.includes(targetId));
        if (targetNode) {
          targetNode.click();
          return true;
        }
        return false;
      }, productId);

      if (!nodeClicked) {
        log(`第${attempt}次：未找到${productId}节点`);
        continue;
      }

      log(`第${attempt}次：已点击${productId}节点`);

      // 等待面包屑更新
      await page.waitForTimeout(2000);

      // 严格检查面包屑
      const currentBreadcrumb = await page.evaluate(() => {
        const breadcrumb = document.querySelector('.next-breadcrumb');
        return breadcrumb ? breadcrumb.textContent.trim() : '';
      });

      log(`第${attempt}次：当前面包屑 - ${currentBreadcrumb}`);

      // 严格验证：必须包含目标ID
      if (currentBreadcrumb.includes(productId)) {
        log(`✅ 第${attempt}次：面包屑验证成功，包含${productId}`, 'success');
        navigationSuccess = true;
        break;
      } else {
        log(`⚠️ 第${attempt}次：面包屑验证失败，不包含${productId}`);

        if (attempt === maxAttempts) {
          throwOnError(`经过${maxAttempts}次尝试，面包屑仍不包含${productId}，当前: ${currentBreadcrumb}`);
        }

        // 继续下一次尝试前再次展开2026
        log('重新展开2026节点');
        await page.evaluate(() => {
          const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
            .find(el => el.textContent && el.textContent.includes('2026'));
          if (node2026) {
            node2026.click();
          }
        });
        await page.waitForTimeout(1000);
      }
    }

    if (!navigationSuccess) {
      throwOnError(`无法导航到${productId}文件夹`);
    }

    // 步骤5：点击上传文件
    log('点击上传文件按钮');
    const uploadButton = await page.$('button:has-text("上传文件")');
    if (uploadButton) {
      await uploadButton.click();
      log('点击上传文件按钮成功', 'success');
    } else {
      throwOnError('未找到上传文件按钮');
    }

    // 步骤6：等待文件选择器并上传
    log('等待文件选择器...');
    await page.waitForTimeout(3000);

    const fileInput = await page.evaluateHandle(() => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        const dialog = input.closest('.next-dialog');
        if (dialog && dialog.textContent.includes('上传素材')) {
          return input;
        }
      }
      return null;
    });

    if (fileInput) {
      const imagePath = `/Users/sanshui/Desktop/tbzhuaqu/assets/${productId}`;
      const files = fs.readdirSync(imagePath).filter(f => f.startsWith('color_') && f.endsWith('.jpg'));

      if (files.length === 0) throwOnError(`未找到${productId}的color_*.jpg文件`);

      log(`找到${files.length}个图片文件，开始上传`);

      // 上传前5个文件进行测试
      const uploadFiles = files.slice(0, 5);
      await fileInput.setInputFiles(uploadFiles.map(f => path.join(imagePath, f)));
      log('文件已选择，等待上传完成');

      // 等待上传完成
      log('等待10秒让上传完成...');
      await page.waitForTimeout(10000);
    } else {
      throwOnError('未找到文件输入框');
    }

    // 步骤7：刷新页面并验证上传结果
    log('刷新页面验证上传结果');
    await page.reload();
    await page.waitForTimeout(5000);

    // 重新导航到${productId}
    log(`刷新后重新导航到${productId}`);

    // 再次展开2026
    await page.evaluate(() => {
      const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
        .find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
      }
    });

    await page.waitForTimeout(2000);

    // 再次点击目标节点
    const reNavigateSuccess = await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      const targetNode = nodes.find(el => el.textContent && el.textContent.includes(targetId));
      if (targetNode) {
        targetNode.click();
        return true;
      }
      return false;
    }, productId);

    if (!reNavigateSuccess) {
      throwOnError(`刷新后无法找到${productId}节点`);
    }

    await page.waitForTimeout(3000);

    // 最终验证面包屑
    const finalBreadcrumb = await page.evaluate(() => {
      const breadcrumb = document.querySelector('.next-breadcrumb');
      return breadcrumb ? breadcrumb.textContent.trim() : '';
    });

    log(`最终面包屑: ${finalBreadcrumb}`);

    if (!finalBreadcrumb.includes(productId)) {
      throwOnError(`刷新后面包屑不包含${productId}: ${finalBreadcrumb}`);
    }

    // 检查文件是否存在
    const fileCount = await page.evaluate(() => {
      const fileElements = document.querySelectorAll('.PicturesShow_PicturesShow_main-document, [class*="document"]');
      return fileElements.length;
    });

    log(`检测到${fileCount}个文件元素`);

    // 截图验证
    log('截图保存当前状态');
    await page.screenshot({
      path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/upload-result-${productId}.png`,
      fullPage: true
    });

    log(`✅ 严格上传流程完成，请查看截图: upload-result-${productId}.png`, 'success');

    await browser.close();
  } catch (error) {
    log(`流程失败: ${error.message}`, 'error');
    process.exit(1);
  }
}

uploadMaterialFolderStrict();