const { chromium } = require('playwright');

async function fixedFolderCreation() {
  const productId = 'C25291153';

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔧';
    console.log(`${timestamp} FixedFolder: ${prefix} ${message}`);
  };

  try {
    log(`开始修复版文件夹创建，目标ID: ${productId}`);
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

    // 详细的上级文件夹选择修复
    log('=== 修复上级文件夹选择 ===');

    // 查找并设置上级文件夹为2026
    const parentFolderFixed = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          // 方法1：查找上级文件夹选择器
          const selectors = [
            '.next-select',
            '[class*="select"]',
            '.next-tree-select',
            '[role="combobox"]',
            '.next-input'
          ];

          for (const selector of selectors) {
            const elements = dialog.querySelectorAll(selector);
            for (let i = 0; i < elements.length; i++) {
              const element = elements[i];
              const text = element.textContent || '';
              if (text.includes('全部图片') || text.includes('上级文件夹')) {
                // 尝试点击打开下拉列表
                element.click();
                // 等待下拉列表展开

                // 查找2026选项
                const options = document.querySelectorAll('li[role="option"], .next-tree-node');
                for (const option of options) {
                  if (option.textContent && option.textContent.includes('2026')) {
                    option.click();
                    return true;
                  }
                }
              }
            }
          }

          // 方法2：查找并点击上级文件夹文本框
          const allElements = dialog.querySelectorAll('*');
          for (const element of allElements) {
            const text = element.textContent || '';
            if ((text.includes('上级文件夹') || text.includes('所属上级文件夹')) &&
                element.tagName === 'DIV' && element.classList.contains('next-form-item')) {
              log('找到上级文件夹DIV元素');

              // 查找子元素中的输入框或选择器
              const childInputs = element.querySelectorAll('input, .next-select, [role="combobox"]');
              for (const child of childInputs) {
                child.click();
                // 等待下拉列表展开

                // 查找2026选项
                const options = document.querySelectorAll('li[role="option"], .next-tree-node');
                for (const option of options) {
                  if (option.textContent && option.textContent.includes('2026')) {
                    option.click();
                    return true;
                  }
                }
              }
            }
          }

          // 方法3：查找任何包含"全部图片"的可点击元素
          const clickableElements = dialog.querySelectorAll('div, span, li');
          for (const element of clickableElements) {
            const text = element.textContent || '';
            if (text.includes('全部图片') && element.classList.contains('next-tree-select')) {
              element.click();
              // 等待下拉列表展开

              // 查找2026选项
              const options = document.querySelectorAll('li[role="option"], .next-tree-node');
              for (const option of options) {
                if (option.textContent && option.textContent.includes('2026')) {
                  option.click();
                  return true;
                }
              }
            }
          }

          return false;
        }
      }
      return false;
    });

    if (parentFolderFixed) {
      log('✅ 上级文件夹已设置为2026');
    } else {
      log('⚠️ 无法自动设置上级文件夹，使用手动方法');
    }

    await page.waitForTimeout(1000);

    // 检查上级文件夹是否设置正确
    const parentFolderCheck = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          // 查找上级文件夹的当前选择
          const elements = dialog.querySelectorAll('*');
          for (const element of elements) {
            const text = element.textContent || '';
            if (text.includes('上级文件夹') && text.includes('2026')) {
              return true;
            }
          }
        }
      }
      return false;
    });

    if (parentFolderCheck) {
      log('✅ 确认上级文件夹已设置为2026');
    } else {
      log('⚠️ 上级文件夹设置验证失败，继续执行');
    }

    // 输入文件夹名称
    log(`输入文件夹名称: ${productId}`);
    const inputSuccess = await page.evaluate((folderName) => {
      const inputs = document.querySelectorAll('.next-dialog input[type="text"]');
      if (inputs.length > 0) {
        const input = inputs[0];
        input.focus();
        input.select();
        input.value = folderName;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return input.value === folderName;
      }
      return false;
    }, productId);

    if (!inputSuccess) {
      throw new Error(`无法输入文件夹名称: ${productId}`);
    }

    log(`✅ 成功输入: ${productId}`);

    // 点击确定按钮
    const confirmClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('.next-dialog button');
      for (const button of buttons) {
        const text = button.textContent || '';
        if (text.includes('确定') || text.includes('创建')) {
          button.click();
          return true;
        }
      }
      return false;
    });

    if (!confirmClicked) {
      throw new Error('无法点击确定按钮');
    }

    log('✅ 已点击确定按钮');

    // 按回车确认
    await page.keyboard.press('Enter');

    // 等待弹窗关闭
    let dialogClosed = false;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);
      const stillOpen = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.next-dialog');
        return Array.from(dialogs).some(dialog =>
          dialog.textContent && dialog.textContent.includes('新建文件夹')
        );
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

    log('✅ 弹窗已关闭');

    // 等待创建完成
    log('等待3秒让文件夹创建完成...');
    await page.waitForTimeout(3000);

    // 验证文件夹创建成功
    await page.reload();
    await page.waitForTimeout(5000);

    // 展开2026
    await page.evaluate(() => {
      const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
        .find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
      }
    });

    await page.waitForTimeout(2000);

    // 检查文件夹是否存在
    const folderExists = await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      return nodes.some(el => el.textContent && el.textContent.includes(targetId));
    }, productId);

    if (folderExists) {
      log(`🎉 修复版文件夹创建成功！${productId}文件夹已创建在2026节点下`);

      // 导航验证
      await page.evaluate((targetId) => {
        const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
        const targetNode = nodes.find(el => el.textContent && el.textContent.includes(targetId));
        if (targetNode) {
          targetNode.click();
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
          path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/${productId}-fixed-creation.png`,
          fullPage: true
        });

        log(`📸 截图已保存: ${productId}-fixed-creation.png`);
        log(`✅ 修复版文件夹创建完全成功！现在可以开始上传步骤了`);
      } else {
        log(`❌ 面包屑验证失败: ${breadcrumb}`);
      }
    } else {
      throw new Error(`${productId}文件夹创建失败`);
    }

    await browser.close();
  } catch (error) {
    log(`修复版文件夹创建失败: ${error.message}`, 'error');
    process.exit(1);
  }
}

fixedFolderCreation();