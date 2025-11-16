const { chromium } = require('playwright');

async function manualFolderCreationHelper() {
  const productId = 'C25291153';

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔧';
    console.log(`${timestamp} ManualHelper: ${prefix} ${message}`);
  };

  try {
    log(`=== 手动文件夹创建辅助工具 ===`);
    log(`目标: 创建 ${productId} 文件夹在 2026 节点下`);
    log(``);

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

    log('✅ 已连接到素材库页面');
    log('');

    // 清理现有弹窗
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
    });
    await page.waitForTimeout(1000);

    // 步骤1：打开新建文件夹弹窗
    log('=== 步骤1：打开新建文件夹弹窗 ===');
    log('正在点击"新建文件夹"按钮...');

    const buttonClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const button of buttons) {
        const text = button.textContent || '';
        if (text.includes('新建文件夹')) {
          button.click();
          return true;
        }
      }
      return false;
    });

    if (!buttonClicked) {
      log('❌ 无法找到"新建文件夹"按钮');
      return;
    }

    log('✅ 已点击"新建文件夹"按钮');
    await page.waitForTimeout(3000);

    // 检查弹窗状态
    const dialogStatus = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          return {
            open: true,
            text: dialog.textContent,
            hasAllImages: dialog.textContent.includes('全部图片'),
            has2026: dialog.textContent.includes('2026')
          };
        }
      }
      return { open: false };
    });

    if (!dialogStatus.open) {
      log('❌ 新建文件夹弹窗未打开');
      return;
    }

    log('✅ 新建文件夹弹窗已打开');
    log(`弹窗内容预览: "${dialogStatus.text.substring(0, 100)}..."`);
    log(`上级文件夹显示: ${dialogStatus.hasAllImages ? '"全部图片"' : (dialogStatus.has2026 ? '"2026"' : '未知')}`);
    log('');

    // 步骤2：分析并显示上级文件夹选择方法
    log('=== 步骤2：上级文件夹选择分析 ===');

    const selectorInfo = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          // 查找上级文件夹选择器
          const selector = dialog.querySelector('span.next-select-trigger');
          if (selector) {
            const rect = selector.getBoundingClientRect();
            return {
              found: true,
              text: selector.textContent.trim(),
              tagName: selector.tagName,
              className: selector.className,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              width: rect.width,
              height: rect.height
            };
          }
        }
      }
      return { found: false };
    });

    if (selectorInfo.found) {
      log('✅ 找到上级文件夹选择器:');
      log(`  - 当前显示: "${selectorInfo.text}"`);
      log(`  - 位置: (${Math.round(selectorInfo.x)}, ${Math.round(selectorInfo.y)})`);
      log(`  - 大小: ${Math.round(selectorInfo.width)}x${Math.round(selectorInfo.height)}`);
      log('');

      // 点击选择器
      log('正在点击上级文件夹选择器...');
      await page.mouse.click(selectorInfo.x, selectorInfo.y);
      await page.waitForTimeout(2000);

      // 查找下拉菜单中的2026选项
      log('正在查找下拉菜单中的2026选项...');

      const optionsInfo = await page.evaluate(() => {
        const dropdowns = document.querySelectorAll('.next-select-menu, .next-overlay-wrapper');
        const options = [];

        for (const dropdown of dropdowns) {
          if (dropdown.offsetWidth > 0 && dropdown.offsetHeight > 0) {
            const items = dropdown.querySelectorAll('li, div[role="option"], .next-tree-node');
            for (const item of items) {
              const text = item.textContent || '';
              const rect = item.getBoundingClientRect();

              if (rect.width > 0 && rect.height > 0) {
                options.push({
                  text: text.trim(),
                  tagName: item.tagName,
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                  width: rect.width,
                  height: rect.height
                });
              }
            }
          }
        }

        return options;
      });

      log(`下拉菜单中找到 ${optionsInfo.length} 个选项:`);
      let target2026Option = null;

      for (let i = 0; i < optionsInfo.length; i++) {
        const option = optionsInfo[i];
        const is2026 = option.text.includes('2026');
        const marker = is2026 ? '👉' : '  ';

        log(`${marker} 选项${i + 1}: "${option.text}" (${Math.round(option.x)}, ${Math.round(option.y)})`);

        if (is2026 && !target2026Option) {
          target2026Option = option;
        }
      }

      if (target2026Option) {
        log('');
        log('✅ 找到2026选项，正在点击...');
        await page.mouse.click(target2026Option.x, target2026Option.y);
        await page.waitForTimeout(1000);
        log('✅ 已点击2026选项');
      } else {
        log('❌ 未找到2026选项');
        log('⚠️ 可能需要手动滚动或查找更多选项');
      }
    } else {
      log('❌ 未找到上级文件夹选择器');
    }

    log('');

    // 步骤3：验证上级文件夹设置
    log('=== 步骤3：验证上级文件夹设置 ===');

    const verification = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const text = dialog.textContent;
          return {
            has2026: text.includes('2026'),
            hasAllImages: text.includes('全部图片'),
            fullText: text
          };
        }
      }
      return null;
    });

    if (verification) {
      if (verification.has2026 && !verification.hasAllImages) {
        log('🎉 完美！上级文件夹已正确设置为2026');
      } else if (verification.has2026 && verification.hasAllImages) {
        log('⚠️ 同时显示2026和全部图片，需要确认选择');
      } else if (verification.hasAllImages) {
        log('❌ 仍显示全部图片，设置失败');
      } else {
        log('❌ 未检测到预期的上级文件夹显示');
      }
    }

    log('');

    // 步骤4：输入文件夹名称
    log('=== 步骤4：输入文件夹名称 ===');
    log(`目标文件夹名: ${productId}`);
    log('正在查找文件夹名称输入框...');

    const inputInfo = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const inputs = dialog.querySelectorAll('input');
          for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const rect = input.getBoundingClientRect();

            // 跳过很小的搜索框
            if (rect.width > 50) {
              return {
                found: true,
                index: i,
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                width: rect.width,
                height: rect.height,
                placeholder: input.placeholder || ''
              };
            }
          }
        }
      }
      return { found: false };
    });

    if (inputInfo.found) {
      log(`✅ 找到输入框${inputInfo.index + 1}:`);
      log(`  - 位置: (${Math.round(inputInfo.x)}, ${Math.round(inputInfo.y)})`);
      log(`  - 大小: ${Math.round(inputInfo.width)}x${Math.round(inputInfo.height)}`);
      log(`  - 占位符: "${inputInfo.placeholder}"`);
      log('');

      // 点击输入框并输入
      log(`正在输入文件夹名称: ${productId}`);
      await page.mouse.click(inputInfo.x, inputInfo.y);
      await page.waitForTimeout(300);

      // 清空并输入
      await page.keyboard.selectAll();
      await page.keyboard.type(productId);
      await page.waitForTimeout(500);

      log('✅ 文件夹名称输入完成');
    } else {
      log('❌ 未找到文件夹名称输入框');
    }

    log('');

    // 步骤5：完成创建
    log('=== 步骤5：完成创建 ===');
    log('🔧 接下来需要手动完成以下步骤:');
    log('');
    log('1. 检查上级文件夹是否显示"2026"（不是"全部图片"）');
    log('2. 检查文件夹名称是否正确输入为"C25291153"');
    log('3. 如果都正确，点击"确定"按钮');
    log('4. 等待弹窗关闭');
    log('5. 刷新页面验证文件夹是否创建成功');
    log('');

    const finalState = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          return {
            open: true,
            text: dialog.textContent,
            inputValues: Array.from(dialog.querySelectorAll('input')).map(input => input.value)
          };
        }
      }
      return { open: false };
    });

    if (finalState.open) {
      log('当前弹窗状态:');
      log(`- 弹窗仍然打开`);
      log(`- 弹窗文本包含: ${finalState.text.includes('2026') ? '2026' : ''} ${finalState.text.includes('全部图片') ? '全部图片' : ''}`);
      log(`- 输入框值: [${finalState.inputValues.join(', ')}]`);
    }

    log('');
    log('🔧 辅助工具已完成，请根据上述提示手动完成文件夹创建');

    await browser.close();
  } catch (error) {
    log(`手动辅助工具失败: ${error.message}`, 'error');
  }
}

manualFolderCreationHelper();