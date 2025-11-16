const { chromium } = require('playwright');

async function fixSearchPanels() {
  try {
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
      console.log('未找到素材库页面');
      return;
    }

    console.log('=== 强制关闭所有搜索面板 ===');

    // 方法1：使用多种选择器查找并关闭搜索面板
    const searchSelectors = [
      '.NewSearchPanel_searchPanel',
      '.searchPanel',
      '[class*="searchPanel"]',
      '[class*="SearchPanel"]',
      '.tbd-popover:has-text("如何设置电子发票")',
      '.tbd-popover-content',
      '.PeerAskingModule_container',
      '.AskItem_serviceItem'
    ];

    let closedCount = 0;

    for (const selector of searchSelectors) {
      try {
        const elements = await page.$$(selector);
        console.log(`选择器 "${selector}" 找到 ${elements.length} 个元素`);

        for (const element of elements) {
          try {
            const isVisible = await element.isVisible();
            if (isVisible) {
              // 尝试查找关闭按钮
              const closeButton = await element.$('button:has-text("关闭"), button:has-text("✕"), [aria-label*="close"], .close');

              if (closeButton) {
                await closeButton.click();
                console.log('✅ 点击了关闭按钮');
                closedCount++;
              } else {
                // 如果没有关闭按钮，尝试点击元素外部或按ESC
                await page.keyboard.press('Escape');
                console.log('✅ 按ESC键关闭');
                closedCount++;
              }
            }
          } catch (e) {
            // 继续处理下一个
          }
        }
      } catch (e) {
        // 继续尝试下一个选择器
      }
    }

    // 方法2：使用JavaScript强制隐藏搜索面板
    const hiddenCount = await page.evaluate(() => {
      let hidden = 0;

      // 查找并隐藏所有搜索相关的元素
      const searchElements = document.querySelectorAll('*');
      for (const el of searchElements) {
        if (el.textContent && el.textContent.includes('如何设置电子发票')) {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.opacity = '0';
          hidden++;
        }
      }

      // 隐藏特定的搜索面板类
      const panelClasses = [
        '.NewSearchPanel_searchPanel',
        '.searchPanel',
        '[class*="searchPanel"]',
        '.PeerAskingModule_container',
        '.tbd-popover:has-text("如何设置电子发票")'
      ];

      panelClasses.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            el.style.display = 'none';
            el.style.visibility = 'hidden';
            el.style.opacity = '0';
            hidden++;
          });
        } catch (e) {
          // 忽略错误
        }
      });

      return hidden;
    });

    console.log(`总共关闭了 ${closedCount} 个搜索面板`);
    console.log(`JavaScript隐藏了 ${hiddenCount} 个搜索相关元素`);

    // 方法3：多次按ESC确保没有弹窗
    console.log('多次按ESC确保清除剩余弹窗...');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // 验证结果
    await page.waitForTimeout(1000);

    const remainingPanels = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      let visible = 0;
      for (const el of elements) {
        if (el.textContent && el.textContent.includes('如何设置电子发票')) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            visible++;
          }
        }
      }
      return visible;
    });

    console.log(`剩余可见的搜索相关元素: ${remainingPanels}`);

    if (remainingPanels === 0) {
      console.log('✅ 所有搜索面板已成功关闭！');
    } else {
      console.log('⚠️ 仍有搜索面板未关闭');
    }

    await browser.close();
  } catch (error) {
    console.error('修复搜索面板失败:', error.message);
  }
}

fixSearchPanels();