const { chromium } = require('playwright');

async function analyzeFolderStructure() {
  console.log('🔍 分析素材库页面结构，查找文件夹导航...');

  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    console.log('📍 当前页面URL:', page.url());

    // 查找所有可能包含年份的元素
    const yearElements = await page.evaluate(() => {
      const elements = [];
      const allElements = document.querySelectorAll('*');

      for (const elem of allElements) {
        const text = elem.textContent || '';
        const className = elem.className || '';

        if ((text && text.includes('2026')) || (className && className.includes && className.includes('2026'))) {
          elements.push({
            tagName: elem.tagName,
            text: text.substring(0, 50),
            className: className,
            id: elem.id || ''
          });
        }
      }

      return elements;
    });

    console.log('📋 找到包含2026的元素数量:', yearElements.length);

    for (let i = 0; i < yearElements.length; i++) {
      const elem = yearElements[i];
      console.log(`元素${i+1}:`);
      console.log(`  标签: ${elem.tagName}`);
      console.log(`  文本: ${elem.text}`);
      console.log(`  类名: ${elem.className}`);
      console.log(`  ID: ${elem.id}`);
    }

    // 查找左侧导航栏的文件夹结构
    const folderStructure = await page.evaluate(() => {
      const navItems = document.querySelectorAll('nav, .nav, .sidebar, .folder-tree, [class*="folder"], [class*="nav"], [class*="tree"]');
      const result = [];

      navItems.forEach(nav => {
        const text = nav.textContent || '';
        const className = nav.className || '';
        if (text.length > 10 && text.length < 500) { // 过滤掉太短的文本
          result.push({
            tagName: nav.tagName,
            className: className,
            text: text.substring(0, 100)
          });
        }
      });

      return result;
    });

    console.log('\n📁 导航相关元素数量:', folderStructure.length);

    for (let i = 0; i < Math.min(10, folderStructure.length); i++) {
      const nav = folderStructure[i];
      console.log(`导航${i+1}: ${nav.tagName}.${nav.className}`);
      console.log(`  内容: ${nav.text}`);
    }

    // 查找面包屑导航
    const breadcrumbElements = await page.$$('.breadcrumb, [class*="breadcrumb"], [class*="nav-path"], [class*="path"]');
    console.log('\n🍞 面包屑导航元素数量:', breadcrumbElements.length);

    for (let i = 0; i < breadcrumbElements.length; i++) {
      const text = await breadcrumbElements[i].textContent();
      const className = await breadcrumbElements[i].getAttribute('class');
      console.log(`面包屑${i+1}: ${className} - ${text?.substring(0, 50)}`);
    }

    // 查找可能的文件夹链接
    const folderLinks = await page.evaluate(() => {
      const links = document.querySelectorAll('a, [onclick], [role="button"]');
      const folderLinks = [];

      links.forEach(link => {
        const text = link.textContent || '';
        const className = link.className || '';

        if ((text.includes('2026') || text.includes('2025') || text.includes('2024') ||
             text.includes('全部图片') || text.includes('文件夹') ||
             className.includes('folder') || className.includes('nav')) &&
            text.length > 0 && text.length < 100) {
          folderLinks.push({
            tagName: link.tagName,
            text: text,
            className: className,
            href: link.href || '',
            onclick: link.onclick ? link.onclick.toString() : ''
          });
        }
      });

      return folderLinks;
    });

    console.log('\n🔗 可能的文件夹链接数量:', folderLinks.length);

    for (let i = 0; i < folderLinks.length; i++) {
      const link = folderLinks[i];
      console.log(`链接${i+1}:`);
      console.log(`  标签: ${link.tagName}`);
      console.log(`  文本: ${link.text}`);
      console.log(`  类名: ${link.className}`);
      console.log(`  Href: ${link.href}`);
    }

    console.log('\n✅ 页面结构分析完成');

  } catch (error) {
    console.error('❌ 分析失败:', error.message);
  }
}

analyzeFolderStructure();