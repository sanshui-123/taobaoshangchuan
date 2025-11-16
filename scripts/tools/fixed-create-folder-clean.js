const { chromium } = require('playwright');
const { closeMaterialCenterPopups } = require('../utils/advert-handler');

async function createFolderClean() {
  const productId = 'C25291153';

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔧';
    console.log(`${timestamp} CleanCreate: ${prefix} ${message}`);
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
    log(`开始清洁版文件夹创建流程，目标ID: ${productId}`);

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

    log('已连接到素材库页面');

    // 关键步骤：彻底移除搜索面板
    log('=== 关键步骤：彻底移除搜索面板 ===');

    try {
      const result = await closeMaterialCenterPopups(page, {
        forceRemoveSearchPanel: true,
        keepSearchPanelAlive: true
      });

      log(`搜索面板清理完成，共关闭${result.totalClosed}个元素`);

      // 确认搜索面板已被移除
      const searchPanelExists = await page.locator('#qnworkbench_search_panel').count();
      if (searchPanelExists > 0) {
        // 如果还存在，强制移除
        await page.evaluate(() => {
          const panel = document.querySelector('#qnworkbench_search_panel');
          if (panel) panel.remove();
        });
        log('强制移除了残留的搜索面板');
      }

      log('确认搜索面板已完全移除');

    } catch (error) {
      await takeErrorScreenshot(page, 'search-panel-removal');
      throw new Error(`搜索面板移除失败: ${error.message}`);
    }

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

      log('新建文件夹弹窗已打开');
    } catch (error) {
      await takeErrorScreenshot(page, 'dialog-not-open');
      throw new Error(`步骤1失败: ${error.message}`);
    }

    // 步骤2：点击弹窗内的上级文件夹输入框
    log('=== 步骤2：点击弹窗内的上级文件夹输入框 ===');

    try {
      // 定位弹窗
      const dialog = page.locator('.next-dialog:has-text("新建文件夹")');

      // 点击弹窗内的上级文件夹选择器
      await dialog.locator('span.next-select-trigger:has-text("全部图片")').first().click();
      await page.waitForTimeout(2000);

      log('已点击弹窗内的上级文件夹选择器');

    } catch (error) {
      await takeErrorScreenshot(page, 'parent-selector-click');
      throw new Error(`步骤2失败: 无法点击上级文件夹选择器 - ${error.message}`);
    }

    // 步骤3：在弹出的树列表中查找并点击2026
    log('=== 步骤3：在弹出的树列表中查找并点击2026 ===');

    try {
      // 定位弹窗内的树结构
      const dialog = page.locator('.next-dialog:has-text("新建文件夹")');

      // 等待树列表出现
      await dialog.locator('.next-tree').waitFor({ timeout: 5000 });

      // 必要时先滚动到顶部
      try {
        await dialog.locator('.next-tree-content').evaluate(el => el.scrollTop = 0);
        await page.waitForTimeout(500);
      } catch (scrollError) {
        log(`滚动到顶部失败，继续执行: ${scrollError.message}`, 'warning');
      }

      // 查找2026节点并点击
      const node2026 = dialog.locator('.next-tree-node:has-text("2026")');
      const nodeCount = await node2026.count();

      if (nodeCount === 0) {
        // 尝试滚动查找
        try {
          await dialog.locator('.next-tree-content').evaluate(el => el.scrollTop = el.scrollHeight);
          await page.waitForTimeout(1000);
        } catch (scrollError) {
          log(`滚动到底部失败: ${scrollError.message}`, 'warning');
        }

        // 再次检查
        const nodeCountAfterScroll = await node2026.count();
        if (nodeCountAfterScroll === 0) {
          // 输出调试信息
          const treeContent = await dialog.locator('.next-tree').textContent();
          throw new Error(`未找到2026节点。树内容: ${treeContent.substring(0, 200)}...`);
        }
      }

      log(`找到${nodeCount}个2026节点，点击第一个`);

      // 使用用户建议的方法：点击父级元素
      await dialog.locator('.next-tree-node:has-text("2026") >> ..').first().click();
      await page.waitForTimeout(1500);

      log('已点击2026节点');

    } catch (error) {
      await takeErrorScreenshot(page, '2026-node-click');
      throw new Error(`步骤3失败: ${error.message}`);
    }

    // 步骤4：确认选择框显示为2026
    log('=== 步骤4：确认选择框显示为2026 ===');

    try {
      const dialog = page.locator('.next-dialog:has-text("新建文件夹")');

      // 检查上级文件夹选择器是否显示2026
      const parentFolderDisplay = await dialog.locator('span.next-select-trigger:has-text("2026")').isVisible();

      if (!parentFolderDisplay) {
        // 获取当前显示的文本
        const currentDisplay = await dialog.locator('span.next-select-trigger').first().textContent();
        throw new Error(`上级文件夹未显示2026，当前显示: "${currentDisplay}"`);
      }

      log('上级文件夹已正确设置为2026');

    } catch (error) {
      await takeErrorScreenshot(page, 'parent-folder-validation');
      throw new Error(`步骤4失败: ${error.message}`);
    }

    // 步骤5：输入文件夹名称
    log('=== 步骤5：输入文件夹名称 ===');

    try {
      const dialog = page.locator('.next-dialog:has-text("新建文件夹")');

      // 查找文件夹名称输入框
      const folderNameInput = dialog.locator('input[type="text"]').last();
      await folderNameInput.click();
      await folderNameInput.clear();
      await folderNameInput.fill(productId);

      // 验证输入
      const inputValue = await folderNameInput.inputValue();
      if (inputValue !== productId) {
        throw new Error(`输入验证失败。期望: ${productId}, 实际: ${inputValue}`);
      }

      log(`文件夹名称输入成功: ${productId}`);

    } catch (error) {
      await takeErrorScreenshot(page, 'folder-name-input');
      throw new Error(`步骤5失败: ${error.message}`);
    }

    // 步骤6：点击确定按钮
    log('=== 步骤6：点击确定按钮 ===');

    try {
      const dialog = page.locator('.next-dialog:has-text("新建文件夹")');

      await dialog.locator('button:has-text("确定")').click();
      await page.keyboard.press('Enter');

      // 等待弹窗关闭
      let dialogClosed = false;
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(500);
        const stillOpen = await dialog.isVisible();
        if (!stillOpen) {
          dialogClosed = true;
          break;
        }
      }

      if (!dialogClosed) {
        throw new Error('弹窗未在预期时间内关闭');
      }

      log('弹窗已关闭，文件夹创建请求已提交');

    } catch (error) {
      await takeErrorScreenshot(page, 'confirm-click');
      throw new Error(`步骤6失败: ${error.message}`);
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
          log(`面包屑格式不完全匹配但包含所有部分: "${breadcrumb}"`, 'warning');
        }
      }

      log(`面包屑验证成功: "${breadcrumb}"`);

      // 保存成功截图
      await page.screenshot({
        path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/${productId}-creation-success.png`,
        fullPage: true
      });

      log(`文件夹创建和导航完全成功！`);

      await browser.close();
      return true;

    } catch (error) {
      await takeErrorScreenshot(page, 'breadcrumb-validation');
      throw new Error(`步骤7失败: ${error.message}`);
    }

  } catch (error) {
    log(`清洁版文件夹创建失败: ${error.message}`, 'error');
    throw error;
  }
}

// 执行创建
createFolderClean()
  .then((success) => {
    if (success) {
      log(`C25291153文件夹创建成功，现在可以执行上传步骤`);
      process.exit(0);
    }
  })
  .catch((error) => {
    log(`执行失败: ${error.message}`, 'error');
    process.exit(1);
  });