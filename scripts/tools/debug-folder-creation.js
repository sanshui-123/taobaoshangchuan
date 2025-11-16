const { chromium } = require('playwright');

async function debugFolderCreation() {
  const productId = 'C25291153';

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔍';
    console.log(`${timestamp} DebugFolder: ${prefix} ${message}`);
  };

  try {
    log(`开始调试文件夹创建流程，目标ID: ${productId}`);
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

    // 步骤1：清理弹窗
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
    });

    await page.waitForTimeout(1000);

    // 步骤2：详细检查弹窗内容
    log('点击新建文件夹按钮...');
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

    // 详细检查弹窗内容
    const dialogContent = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const text = dialog.textContent;
          return {
            fullText: text,
            innerHTML: dialog.innerHTML,
            visible: dialog.offsetParent !== null
          };
        }
      }
      return null;
    });

    if (dialogContent) {
      log('=== 弹窗详细内容 ===');
      log(`完整文本: ${dialogContent.fullText}`);
      log(`可见性: ${dialogContent.visible}`);

      // 检查输入框
      const inputDetails = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.next-dialog');
        for (const dialog of dialogs) {
          if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
            const inputs = dialog.querySelectorAll('input');
            const inputInfo = [];
            for (let i = 0; i < inputs.length; i++) {
              const input = inputs[i];
              inputInfo.push({
                index: i,
                type: input.type || '',
                value: input.value || '',
                placeholder: input.placeholder || '',
                visible: input.offsetParent !== null,
                className: input.className || ''
              });
            }
            return inputInfo;
          }
        }
        return [];
      });

      log('=== 输入框详细信息 ===');
      inputDetails.forEach(input => {
        log(`输入框${input.index}: type="${input.type}", value="${input.value}", visible=${input.visible}`);
      });

      // 检查默认的上级文件夹设置
      const parentFolder = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.next-dialog');
        for (const dialog of dialogs) {
          if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
            // 查找显示上级文件夹的元素
            const elements = dialog.querySelectorAll('*');
            for (const el of elements) {
              const text = el.textContent || '';
              if (text.includes('上级文件夹') || text.includes('2026')) {
                return {
                  element: el.tagName,
                  text: text.trim(),
                  className: el.className
                };
              }
            }
          }
        }
        return null;
      });

      if (parentFolder) {
        log('=== 上级文件夹设置 ===');
        log(`元素: ${parentFolder.element}`);
        log(`文本: ${parentFolder.text}`);
        log(`类名: ${parentFolder.className}`);
      }

      // 步骤3：更安全的输入方法
      log('开始更安全的输入...');
      const inputResult = await page.evaluate((folderName) => {
        const dialogs = document.querySelectorAll('.next-dialog');
        for (const dialog of dialogs) {
          if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
            const inputs = dialog.querySelectorAll('input');
            for (const input of inputs) {
              if (input.type === 'text' || input.type === '') {
                try {
                  // 清空并聚焦
                  input.focus();
                  input.select();

                  // 方法1：直接设置value
                  input.value = folderName;
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));

                  // 方法2：模拟键盘输入
                  input.value = '';
                  for (const char of folderName) {
                    const event = new KeyboardEvent('keydown', {
                      key: char,
                      code: `Key${char.toUpperCase()}`,
                      bubbles: true
                    });
                    input.dispatchEvent(event);
                  }

                  // 再次设置确保输入成功
                  input.value = folderName;

                  // 验证输入
                  if (input.value === folderName) {
                    return {
                      success: true,
                      value: input.value,
                      inputIndex: Array.from(dialog.querySelectorAll('input')).indexOf(input)
                    };
                  }
                } catch (e) {
                  log(`输入失败: ${e.message}`);
                }
              }
            }
          }
        }
        return { success: false };
      }, productId);

      if (inputResult.success) {
        log(`✅ 输入成功: value="${inputResult.value}"`);
        log(`输入框索引: ${inputResult.inputIndex}`);
      } else {
        log('❌ 输入失败');
      }

      // 步骤4：更详细的按钮检查
      const buttonDetails = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.next-dialog');
        for (const dialog of dialogs) {
          if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
            const buttons = dialog.querySelectorAll('button');
            const buttonInfo = [];
            for (let i = 0; i < buttons.length; i++) {
              const button = buttons[i];
              buttonInfo.push({
                index: i,
                text: button.textContent.trim(),
                disabled: button.disabled,
                visible: button.offsetParent !== null,
                className: button.className || ''
              });
            }
            return buttonInfo;
          }
        }
        return [];
      });

      log('=== 按钮详细信息 ===');
      buttonDetails.forEach(button => {
        log(`按钮${button.index}: "${button.text}", disabled=${button.disabled}, visible=${button.visible}`);
      });

      // 查找并点击确定按钮
      let confirmSuccess = false;
      for (let i = 0; i < buttonDetails.length; i++) {
        const button = buttonDetails[i];
        if (button.text.includes('确定') || button.text.includes('创建')) {
          log(`尝试点击按钮${button.index}: "${button.text}"`);

          const clicked = await page.evaluate((buttonIndex) => {
            const dialogs = document.querySelectorAll('.next-dialog');
            for (const dialog of dialogs) {
              if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
                const buttons = dialog.querySelectorAll('button');
                if (buttonIndex < buttons.length) {
                  const button = buttons[buttonIndex];
                  if (!button.disabled && button.offsetParent !== null) {
                    button.click();
                    return true;
                  }
                }
              }
            }
            return false;
          }, i);

          if (clicked) {
            log(`✅ 成功点击按钮${button.index}`);
            confirmSuccess = true;
            break;
          } else {
            log(`❌ 按钮${button.index}点击失败`);
          }
        }
      }

      if (!confirmSuccess) {
        log('❌ 无法点击任何确定/创建按钮');
      }

      // 按回车确保
      await page.keyboard.press('Enter');
      log('按回车键确认');

    } else {
      log('❌ 未找到新建文件夹弹窗');
    }

    await page.waitForTimeout(5000);

    // 最终状态检查
    log('=== 最终状态检查 ===');
    const finalState = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      return {
        hasDialog: dialogs.length > 0,
        dialogText: Array.from(dialogs).map(d => d.textContent.trim()).join(' | ')
      };
    });

    log(`弹窗状态: ${finalState.hasDialog ? '仍有弹窗' : '无弹窗'}`);
    if (finalState.hasDialog) {
      log(`弹窗内容: ${finalState.dialogText}`);
    }

    await browser.close();
  } catch (error) {
    log(`调试失败: ${error.message}`, 'error');
  }
}

debugFolderCreation();