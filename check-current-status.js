const { chromium } = require('playwright');

async function checkCurrentStatus() {
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

    console.log('=== 当前页面状态检查 ===');

    // 检查面包屑
    const breadcrumb = await page.$('.next-breadcrumb');
    if (breadcrumb) {
      const breadcrumbText = await breadcrumb.textContent();
      console.log(`当前面包屑: ${breadcrumbText.trim()}`);
    }

    // 检查搜索面板
    const searchPanels = await page.$$('.search-panel, .search-box, [class*="search"], [class*="panel"]');
    console.log(`找到 ${searchPanels.length} 个可能的搜索面板`);

    for (let i = 0; i < searchPanels.length; i++) {
      try {
        const panel = searchPanels[i];
        const isVisible = await panel.isVisible();
        const text = await panel.textContent();
        if (isVisible && text) {
          console.log(`面板 ${i}: 可见, 内容: ${text.trim().substring(0, 50)}...`);
        }
      } catch (e) {
        // 忽略错误
      }
    }

    // 检查"如何设置电子发票"相关内容
    const invoicePanels = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const results = [];
      for (const el of elements) {
        if (el.textContent && el.textContent.includes('如何设置电子发票')) {
          results.push({
            tagName: el.tagName,
            className: el.className,
            text: el.textContent.trim().substring(0, 100)
          });
        }
      }
      return results;
    });

    console.log(`找到 ${invoicePanels.length} 个包含"如何设置电子发票"的元素:`);
    invoicePanels.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tagName} class="${el.className}">`);
    });

    // 检查当前文件夹内容
    const contentArea = await page.$('.PicturesShow_PicturesShow_main, [class*="content"], [class*="main"]');
    if (contentArea) {
      const contentText = await contentArea.textContent();
      if (contentText.includes('暂无图片')) {
        console.log('✅ 确认：当前文件夹显示"暂无图片"');
      } else {
        console.log('❌ 当前文件夹有内容或其他状态');
        console.log(`内容预览: ${contentText.trim().substring(0, 100)}...`);
      }
    }

    await browser.close();
  } catch (error) {
    console.error('检查失败:', error.message);
  }
}

checkCurrentStatus();