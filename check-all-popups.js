/**
 * 全面的弹窗检测脚本
 * 检查页面上所有可能的弹窗元素
 */

const { chromium } = require('playwright');

async function checkAllPopups() {
  console.log('🔍 开始全面检查页面弹窗...');

  let browser;
  let page;

  try {
    // 启动浏览器
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const pages = browser.contexts()[0].pages();
    page = pages.find(p => p.url().includes('taobao.com')) || pages[0];

    if (!page) {
      throw new Error('未找到可用的淘宝页面');
    }

    console.log('✅ 已连接到淘宝页面');
    console.log('📄 当前页面URL:', page.url());

    // 1. 检查所有对话框类型的元素
    console.log('\n🔍 检查所有对话框元素...');
    const dialogs = await page.$$('.next-dialog, .next-dialog-body, .modal, .popup, [class*="dialog"], [class*="modal"], [class*="popup"]');
    console.log(`找到 ${dialogs.length} 个对话框元素`);

    for (let i = 0; i < dialogs.length; i++) {
      const dialog = dialogs[i];
      const isVisible = await dialog.isVisible().catch(() => false);
      const textContent = await dialog.textContent().catch(() => '');
      const className = await dialog.getAttribute('class').catch(() => '');

      console.log(`\n对话框 ${i + 1}:`);
      console.log(`  - 可见: ${isVisible}`);
      console.log(`  - 类名: ${className}`);
      console.log(`  - 文本内容: "${textContent.substring(0, 100)}"`);

      if (isVisible) {
        console.log(`  - ⚠️ 这是一个可见的弹窗！`);
      }
    }

    // 2. 检查固定定位的元素（可能是弹窗）
    console.log('\n🔍 检查固定定位元素...');
    const fixedElements = await page.$$('[style*="position: fixed"], [style*="position:fixed"]');
    console.log(`找到 ${fixedElements.length} 个固定定位元素`);

    for (let i = 0; i < Math.min(10, fixedElements.length); i++) {
      const element = fixedElements[i];
      const isVisible = await element.isVisible().catch(() => false);
      const textContent = await element.textContent().catch(() => '');
      const zIndex = await element.evaluate(el => getComputedStyle(el).zIndex).catch(() => 'auto');

      if (isVisible && parseInt(zIndex) > 100) {
        console.log(`\n高 zIndex 固定元素 ${i + 1}:`);
        console.log(`  - zIndex: ${zIndex}`);
        console.log(`  - 文本: "${textContent.substring(0, 50)}"`);
        console.log(`  - ⚠️ 可能是弹窗！`);
      }
    }

    // 3. 检查包含特定关键词的元素
    console.log('\n🔍 检查包含权限相关关键词的元素...');
    const keywords = [
      '权限',
      '登录',
      '失效',
      '过期',
      '重新',
      '确定',
      '取消',
      '关闭'
    ];

    for (const keyword of keywords) {
      const elements = await page.$$(`*:has-text("${keyword}")`);
      if (elements.length > 0) {
        console.log(`\n包含"${keyword}"的元素: ${elements.length} 个`);

        for (let i = 0; i < Math.min(3, elements.length); i++) {
          const element = elements[i];
          const isVisible = await element.isVisible().catch(() => false);
          const tagName = await element.evaluate(el => el.tagName).catch(() => 'unknown');
          const textContent = await element.textContent().catch(() => '');

          if (isVisible && textContent.length > 5 && textContent.length < 200) {
            console.log(`  - ${tagName}: "${textContent.substring(0, 60)}"`);
          }
        }
      }
    }

    // 4. 检查所有按钮，特别是可能的关闭按钮
    console.log('\n🔍 检查关闭按钮...');
    const closeButtons = await page.$$('[class*="close"], [title*="关闭"], [aria-label*="关闭"], .next-icon-close, i[class*="icon"]');
    console.log(`找到 ${closeButtons.length} 个可能的关闭按钮`);

    for (let i = 0; i < Math.min(5, closeButtons.length); i++) {
      const button = closeButtons[i];
      const isVisible = await button.isVisible().catch(() => false);
      const className = await button.getAttribute('class').catch(() => '');
      const title = await button.getAttribute('title').catch(() => '');
      const ariaLabel = await button.getAttribute('aria-label').catch(() => '');

      console.log(`\n关闭按钮 ${i + 1}:`);
      console.log(`  - 可见: ${isVisible}`);
      console.log(`  - 类名: ${className}`);
      console.log(`  - title: ${title}`);
      console.log(`  - aria-label: ${ariaLabel}`);
    }

    // 5. 检查页面是否有遮罩层
    console.log('\n🔍 检查遮罩层...');
    const overlays = await page.$$('.next-overlay-wrapper, .overlay, [class*="mask"], [class*="backdrop"]');
    console.log(`找到 ${overlays.length} 个遮罩层`);

    for (let i = 0; i < overlays.length; i++) {
      const overlay = overlays[i];
      const isVisible = await overlay.isVisible().catch(() => false);
      const className = await overlay.getAttribute('class').catch(() => '');

      console.log(`遮罩层 ${i + 1}: 可见=${isVisible}, 类名="${className}"`);
    }

    // 6. 页面截图诊断
    console.log('\n📸 尝试页面截图进行诊断...');
    try {
      await page.screenshot({
        path: 'current-page-diagnosis.png',
        fullPage: false,
        type: 'png'
      });
      console.log('✅ 页面截图已保存: current-page-diagnosis.png');
    } catch (error) {
      console.log('⚠️ 截图失败:', error.message);
    }

    console.log('\n✅ 全面检查完成');

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
  }
}

// 运行检查
checkAllPopups();