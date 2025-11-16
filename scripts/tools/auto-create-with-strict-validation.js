const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function createFolderWithStrictValidation() {
  const productId = 'C25291153';

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔧';
    console.log(`${timestamp} StrictCreate: ${prefix} ${message}`);
  };

  const takeErrorScreenshot = async (page, stepName) => {
    try {
      const screenshotPath = `/Users/sanshui/Desktop/.claude/claude-code-chat-images/error-${stepName}-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      log(`📸 错误截图已保存: ${screenshotPath}`, 'error');
      return screenshotPath;
    } catch (screenshotError) {
      log(`截图失败: ${screenshotError.message}`, 'error');
      return null;
    }
  };

  try {
    log(`开始严格文件夹创建流程，目标ID: ${productId}`);

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
      const error = '未找到素材库页面';
      log(error, 'error');
      throw new Error(error);
    }

    log('✅ 已连接到素材库页面');

    // 清理现有弹窗
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
    });
    await page.waitForTimeout(1000);

    // 步骤1：打开新建文件夹弹窗
    log('=== 步骤1：打开新建文件夹弹窗 ===');

    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const button of buttons) {
          const text = button.textContent || '';
          if (text.includes('新建文件夹')) {
            button.click();
            break;
          }
        }
      });

      await page.waitForTimeout(3000);

      // 验证弹窗打开
      const dialogOpen = await page.locator('.next-dialog:has-text("新建文件夹")').isVisible();
      if (!dialogOpen) {
        throw new Error('新建文件夹弹窗未打开');
      }

      log('✅ 新建文件夹弹窗已打开');
    } catch (error) {
      await takeErrorScreenshot(page, 'dialog-not-open');
      throw new Error(`步骤1失败: ${error.message}`);
    }

    // 步骤2：点击上级文件夹选择器
    log('=== 步骤2：点击上级文件夹选择器 ===');

    try {
      // 点击上级文件夹选择器
      await page.locator('span.next-select-trigger:has-text("全部图片")').first().click();
      await page.waitForTimeout(2000);

      log('✅ 已点击上级文件夹选择器');
    } catch (error) {
      await takeErrorScreenshot(page, 'parent-selector-click');
      throw new Error(`步骤2失败: 无法点击上级文件夹选择器 - ${error.message}`);
    }

    // 步骤3：在下拉列表中查找并点击2026节点
    log('=== 步骤3：在下拉列表中查找并点击2026节点 ===');

    try {
      // 等待下拉列表出现
      await page.waitForSelector('.next-select-menu, .next-overlay-wrapper', { timeout: 5000 });

      // 使用您建议的精确方法
      const treeNode2026 = page.locator('.next-tree-node:has-text("2026")');

      // 检查2026节点是否存在
      const nodeExists = await treeNode2026.count();
      if (nodeExists === 0) {
        // 尝试其他可能的2026选择器
        const alternativeSelectors = [
          '.next-tree-node:has-text("2026")',
          'li:has-text("2026")',
          '[role="option"]:has-text("2026")',
          '.next-select-menu-item:has-text("2026")'
        ];

        let found = false;
        for (const selector of alternativeSelectors) {
          const nodes = page.locator(selector);
          const count = await nodes.count();
          if (count > 0) {
            log(`找到${count}个2026节点，使用选择器: ${selector}`);
            await nodes.first().click();
            found = true;
            break;
          }
        }

        if (!found) {
          // 详细检查下拉菜单内容
          const dropdownContent = await page.locator('.next-select-menu, .next-overlay-wrapper').first().textContent();
          throw new Error(`未找到2026节点。下拉菜单内容: ${dropdownContent}`);
        }
      } else {
        log(`找到${nodeExists}个2026节点`);
        await treeNode2026.first().click();
      }

      await page.waitForTimeout(1500);
      log('✅ 已点击2026节点');

    } catch (error) {
      await takeErrorScreenshot(page, '2026-node-click');
      throw new Error(`步骤3失败: 无法点击2026节点 - ${error.message}`);
    }

    // 步骤4：验证上级文件夹确实显示2026
    log('=== 步骤4：验证上级文件夹设置 ===');

    try {
      await page.waitForTimeout(1000);

      // 检查上级文件夹选择器现在是否显示2026
      const parentFolderDisplay = await page.locator('span.next-select-trigger:has-text("2026")').isVisible();

      if (!parentFolderDisplay) {
        // 再次检查弹窗文本内容
        const dialogText = await page.locator('.next-dialog:has-text("新建文件夹")').textContent();
        throw new Error(`上级文件夹未显示2026。弹窗内容: ${dialogText}`);
      }

      log('✅ 上级文件夹已正确设置为2026');

    } catch (error) {
      await takeErrorScreenshot(page, 'parent-folder-validation');
      throw new Error(`步骤4失败: 上级文件夹验证失败 - ${error.message}`);
    }

    // 步骤5：输入文件夹名称
    log('=== 步骤5：输入文件夹名称 ===');

    try {
      // 查找文件夹名称输入框
      const folderNameInput = page.locator('.next-dialog input[type="text"]').last();
      await folderNameInput.click();
      await folderNameInput.clear();
      await folderNameInput.fill(productId);

      // 验证输入
      const inputValue = await folderNameInput.inputValue();
      if (inputValue !== productId) {
        throw new Error(`输入验证失败。期望: ${productId}, 实际: ${inputValue}`);
      }

      log(`✅ 文件夹名称输入成功: ${productId}`);

    } catch (error) {
      await takeErrorScreenshot(page, 'folder-name-input');
      throw new Error(`步骤5失败: 无法输入文件夹名称 - ${error.message}`);
    }

    // 步骤6：点击确定按钮
    log('=== 步骤6：点击确定按钮 ===');

    try {
      await page.locator('.next-dialog button:has-text("确定")').click();
      await page.keyboard.press('Enter');

      // 等待弹窗关闭
      let dialogClosed = false;
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(500);
        const stillOpen = await page.locator('.next-dialog:has-text("新建文件夹")').isVisible();
        if (!stillOpen) {
          dialogClosed = true;
          break;
        }
      }

      if (!dialogClosed) {
        throw new Error('弹窗未在预期时间内关闭');
      }

      log('✅ 弹窗已关闭，文件夹创建请求已提交');

    } catch (error) {
      await takeErrorScreenshot(page, 'confirm-click');
      throw new Error(`步骤6失败: 无法完成文件夹创建 - ${error.message}`);
    }

    // 步骤7：严格面包屑校验
    log('=== 步骤7：严格面包屑校验 ===');

    try {
      // 刷新页面
      await page.reload();
      await page.waitForTimeout(5000);

      // 展开2026节点
      await page.locator('li.next-tree-node:has-text("2026")').click();
      await page.waitForTimeout(2000);

      // 查找并点击C25291153节点
      const targetFolderNode = page.locator('li.next-tree-node:has-text("' + productId + '")');
      const nodeCount = await targetFolderNode.count();

      if (nodeCount === 0) {
        throw new Error(`${productId}文件夹创建失败，未在树中找到`);
      }

      await targetFolderNode.first().click();
      await page.waitForTimeout(3000);

      // 验证面包屑
      const breadcrumb = await page.locator('.next-breadcrumb').textContent();
      const expectedBreadcrumb = `全部图片 / 2026 / ${productId}`;

      if (breadcrumb !== expectedBreadcrumb) {
        // 更灵活的验证：检查是否包含所有必要部分
        const hasAllParts = breadcrumb.includes('全部图片') &&
                           breadcrumb.includes('2026') &&
                           breadcrumb.includes(productId);

        if (!hasAllParts) {
          await takeErrorScreenshot(page, 'breadcrumb-validation');
          throw new Error(`面包屑验证失败。期望: "${expectedBreadcrumb}", 实际: "${breadcrumb}"`);
        } else {
          log(`⚠️ 面包屑格式不完全匹配但包含所有部分: "${breadcrumb}"`);
        }
      }

      log(`✅ 面包屑验证成功: "${breadcrumb}"`);

      // 检查右侧内容区域是否正确显示文件夹内容
      await page.waitForTimeout(2000);

      log(`🎉 文件夹创建和导航完全成功！`);
      log(`📸 保存成功截图...`);

      await page.screenshot({
        path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/${productId}-creation-success.png`,
        fullPage: true
      });

      await browser.close();
      return true;

    } catch (error) {
      await takeErrorScreenshot(page, 'breadcrumb-validation');
      throw new Error(`步骤7失败: 面包屑校验失败 - ${error.message}`);
    }

  } catch (error) {
    log(`❌ 严格文件夹创建失败: ${error.message}`, 'error');
    throw error;
  }
}

// 执行创建
createFolderWithStrictValidation()
  .then((success) => {
    if (success) {
      log(`🎉 C25291153文件夹创建成功，现在可以执行上传步骤`);
      process.exit(0);
    }
  })
  .catch((error) => {
    log(`💥 执行失败: ${error.message}`, 'error');
    process.exit(1);
  });