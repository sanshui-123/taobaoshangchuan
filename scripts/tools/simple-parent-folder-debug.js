const { chromium } = require('playwright');
const { closeMaterialCenterPopups } = require('../utils/advert-handler');

async function simpleParentFolderDebug() {
  function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔍';
    console.log(`${timestamp} SimpleDebug: ${prefix} ${message}`);
  }

  try {
    log('开始简化调试上级文件夹设置');

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

    // 简化分析弹窗结构
    log('=== 分析弹窗结构 ===');

    const dialogAnalysis = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          console.log('找到新建文件夹弹窗');

          // 查找上级文件夹选择器
          const triggers = dialog.querySelectorAll('span.next-select-trigger');
          console.log(`找到${triggers.length}个选择器触发器`);

          let parentFolderTrigger = null;
          for (let i = 0; i < triggers.length; i++) {
            const trigger = triggers[i];
            const text = trigger.textContent || '';
            console.log(`触发器${i}: "${text}"`);

            if (text.includes('全部图片')) {
              parentFolderTrigger = {
                element: trigger,
                text: text.trim(),
                index: i
              };
              console.log('找到上级文件夹选择器');
            }
          }

          return {
            hasParentFolderTrigger: parentFolderTrigger !== null,
            parentFolderTrigger: parentFolderTrigger,
            dialogText: dialog.textContent.substring(0, 200)
          };
        }
      }
      return null;
    });

    if (dialogAnalysis && dialogAnalysis.hasParentFolderTrigger) {
      log('✅ 找到上级文件夹选择器');
      log(`选择器文本: "${dialogAnalysis.parentFolderTrigger.text}"`);

      // 点击选择器
      log('点击上级文件夹选择器...');
      const clickSuccess = await page.evaluate((triggerIndex) => {
        const dialogs = document.querySelectorAll('.next-dialog');
        for (const dialog of dialogs) {
          if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
            const triggers = dialog.querySelectorAll('span.next-select-trigger');
            if (triggers[triggerIndex]) {
              triggers[triggerIndex].click();
              return true;
            }
          }
        }
        return false;
      }, dialogAnalysis.parentFolderTrigger.index);

      if (clickSuccess) {
        log('✅ 已点击上级文件夹选择器');
        await page.waitForTimeout(2000);

        // 查找2026选项
        log('查找2026选项...');
        const options2026 = await page.evaluate(() => {
          const options = [];
          const allElements = document.querySelectorAll('*');

          for (const element of allElements) {
            const text = element.textContent || '';
            const rect = element.getBoundingClientRect();

            if (text.includes('2026') && rect.width > 0 && rect.height > 0) {
              options.push({
                tagName: element.tagName,
                text: text.trim(),
                className: element.className || '',
                clickable: element.tagName === 'LI' || element.tagName === 'DIV' || element.className.includes('node')
              });
            }
          }

          return options;
        });

        log(`找到${options2026.length}个包含2026的选项:`);
        options2026.forEach((option, i) => {
          log(`  选项${i}: ${option.tagName} "${option.text}" (可点击:${option.clickable})`);
        });

        // 尝试点击2026选项
        if (options2026.length > 0) {
          const clickableOptions = options2026.filter(o => o.clickable);

          if (clickableOptions.length > 0) {
            log('尝试点击可点击的2026选项...');
            const click2026Success = await page.evaluate(() => {
              const allElements = document.querySelectorAll('*');
              for (const element of allElements) {
                const text = element.textContent || '';
                const rect = element.getBoundingClientRect();

                if (text.includes('2026') && rect.width > 0 && rect.height > 0) {
                  if (element.tagName === 'LI' || element.tagName === 'DIV' || element.className.includes('node')) {
                    element.click();
                    return true;
                  }
                }
              }
              return false;
            });

            if (click2026Success) {
              log('✅ 已点击2026选项');
              await page.waitForTimeout(2000);

              // 验证设置结果
              const verification = await page.evaluate(() => {
                const dialogs = document.querySelectorAll('.next-dialog');
                for (const dialog of dialogs) {
                  if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
                    const triggers = dialog.querySelectorAll('span.next-select-trigger');
                    for (const trigger of triggers) {
                      const text = trigger.textContent || '';
                      if (text.includes('2026')) {
                        return text.trim();
                      }
                    }
                  }
                }
                return null;
              });

              if (verification) {
                log(`✅ 上级文件夹设置成功: "${verification}"`);

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
                        return input.value === folderName;
                      }
                    }
                  }
                  return false;
                }, 'C25291153');

                if (inputSuccess) {
                  log('✅ 文件夹名称输入成功');

                  // 点击确定按钮
                  log('点击确定按钮...');
                  await page.evaluate(() => {
                    const dialogs = document.querySelectorAll('.next-dialog');
                    for (const dialog of dialogs) {
                      if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
                        const buttons = dialog.querySelectorAll('button');
                        for (const button of buttons) {
                          const text = button.textContent || '';
                          if (text.includes('确定') || text.includes('创建')) {
                            button.click();
                            break;
                          }
                        }
                        break;
                      }
                    }
                  });

                  await page.keyboard.press('Enter');
                  log('✅ 已点击确定按钮');

                  // 等待弹窗关闭
                  let dialogClosed = false;
                  for (let i = 0; i < 15; i++) {
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

                  if (dialogClosed) {
                    log('✅ 弹窗已关闭，文件夹创建完成');
                  } else {
                    log('⚠️ 弹窗未关闭，强制关闭');
                    await page.keyboard.press('Escape');
                  }

                  return true;
                } else {
                  log('❌ 文件夹名称输入失败');
                }
              } else {
                log('❌ 上级文件夹设置验证失败');
              }
            } else {
              log('❌ 点击2026选项失败');
            }
          } else {
            log('❌ 没有可点击的2026选项');
          }
        } else {
          log('❌ 未找到2026选项');
        }
      } else {
        log('❌ 点击上级文件夹选择器失败');
      }
    } else {
      log('❌ 未找到上级文件夹选择器');
      if (dialogAnalysis) {
        log(`弹窗文本: ${dialogAnalysis.dialogText}`);
      }
    }

    await browser.close();
    log('调试完成');

  } catch (error) {
    log(`调试失败: ${error.message}`, 'error');
    throw error;
  }
}

simpleParentFolderDebug();