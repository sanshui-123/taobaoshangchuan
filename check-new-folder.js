const { chromium } = require('playwright');

async function checkNewFolder() {
  console.log('🔍 检查新文件夹创建后的页面状态...');

  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    console.log('📍 当前页面URL:', page.url());

    // 查找包含test-product-12345的元素
    const productElements = await page.evaluate(() => {
      const elements = [];
      const allElements = document.querySelectorAll('*');

      for (const elem of allElements) {
        const text = elem.textContent || '';
        const className = elem.className || '';

        if (text.includes('test-product-12345') || className.includes('test-product-12345')) {
          elements.push({
            tagName: elem.tagName,
            text: text.substring(0, 50),
            className: className,
            id: elem.id || '',
            isVisible: elem.offsetParent !== null
          });
        }
      }

      return elements;
    });

    console.log('📋 找到包含test-product-12345的元素数量:', productElements.length);

    for (let i = 0; i < productElements.length; i++) {
      const elem = productElements[i];
      console.log(`元素${i+1}:`);
      console.log(`  标签: ${elem.tagName}`);
      console.log(`  文本: ${elem.text}`);
      console.log(`  类名: ${elem.className}`);
      console.log(`  可见: ${elem.isVisible}`);
    }

    // 检查面包屑导航，看看当前位置
    const breadcrumbElements = await page.$$('.next-breadcrumb, .next-breadcrumb-item, .next-breadcrumb-text');
    console.log('\n🍞 面包屑导航:');
    for (let i = 0; i < breadcrumbElements.length; i++) {
      const text = await breadcrumbElements[i].textContent();
      const className = await breadcrumbElements[i].getAttribute('class');
      console.log(`  ${i+1}. ${className}: ${text}`);
    }

    // 查看当前文件夹结构
    const folderStructure = await page.evaluate(() => {
      const treeItems = document.querySelectorAll('.next-tree-node, .folder-item, [class*="folder"]');
      const result = [];

      treeItems.forEach(item => {
        const text = item.textContent || '';
        const className = item.className || '';
        if (text.length > 0 && text.length < 100) {
          result.push({
            text: text,
            className: className
          });
        }
      });

      return result;
    });

    console.log('\n📁 当前文件夹结构:');
    for (let i = 0; i < Math.min(15, folderStructure.length); i++) {
      const folder = folderStructure[i];
      console.log(`  ${i+1}. ${folder.className}: ${folder.text}`);
    }

    console.log('\n✅ 页面状态检查完成');

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
  }
}

checkNewFolder();