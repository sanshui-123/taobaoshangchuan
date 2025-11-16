const { chromium } = require('playwright');

async function testDirectClick() {
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

    console.log('=== 测试直接点击C25291153节点 ===');

    // 直接点击C25291153节点
    const clickSuccess = await page.evaluate(() => {
      const nodes = document.querySelectorAll('li.next-tree-node');
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.textContent && node.textContent.includes('C25291153')) {
          console.log(`找到C25291153节点在位置 ${i}: ${node.textContent.trim()}`);

          // 点击节点
          node.click();
          return { found: true, index: i };
        }
      }
      return { found: false };
    });

    if (clickSuccess.found) {
      console.log('成功点击C25291153节点');

      // 等待页面更新
      await page.waitForTimeout(2000);

      // 检查面包屑
      const breadcrumb = await page.$('.next-breadcrumb');
      if (breadcrumb) {
        const breadcrumbText = await breadcrumb.textContent();
        console.log(`点击后面包屑: ${breadcrumbText.trim()}`);
      }

      // 检查右侧内容
      const rightContent = await page.$('.PicturesShow_PicturesShow_main');
      if (rightContent) {
        const contentText = await rightContent.textContent();
        if (contentText.includes('C25291153')) {
          console.log('✅ 右侧内容区域包含C25291153');

          // 检查是否有color_*.jpg文件
          const hasColorFiles = contentText.includes('color_') && contentText.includes('.jpg');
          console.log(`✅ 包含color_*.jpg文件: ${hasColorFiles}`);
        }
      }
    } else {
      console.log('❌ 未找到C25291153节点');
    }

    await browser.close();
  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

testDirectClick();