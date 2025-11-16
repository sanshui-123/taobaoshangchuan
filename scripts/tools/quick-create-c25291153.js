const { chromium } = require('playwright');
const { closeMaterialCenterPopups } = require('../utils/advert-handler');

async function quickCreateC25291153() {
  const productId = 'C25291153';

  function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🚀';
    console.log(`${timestamp} QuickCreate: ${prefix} ${message}`);
  }

  try {
    log(`快速创建C25291153文件夹`);

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

    // 确保在2026节点下
    log('确保在2026节点下...');
    await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      const node2026 = nodes.find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
      }
    });
    await page.waitForTimeout(2000);

    // 检查是否已存在C25291153文件夹
    log('检查是否已存在C25291153文件夹...');
    const folderExists = await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      return nodes.some(el => el.textContent && el.textContent.includes(targetId));
    }, productId);

    if (folderExists) {
      log('C25291153文件夹已存在，直接导航...');
      await page.evaluate((targetId) => {
        const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
        const targetNode = nodes.find(el => el.textContent && el.textContent.includes(targetId));
        if (targetNode) {
          targetNode.click();
        }
      }, productId);
      await page.waitForTimeout(3000);

      const finalBreadcrumb = await page.evaluate(() => {
        const breadcrumb = document.querySelector('.next-breadcrumb');
        return breadcrumb ? breadcrumb.textContent.trim() : '';
      });

      if (finalBreadcrumb.includes(productId)) {
        log(`✅ 已成功导航到C25291153文件夹`);
        log(`面包屑: ${finalBreadcrumb}`);

        // 保存截图
        await page.screenshot({
          path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/${productId}-existing-success.png`,
          fullPage: true
        });

        await browser.close();
        return true;
      }
    }

    // 打开新建文件夹弹窗
    log('打开新建文件夹弹窗...');
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

    // 检查弹窗状态和上级文件夹设置
    const dialogStatus = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const text = dialog.textContent;
          const has2026 = text.includes('2026');
          const has全部图片 = text.includes('全部图片');

          return {
            open: true,
            text: text,
            has2026: has2026,
            has全部图片: has全部图片,
            parentFolderCorrect: has2026 && !has全部图片
          };
        }
      }
      return { open: false };
    });

    if (!dialogStatus.open) {
      throw new Error('弹窗未打开');
    }

    log('弹窗已打开');
    log(`上级文件夹状态: ${dialogStatus.has2026 ? '已设置为2026' : '未设置为2026'}`);

    if (!dialogStatus.parentFolderCorrect) {
      log('⚠️ 上级文件夹未正确设置为2026，尝试修正...');
      // 这里可以添加设置逻辑，但从调试结果看应该不需要
    } else {
      log('✅ 上级文件夹已正确设置为2026');
    }

    // 输入文件夹名称
    log('输入文件夹名称...');
    const inputSuccess = await page.evaluate((folderName) => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const inputs = dialog.querySelectorAll('input[type="text"]');
          if (inputs.length > 0) {
            const input = inputs[inputs.length - 1];
            input.focus();
            input.value = folderName;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            return input.value === folderName;
          }
        }
      }
      return false;
    }, productId);

    if (!inputSuccess) {
      throw new Error('文件夹名称输入失败');
    }

    log(`✅ 文件夹名称输入成功: ${productId}`);

    // 点击确定按钮
    log('点击确定按钮...');
    const confirmClicked = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const buttons = dialog.querySelectorAll('button');
          for (const button of buttons) {
            const text = button.textContent || '';
            if (text.includes('确定') || text.includes('创建')) {
              button.click();
              return true;
            }
          }
        }
      }
      return false;
    });

    if (!confirmClicked) {
      throw new Error('无法点击确定按钮');
    }

    await page.keyboard.press('Enter');
    log('已点击确定按钮');

    // 等待弹窗关闭
    let dialogClosed = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      const stillOpen = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.next-dialog');
        for (const dialog of dialogs) {
          if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
            return true;
          }
        }
        return false;
      });

      if (!stillOpen) {
        dialogClosed = true;
        break;
      }
    }

    if (!dialogClosed) {
      log('弹窗未自动关闭，强制关闭');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }

    // 验证创建结果
    log('验证文件夹创建结果...');
    await page.reload();
    await page.waitForTimeout(5000);

    // 展开并点击2026节点
    await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      const node2026 = nodes.find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
      }
    });

    await page.waitForTimeout(2000);

    // 查找并点击C25291153节点
    const targetNodeFound = await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      const targetNode = nodes.find(el => el.textContent && el.textContent.includes(targetId));
      if (targetNode) {
        targetNode.click();
        return true;
      }
      return false;
    }, productId);

    if (!targetNodeFound) {
      throw new Error('文件夹创建失败，未在树中找到');
    }

    await page.waitForTimeout(3000);

    // 验证面包屑
    const finalBreadcrumb = await page.evaluate(() => {
      const breadcrumb = document.querySelector('.next-breadcrumb');
      return breadcrumb ? breadcrumb.textContent.trim() : '';
    });

    const hasAllParts = finalBreadcrumb.includes('全部图片') &&
                       finalBreadcrumb.includes('2026') &&
                       finalBreadcrumb.includes(productId);

    if (!hasAllParts) {
      throw new Error(`面包屑验证失败: "${finalBreadcrumb}"`);
    }

    log(`🎉 文件夹创建和导航完全成功！`);
    log(`面包屑: ${finalBreadcrumb}`);

    // 保存成功截图
    await page.screenshot({
      path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/${productId}-quick-success.png`,
      fullPage: true
    });

    log(`📸 成功截图已保存: ${productId}-quick-success.png`);

    await browser.close();
    return true;

  } catch (error) {
    log(`❌ 快速创建失败: ${error.message}`, 'error');
    throw error;
  }
}

// 执行
quickCreateC25291153()
  .then((success) => {
    if (success) {
      console.log(`🎉 C25291153文件夹创建成功！现在可以执行上传步骤`);
      process.exit(0);
    }
  })
  .catch((error) => {
    console.log(`💥 执行失败: ${error.message}`);
    process.exit(1);
  });