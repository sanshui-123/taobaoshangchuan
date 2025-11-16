const { chromium } = require('playwright');

async function manualNavigateToC25291153() {
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

    console.log('=== 手动导航到C25291153 ===');

    // 清理弹窗
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
    });

    await page.waitForTimeout(1000);

    // 展开2026
    await page.evaluate(() => {
      const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
        .find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
        console.log('点击2026节点');
      }
    });

    await page.waitForTimeout(2000);

    // 点击C25291153
    const clicked = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      const targetNode = nodes.find(el => el.textContent && el.textContent.includes('C25291153'));
      if (targetNode) {
        targetNode.click();
        console.log('点击C25291153节点');
        return true;
      }
      return false;
    });

    if (clicked) {
      await page.waitForTimeout(3000);

      // 检查面包屑
      const breadcrumb = await page.$('.next-breadcrumb');
      if (breadcrumb) {
        const breadcrumbText = await breadcrumb.textContent();
        console.log(`📍 导航成功，面包屑: ${breadcrumbText.trim()}`);
      }

      // 检查文件
      const fileCount = await page.evaluate(() => {
        const fileElements = document.querySelectorAll('.PicturesShow_PicturesShow_main-document, [class*="document"]');
        return fileElements.length;
      });
      console.log(`📊 文件数量: ${fileCount}`);

      // 检查color_*.jpg
      const hasColorFiles = await page.evaluate(() => {
        const content = document.querySelector('.PicturesShow_PicturesShow_main');
        if (!content) return false;
        const text = content.textContent;
        if (text.includes('color_') && text.includes('.jpg')) {
          console.log('✅ 找到color_*.jpg文件');
          return true;
        }
        return false;
      });

      if (hasColorFiles) {
        console.log('🎉 C25291153文件上传验证成功！');
      } else {
        console.log('❌ 未找到color_*.jpg文件');
      }
    } else {
      console.log('❌ 未找到C25291153节点');
    }

    await browser.close();
  } catch (error) {
    console.error('手动导航失败:', error.message);
  }
}

manualNavigateToC25291153();