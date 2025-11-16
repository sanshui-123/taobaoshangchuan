const { chromium } = require('playwright');

async function testRobustClick() {
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

    console.log('=== 使用多种方法查找C25291153节点 ===');

    // 方法1：使用Playwright选择器直接点击
    try {
      const node = await page.$('li.next-tree-node:has-text("C25291153")');
      if (node) {
        console.log('方法1成功：找到C25291153节点');
        await node.click();
        console.log('已点击C25291153节点');
      } else {
        console.log('方法1失败：未找到C25291153节点');
      }
    } catch (e) {
      console.log('方法1异常:', e.message);
    }

    await page.waitForTimeout(2000);

    // 检查面包屑
    const breadcrumb = await page.$('.next-breadcrumb');
    if (breadcrumb) {
      const breadcrumbText = await breadcrumb.textContent();
      console.log(`当前面包屑: ${breadcrumbText.trim()}`);
      if (breadcrumbText.includes('C25291153')) {
        console.log('✅ 成功导航到C25291153！');
      }
    }

    // 检查右侧区域是否有上传的文件
    const fileAreas = await page.$$('.PicturesShow_PicturesShow_main-document-show');
    console.log(`找到 ${fileAreas.length} 个文件区域`);

    let foundFiles = false;
    for (let i = 0; i < fileAreas.length; i++) {
      const area = fileAreas[i];
      try {
        const text = await area.textContent();
        if (text.includes('C25291153')) {
          console.log(`文件区域 ${i} 包含C25291153: ${text.trim().substring(0, 100)}...`);
          foundFiles = true;
        }
      } catch (e) {
        // 忽略读取错误
      }
    }

    if (foundFiles) {
      console.log('✅ 找到C25291153相关文件');
    } else {
      console.log('❌ 未找到C25291153相关文件');
    }

    await browser.close();
  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

testRobustClick();