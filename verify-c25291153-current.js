const { chromium } = require('playwright');

async function verifyC25291153Current() {
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

    console.log('=== 验证当前C25291153状态 ===');

    // 检查面包屑
    const breadcrumb = await page.$('.next-breadcrumb');
    if (breadcrumb) {
      const breadcrumbText = await breadcrumb.textContent();
      console.log(`📍 当前面包屑: ${breadcrumbText.trim()}`);
    }

    // 检查文件数量
    const fileCount = await page.evaluate(() => {
      const fileElements = document.querySelectorAll('.PicturesShow_PicturesShow_main-document, [class*="document"]');
      return fileElements.length;
    });
    console.log(`📊 文件数量: ${fileCount}`);

    // 检查是否有color_*.jpg
    const hasColorFiles = await page.evaluate(() => {
      const content = document.querySelector('.PicturesShow_PicturesShow_main');
      if (!content) return false;
      const text = content.textContent;
      return text.includes('color_') && text.includes('.jpg');
    });
    console.log(`🖼️ 包含color_*.jpg文件: ${hasColorFiles ? '是' : '否'}`);

    // 尝试重新导航到C25291153
    console.log('尝试重新导航到C25291153...');

    // 先展开2026
    await page.evaluate(() => {
      const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
        .find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
      }
    });

    await page.waitForTimeout(2000);

    // 点击C25291153
    const clicked = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      const targetNode = nodes.find(el => el.textContent && el.textContent.includes('C25291153'));
      if (targetNode) {
        targetNode.click();
        return true;
      }
      return false;
    });

    if (clicked) {
      console.log('✅ 点击了C25291153节点');
      await page.waitForTimeout(3000);

      // 再次检查面包屑
      const newBreadcrumb = await page.$('.next-breadcrumb');
      if (newBreadcrumb) {
        const newBreadcrumbText = await newBreadcrumb.textContent();
        console.log(`📍 重新导航后面包屑: ${newBreadcrumbText.trim()}`);
      }

      // 再次检查文件
      const newFileCount = await page.evaluate(() => {
        const fileElements = document.querySelectorAll('.PicturesShow_PicturesShow_main-document, [class*="document"]');
        return fileElements.length;
      });
      console.log(`📊 重新导航后文件数量: ${newFileCount}`);
    }

    // 截图
    await page.screenshot({
      path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/c25291153-current-state.png`,
      fullPage: true
    });

    console.log('✅ 截图已保存: c25291153-current-state.png');

    await browser.close();
  } catch (error) {
    console.error('验证失败:', error.message);
  }
}

verifyC25291153Current();