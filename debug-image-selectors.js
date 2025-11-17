/**
 * 调试脚本：查找素材库中图片的正确选择器
 */

const { chromium } = require('playwright');

async function debugImageSelectors() {
  console.log('🔍 开始查找图片选择器...\n');

  try {
    // 连接到现有浏览器
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const contexts = browser.contexts();
    const context = contexts[0];
    const pages = context.pages();
    const page = pages.find(p => p.url().includes('upload.taobao.com')) || pages[0];

    console.log(`📄 当前页面: ${page.url()}\n`);

    // 查找所有 iframe
    const iframeCount = await page.locator('iframe').count();
    console.log(`发现 ${iframeCount} 个 iframe\n`);

    if (iframeCount > 0) {
      // 使用第6个iframe（素材库弹窗）
      const uploadFrame = page.frameLocator('iframe').nth(5);  // 第6个是索引5

      console.log('📋 在iframe中查找所有可能的图片容器...\n');

      // 查找所有包含图片的元素
      const elementsWithImages = await uploadFrame.locator('*:has(img[src*="alicdn"])').evaluateAll(elements => {
        return elements.slice(0, 20).map((el, index) => ({
          index,
          tagName: el.tagName,
          id: el.id,
          className: el.className,
          childCount: el.children.length,
          hasClickListener: el.onclick !== null || el.getAttribute('onclick') !== null
        }));
      });

      console.log('包含图片的元素:');
      elementsWithImages.forEach(el => {
        console.log(`  ${el.index}. <${el.tagName}>`);
        if (el.id) console.log(`     id="${el.id}"`);
        if (el.className) console.log(`     class="${el.className}"`);
        console.log(`     子元素数: ${el.childCount}`);
        console.log(`     有点击监听器: ${el.hasClickListener}`);
        console.log('');
      });

      // 查找所有 a 标签
      console.log('\n📋 查找所有链接 (a标签)...\n');
      const links = await uploadFrame.locator('a').evaluateAll(elements => {
        return elements.slice(0, 10).map((el, index) => ({
          index,
          className: el.className,
          hasImage: el.querySelector('img') !== null,
          href: el.getAttribute('href')
        }));
      });

      links.forEach(link => {
        console.log(`  ${link.index}. class="${link.className}"`);
        console.log(`     包含图片: ${link.hasImage}`);
        console.log(`     href: ${link.href}`);
        console.log('');
      });

      // 查找特定class模式
      console.log('\n📋 查找特定class模式的元素...\n');
      const patterns = ['pic', 'image', 'item', 'card', 'thumbnail'];

      for (const pattern of patterns) {
        const count = await uploadFrame.locator(`[class*="${pattern}"]`).count();
        console.log(`  [class*="${pattern}"]: ${count} 个`);

        if (count > 0 && count < 50) {
          const samples = await uploadFrame.locator(`[class*="${pattern}"]`).evaluateAll((elements, pat) => {
            return elements.slice(0, 3).map(el => ({
              tagName: el.tagName,
              className: el.className
            }));
          }, pattern);

          samples.forEach(s => {
            console.log(`     → <${s.tagName}> class="${s.className}"`);
          });
        }
        console.log('');
      }
    }

    console.log('\n✅ 调试完成');
    await browser.close();

  } catch (error) {
    console.error('\n❌ 调试失败:', error.message);
    process.exit(1);
  }
}

// 运行调试
debugImageSelectors().catch(error => {
  console.error('执行失败:', error);
  process.exit(1);
});
