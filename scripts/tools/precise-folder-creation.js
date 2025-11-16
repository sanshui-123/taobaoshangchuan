const { chromium } = require('playwright');

async function preciseFolderCreation() {
  const productId = 'C25291153';

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔧';
    console.log(`${timestamp} PreciseFolder: ${prefix} ${message}`);
  };

  try {
    log(`开始精确文件夹创建流程，目标ID: ${productId}`);
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

    // 步骤1：详细分析弹窗结构
    log('=== 步骤1：分析弹窗结构 ===');

    const dialogStructure = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const analysis = {
            fullText: dialog.textContent,
            elements: []
          };

          const allElements = dialog.querySelectorAll('*');
          for (const element of allElements) {
            const text = element.textContent || '';
            const tag = element.tagName;
            const className = element.className || '';
            const id = element.id || '';
            const rect = element.getBoundingClientRect();

            if ((text.includes('全部图片') || text.includes('上级文件夹') || text.includes('2026') ||
                 className.includes('select') || className.includes('input') || tag === 'INPUT') &&
                rect.width > 0 && rect.height > 0) {

              analysis.elements.push({
                tag,
                className,
                id,
                text: text.trim(),
                width: rect.width,
                height: rect.height,
                clickable: tag === 'INPUT' || tag === 'BUTTON' || className.includes('select')
              });
            }
          }

          return analysis;
        }
      }
      return null;
    });

    if (dialogStructure) {
      log('弹窗结构分析:');
      dialogStructure.elements.forEach((el, i) => {
        log(`  元素${i}: ${el.tag}.${el.className} - "${el.text}" (${el.width}x${el.height}) 可点击:${el.clickable}`);
      });
    }

    // 步骤2：找到并点击上级文件夹选择器
    log('=== 步骤2：设置上级文件夹为2026 ===');

    const parentFolderSet = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {

          // 查找所有包含"全部图片"的可点击元素
          const clickableElements = dialog.querySelectorAll('input, .next-input, .next-select, [role="combobox"], div');

          for (const element of clickableElements) {
            const text = element.textContent || '';
            const className = element.className || '';

            // 查找上级文件夹的输入框或选择器
            if ((text.includes('全部图片') ||
                 className.includes('input') ||
                 className.includes('select') ||
                 element.tagName === 'INPUT') &&
                element.offsetWidth > 0 && element.offsetHeight > 0) {

              console.log(`找到上级文件夹选择器: ${element.tagName}.${className}`);

              // 点击打开下拉列表
              element.click();

              // 等待下拉列表展开
              setTimeout(() => {
                // 查找所有2026选项
                const options = document.querySelectorAll('li, div, [role="option"], .next-tree-node, .next-select-menu-item');
                for (const option of options) {
                  const optionText = option.textContent || '';
                  if (optionText.includes('2026') && option.offsetWidth > 0) {
                    console.log(`找到2026选项，点击: ${option.tagName}.${option.className}`);
                    option.click();
                    return true;
                  }
                }
                console.log('未找到2026选项');
                return false;
              }, 1000);

              return true;
            }
          }
        }
      }
      return false;
    });

    if (parentFolderSet) {
      log('✅ 已尝试设置上级文件夹为2026');
    } else {
      log('⚠️ 无法找到上级文件夹选择器');
    }

    await page.waitForTimeout(3000); // 等待更长时间让选择生效

    // 步骤3：验证上级文件夹设置
    log('=== 步骤3：验证上级文件夹设置 ===');

    const verification = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const text = dialog.textContent;
          console.log(`当前弹窗文本: ${text}`);

          // 检查是否同时包含"2026"和"全部图片"
          const has2026 = text.includes('2026');
          const hasAllImages = text.includes('全部图片');

          if (has2026 && !hasAllImages) {
            console.log('✅ 上级文件夹已正确设置为2026');
            return { success: true, reason: '上级文件夹已正确设置为2026' };
          } else if (has2026 && hasAllImages) {
            console.log('⚠️ 同时显示2026和全部图片，需要检查');
            return { success: false, reason: '同时显示2026和全部图片' };
          } else if (hasAllImages && !has2026) {
            console.log('❌ 仍显示全部图片，未设置成功');
            return { success: false, reason: '仍显示全部图片' };
          } else {
            console.log('❌ 未检测到预期的上级文件夹显示');
            return { success: false, reason: '未检测到预期的上级文件夹显示' };
          }
        }
      }
      return { success: false, reason: '未找到弹窗' };
    });

    log(`验证结果: ${verification.reason}`);

    if (!verification.success) {
      log('⚠️ 上级文件夹设置验证失败，但继续尝试创建文件夹');
    }

    // 步骤4：输入文件夹名称
    log('=== 步骤4：输入文件夹名称 ===');

    const inputSuccess = await page.evaluate((folderName) => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          // 查找所有输入框
          const inputs = dialog.querySelectorAll('input[type="text"], input');
          console.log(`找到${inputs.length}个输入框`);

          for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            console.log(`尝试输入框${i}: placeholder="${input.placeholder}" value="${input.value}"`);

            if (input.offsetWidth > 0 && input.offsetHeight > 0) {
              input.focus();
              input.select();
              input.value = folderName;

              // 触发各种事件
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
              input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

              // 验证输入
              if (input.value === folderName) {
                console.log(`✅ 输入框${i}成功输入: ${folderName}`);
                return true;
              } else {
                console.log(`❌ 输入框${i}输入失败，当前值: ${input.value}`);
              }
            }
          }
        }
      }
      return false;
    }, productId);

    if (!inputSuccess) {
      throw new Error(`无法输入文件夹名称: ${productId}`);
    }

    log(`✅ 成功输入文件夹名称: ${productId}`);

    // 步骤5：点击确定按钮
    log('=== 步骤5：点击确定按钮 ===');

    await page.evaluate(() => {
      const buttons = document.querySelectorAll('.next-dialog button');
      for (const button of buttons) {
        const text = button.textContent || '';
        console.log(`找到按钮: "${text}"`);
        if (text.includes('确定') || text.includes('创建')) {
          console.log('点击确定按钮');
          button.click();
          break;
        }
      }
    });

    await page.keyboard.press('Enter');
    log('按回车键确认');

    // 等待弹窗关闭
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

    // 步骤6：验证创建结果
    log('=== 步骤6：验证文件夹创建结果 ===');

    await page.reload();
    await page.waitForTimeout(5000);

    // 展开2026并检查文件夹
    await page.evaluate(() => {
      const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
        .find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
      }
    });

    await page.waitForTimeout(2000);

    const folderExists = await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      return nodes.some(el => el.textContent && el.textContent.includes(targetId));
    }, productId);

    if (folderExists) {
      log(`🎉 文件夹创建成功！${productId}文件夹已创建`);

      // 导航到文件夹
      await page.evaluate((targetId) => {
        const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
        const targetNode = nodes.find(el => el.textContent && el.textContent.includes(targetId));
        if (targetNode) {
          targetNode.click();
        }
      }, productId);

      await page.waitForTimeout(3000);

      const breadcrumb = await page.evaluate(() => {
        const breadcrumb = document.querySelector('.next-breadcrumb');
        return breadcrumb ? breadcrumb.textContent.trim() : '';
      });

      log(`最终面包屑: ${breadcrumb}`);

      if (breadcrumb.includes('2026') && breadcrumb.includes(productId)) {
        log(`🎉 面包屑验证成功！`);

        await page.screenshot({
          path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/${productId}-precise-creation.png`,
          fullPage: true
        });

        log(`📸 截图已保存: ${productId}-precise-creation.png`);
        log(`✅ 精确文件夹创建完全成功！`);
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
    log(`精确文件夹创建失败: ${error.message}`, 'error');
    process.exit(1);
  }
}

preciseFolderCreation();