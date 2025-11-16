const { chromium } = require('playwright');

async function properFolderCreation() {
  const productId = 'C25291153';

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔧';
    console.log(`${timestamp} ProperFolder: ${prefix} ${message}`);
  };

  try {
    log(`开始正确的文件夹创建流程，目标ID: ${productId}`);
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
      log('未找到素材库页面');
      return;
    }

    log('已连接到素材库页面');

    // 清理弹窗
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
    });

    await page.waitForTimeout(1000);

    log('打开新建文件夹弹窗...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const button of buttons) {
        const text = button.textContent || '';
        if (text.includes('新建文件夹')) {
          button.click();
        }
      }
    });

    await page.waitForTimeout(3000);

    // 步骤1：检查上级文件夹并修复
    log('=== 步骤1：修复上级文件夹设置 ===');

    const parentFolderFixed = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          log('找到新建文件夹弹窗');

          // 查找上级文件夹选择器的所有可能元素
          const allElements = dialog.querySelectorAll('*');
          let folderSelector = null;

          for (const element of allElements) {
            const text = element.textContent || '';
            const classes = element.className || '';

            // 查找包含"全部图片"的可点击元素
            if ((text.includes('全部图片') || text.includes('上级文件夹')) &&
                (classes.includes('select') || classes.includes('input') ||
                 element.tagName === 'INPUT' || element.role === 'combobox')) {
              folderSelector = element;
              log(`找到上级文件夹选择器: ${element.tagName}.${classes}`);
              break;
            }
          }

          if (folderSelector) {
            log('点击上级文件夹选择器...');
            folderSelector.click();

            // 等待下拉列表展开
            setTimeout(() => {
              // 查找2026选项并点击
              const options = document.querySelectorAll('li[role="option"], .next-tree-node, .next-select-menu-item');
              for (const option of options) {
                if (option.textContent && option.textContent.includes('2026')) {
                  log('找到并点击2026选项');
                  option.click();
                  return true;
                }
              }
              log('未找到2026选项');
            }, 500);

            return true;
          }
        }
      }
      return false;
    });

    if (parentFolderFixed) {
      log('✅ 已尝试修复上级文件夹设置');
    } else {
      log('⚠️ 无法找到上级文件夹选择器');
    }

    await page.waitForTimeout(2000);

    // 步骤2：验证上级文件夹是否正确
    log('=== 步骤2：验证上级文件夹设置 ===');

    const parentFolderVerified = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          // 检查是否显示2026
          const text = dialog.textContent;
          if (text.includes('2026')) {
            log('✅ 确认上级文件夹已设置为2026');
            return true;
          } else {
            log(`❌ 上级文件夹设置错误，当前内容: ${text}`);
            return false;
          }
        }
      }
      return false;
    });

    if (!parentFolderVerified) {
      log('❌ 上级文件夹设置验证失败，无法继续');
      throw new Error('上级文件夹必须设置为2026');
    }

    // 步骤3：输入文件夹名称
    log('=== 步骤3：输入文件夹名称 ===');

    const inputSuccess = await page.evaluate((folderName) => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const inputs = dialog.querySelectorAll('input[type="text"]');
          if (inputs.length > 0) {
            const input = inputs[0]; // 使用第一个输入框
            input.focus();
            input.select();
            input.value = folderName;

            // 触发各种事件确保输入被识别
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

            // 验证输入
            if (input.value === folderName) {
              log(`✅ 成功输入文件夹名称: ${folderName}`);
              return true;
            }
          }
        }
      }
      return false;
    }, productId);

    if (!inputSuccess) {
      throw new Error(`无法输入文件夹名称: ${productId}`);
    }

    // 步骤4：点击确定按钮并等待弹窗关闭
    log('=== 步骤4：点击确定按钮并关闭弹窗 ===');

    await page.evaluate(() => {
      const buttons = document.querySelectorAll('.next-dialog button');
      for (const button of buttons) {
        const text = button.textContent || '';
        if (text.includes('确定') || text.includes('创建')) {
          log('找到确定按钮并点击');
          button.click();
          break;
        }
      }
    });

    // 按回车确保
    await page.keyboard.press('Enter');
    log('按回车键确认');

    // 等待弹窗关闭，最多等待10秒
    log('等待弹窗关闭...');
    let dialogClosed = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      const stillOpen = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.next-dialog');
        return Array.from(dialogs).some(dialog =>
          dialog.textContent && dialog.textContent.includes('新建文件夹')
        );
      });

      if (!stillOpen) {
        dialogClosed = true;
        log('✅ 弹窗已关闭');
        break;
      }
    }

    if (!dialogClosed) {
      log('⚠️ 弹窗未自动关闭，强制关闭');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }

    // 步骤5：验证文件夹创建成功
    log('=== 步骤5：验证文件夹创建成功 ===');

    // 刷新页面
    await page.reload();
    await page.waitForTimeout(5000);

    // 展开2026节点
    await page.evaluate(() => {
      const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
        .find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
        log('点击2026节点展开');
      }
    });

    await page.waitForTimeout(2000);

    // 检查文件夹是否存在
    const folderExists = await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      return nodes.some(el => el.textContent && el.textContent.includes(targetId));
    }, productId);

    if (folderExists) {
      log(`🎉 文件夹创建成功！${productId}文件夹已创建在2026节点下`);

      // 导航到文件夹
      await page.evaluate((targetId) => {
        const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
        const targetNode = nodes.find(el => el.textContent && el.textContent.includes(targetId));
        if (targetNode) {
          targetNode.click();
          log(`点击${targetId}节点`);
        }
      }, productId);

      await page.waitForTimeout(3000);

      // 检查面包屑
      const breadcrumb = await page.evaluate(() => {
        const breadcrumb = document.querySelector('.next-breadcrumb');
        return breadcrumb ? breadcrumb.textContent.trim() : '';
      });

      log(`最终面包屑: ${breadcrumb}`);

      if (breadcrumb.includes('2026') && breadcrumb.includes(productId)) {
        log(`🎉 面包屑验证成功！文件夹创建和导航都正确`);

        // 截图保存
        await page.screenshot({
          path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/${productId}-proper-creation.png`,
          fullPage: true
        });

        log(`📸 截图已保存: ${productId}-proper-creation.png`);
        log(`✅ 正确的文件夹创建完全成功！现在可以开始上传步骤了`);
        return true;
      } else {
        log(`❌ 面包屑验证失败: ${breadcrumb}`);
        return false;
      }
    } else {
      throw new Error(`${productId}文件夹创建失败`);
    }

    await browser.close();
  } catch (error) {
    log(`正确的文件夹创建失败: ${error.message}`, 'error');
    process.exit(1);
  }
}

properFolderCreation();