const { chromium } = require('playwright');

async function debugPopup() {
  console.log('🔍 分析弹窗状态和关闭按钮...');

  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    // 查找弹窗元素
    const popups = await page.$$('div.notify_body__vpald, div[class*="notify_body"]');
    console.log('找到弹窗数量:', popups.length);

    for (let i = 0; i < popups.length; i++) {
      const popup = popups[i];
      const isVisible = await popup.isVisible().catch(() => false);
      const boundingBox = await popup.boundingBox().catch(() => null);
      const className = await popup.getAttribute('class').catch(() => '');
      const textContent = await popup.textContent().catch(() => '');

      console.log(`弹窗 ${i+1}:`);
      console.log(`  可见: ${isVisible}`);
      console.log(`  位置: ${JSON.stringify(boundingBox)}`);
      console.log(`  类名: ${className}`);
      console.log(`  内容: ${textContent.substring(0, 100)}`);

      if (isVisible) {
        // 查找关闭按钮
        const closeButtons = await page.evaluate((el) => {
          const popup = el;
          const buttons = popup.querySelectorAll('button, [class*="close"], [class*="icon"]');
          return Array.from(buttons).map(btn => ({
            tagName: btn.tagName,
            className: btn.className,
            textContent: btn.textContent,
            innerHTML: btn.innerHTML
          }));
        }, popup);

        console.log(`  关闭按钮数量: ${closeButtons.length}`);
        closeButtons.forEach((btn, idx) => {
          console.log(`    按钮${idx+1}: ${btn.tagName}.${btn.className}`);
        });

        // 尝试查找特定的关闭按钮选择器
        const specificButton = await popup.$('button.next-icon.next-icon-close');
        console.log(`  找到特定关闭按钮: ${specificButton ? '是' : '否'}`);

        // 尝试其他可能的关闭按钮选择器
        const altButton = await popup.$('button[class*="close"], i[class*="close"], [class*="close"]');
        console.log(`  找到其他关闭按钮: ${altButton ? '是' : '否'}`);
      }
    }

  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

debugPopup();