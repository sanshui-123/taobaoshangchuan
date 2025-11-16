const { chromium } = require('playwright');
const { closeMaterialCenterPopups } = require('../utils/advert-handler');

async function debugParentFolderSetting() {
  const productId = 'C25291153';

  function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔍';
    console.log(`${timestamp} DebugParent: ${prefix} ${message}`);
  }

  try {
    log('开始调试上级文件夹设置问题');

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

    // 详细分析弹窗结构
    log('=== 详细分析弹窗结构 ===');

    const dialogAnalysis = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          console.log('找到新建文件夹弹窗');

          const analysis = {
            fullText: dialog.textContent,
            triggers: [],
            inputBoxes: [],
            buttons: [],
            allElements: []
          };

          // 分析所有选择器触发器
          const triggers = dialog.querySelectorAll('span.next-select-trigger');
          console.log(`找到${triggers.length}个选择器触发器`);

          for (let i = 0; i < triggers.length; i++) {
            const trigger = triggers[i];
            const text = trigger.textContent || '';
            const className = trigger.className || '';
            const rect = trigger.getBoundingClientRect();

            analysis.triggers.push({
              index: i,
              text: text.trim(),
              className: className,
              visible: rect.width > 0 && rect.height > 0,
              width: rect.width,
              height: rect.height,
              x: rect.left,
              y: rect.top
            });
          }

          // 分析所有输入框
          const inputs = dialog.querySelectorAll('input');
          console.log(`找到${inputs.length}个输入框`);

          for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const placeholder = input.placeholder || '';
            const value = input.value || '';
            const type = input.type || '';
            const className = input.className || '';
            const rect = input.getBoundingClientRect();

            analysis.inputBoxes.push({
              index: i,
              type: type,
              placeholder: placeholder,
              value: value,
              className: className,
              visible: rect.width > 0 && rect.height > 0,
              width: rect.width,
              height: rect.height
            });
          }

          // 分析所有按钮
          const buttons = dialog.querySelectorAll('button');
          console.log(`找到${buttons.length}个按钮`);

          for (let i = 0; i < buttons.length; i++) {
            const button = buttons[i];
            const text = button.textContent || '';
            const className = button.className || '';
            const rect = button.getBoundingClientRect();

            analysis.buttons.push({
              index: i,
              text: text.trim(),
              className: className,
              visible: rect.width > 0 && rect.height > 0,
              width: rect.width,
              height: rect.height
            });
          }

          // 分析所有可见元素
          const allElements = dialog.querySelectorAll('*');
          for (let i = 0; i < allElements.length; i++) {
            const element = allElements[i];
            const text = element.textContent || '';
            const rect = element.getBoundingClientRect();

            if (rect.width > 0 && rect.height > 0 && text.trim().length > 0) {
              analysis.allElements.push({
                tagName: element.tagName,
                className: element.className || '',
                text: text.trim().substring(0, 50),
                id: element.id || '',
                role: element.getAttribute('role') || ''
              });
            }
          }

          return analysis;
        }
      }
      return null;
    });

    if (dialogAnalysis) {
      log('弹窗结构分析结果:');
      log(`完整文本: ${dialogAnalysis.fullText}`);

      log('\n选择器触发器:');
      dialogAnalysis.triggers.forEach((trigger, i) => {
        log(`  触发器${i}: "${trigger.text}" (可见:${trigger.visible}, 尺寸:${trigger.width}x${trigger.height})`);
      });

      log('\n输入框:');
      dialogAnalysis.inputBoxes.forEach((input, i) => {
        log(`  输入框${i}: type=${input.type}, placeholder="${input.placeholder}", value="${input.value}" (可见:${input.visible})`);
      });

      log('\n按钮:');
      dialogAnalysis.buttons.forEach((button, i) => {
        log(`  按钮${i}: "${button.text}" (可见:${button.visible})`);
      });

      log('\n关键元素:');
      dialogAnalysis.allElements.forEach((element, i) => {
        if (element.text.includes('上级文件夹') || element.text.includes('全部图片') || element.text.includes('2026')) {
          log(`  ${element.tagName}: "${element.text}" (class="${element.className}")`);
        }
      });

      // 尝试点击上级文件夹选择器
      log('\n=== 尝试点击上级文件夹选择器 ===');

      const parentFolderTrigger = dialogAnalysis.triggers.find(t => t.text.includes('全部图片'));
      if (parentFolderTrigger) {
        log(`找到上级文件夹选择器，位置: (${parentFolderTrigger.x}, ${parentFolderTrigger.y})`);

        // 点击选择器
        await page.mouse.click(parentFolderTrigger.x + parentFolderTrigger.width / 2, parentFolderTrigger.y + parentFolderTrigger.height / 2);
        await page.waitForTimeout(2000);

        log('已点击上级文件夹选择器');

        // 分析下拉菜单
        log('\n=== 分析下拉菜单 ===');

        const dropdownAnalysis = await page.evaluate(() => {
          const analysis = {
            dropdowns: [],
            options2026: []
          };

          // 查找所有可能的下拉菜单
          const dropdowns = document.querySelectorAll('.next-select-menu, .next-overlay-wrapper, .next-select-dropdown');
          console.log(`找到${dropdowns.length}个下拉菜单`);

          for (let i = 0; i < dropdowns.length; i++) {
            const dropdown = dropdowns[i];
            const rect = dropdown.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0;

            analysis.dropdowns.push({
              index: i,
              tagName: dropdown.tagName,
              className: dropdown.className || '',
              visible: isVisible,
              width: rect.width,
              height: rect.height,
              textContent: isVisible ? dropdown.textContent : ''
            });
          }

          // 查找包含2026的选项
          const allElements = document.querySelectorAll('*');
          for (let i = 0; i < allElements.length; i++) {
            const element = allElements[i];
            const text = element.textContent || '';
            const rect = element.getBoundingClientRect();

            if (text.includes('2026') && rect.width > 0 && rect.height > 0) {
              analysis.options2026.push({
                tagName: element.tagName,
                className: element.className || '',
                text: text.trim(),
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                width: rect.width,
                height: rect.height
              });
            }
          }

          return analysis;
        });

        log('下拉菜单分析:');
        dropdownAnalysis.dropdowns.forEach((dropdown, i) => {
          if (dropdown.visible) {
            log(`  下拉菜单${i}: ${dropdown.tagName}.${dropdown.className} (尺寸:${dropdown.width}x${dropdown.height})`);
            if (dropdown.textContent) {
              log(`    文本: "${dropdown.textContent.substring(0, 100)}..."`);
            }
          }
        });

        log(`包含2026的选项: ${dropdownAnalysis.options2026.length}个`);
        dropdownAnalysis.options2026.forEach((option, i) => {
          log(`  选项${i}: ${option.tagName}.${option.className} 位置(${Math.round(option.x)}, ${Math.round(option.y)})`);
          log(`    文本: "${option.text}"`);
        });

        // 如果找到2026选项，尝试点击
        if (dropdownAnalysis.options2026.length > 0) {
          log('\n=== 尝试点击2026选项 ===');
          const option2026 = dropdownAnalysis.options2026[0];

          await page.mouse.click(option2026.x, option2026.y);
          await page.waitForTimeout(2000);

          log('已点击2026选项');

          // 验证选择结果
          const selectionResult = await page.evaluate(() => {
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

          if (selectionResult) {
            log(`✅ 上级文件夹设置成功: "${selectionResult}"`);
          } else {
            log('❌ 上级文件夹设置失败，没有找到2026');
          }
        } else {
          log('❌ 未找到2026选项');
        }

      } else {
        log('❌ 未找到上级文件夹选择器');
      }
    }

    // 保存调试截图
    await page.screenshot({
      path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/debug-parent-folder-${Date.now()}.png`,
      fullPage: true
    });

    log('调试分析完成');

    await browser.close();

  } catch (error) {
    log(`调试失败: ${error.message}`, 'error');
    throw error;
  }
}

debugParentFolderSetting();