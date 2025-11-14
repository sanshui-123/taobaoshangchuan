const { chromium } = require('playwright');

async function captureResult() {
  console.log('🧪 连接到 Chrome 并截取关闭后状态...');

  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    console.log('📍 当前页面:', page.url());
    console.log('📸 截取页面右下角状态...');

    // 截取页面状态
    await page.screenshot({
      path: 'popup-closed-result.png',
      fullPage: false,
      type: 'png'
    });
    console.log('✅ 截图已保存: popup-closed-result.png');

    // 检查是否还有弹窗
    const popups = await page.$$('div.notify_body__vpald, div[class*="notify_body"]');
    console.log('剩余弹窗数量:', popups.length);

    if (popups.length === 0) {
      console.log('✅ 确认：所有弹窗已关闭');
    } else {
      for (let i = 0; i < popups.length; i++) {
        const text = await popups[i].textContent().catch(() => '');
        const visible = await popups[i].isVisible().catch(() => false);
        console.log(`弹窗 ${i+1}: 可见=${visible}, 文本=${text.substring(0, 50)}`);
      }
    }

    console.log('🎉 弹窗关闭验证完成！');

  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

captureResult();