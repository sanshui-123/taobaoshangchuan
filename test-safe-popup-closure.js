const { closeMaterialCenterPopups } = require('./scripts/utils/advert-handler');
const { chromium } = require('playwright');

async function testSafePopupClosure() {
  console.log('🧪 测试修正后的安全弹窗处理器...');

  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    console.log('🌐 确保在素材库页面...');
    await page.goto('https://myseller.taobao.com/home.htm/material-center/mine-material/sucai-tu');
    await page.waitForTimeout(2000);

    console.log('📸 测试前的截图...');
    try {
      await page.screenshot({
        path: 'test-fixed-before.png',
        fullPage: false,
        type: 'png'
      });
      console.log('✅ 测试前截图完成');
    } catch (e) {
      console.log('⚠️ 截图跳过:', e.message);
    }

    console.log('🔧 运行修正后的弹窗处理器...');
    const result = await closeMaterialCenterPopups(page);
    console.log('处理结果:', result);

    console.log('⏳ 等待3秒确保没有触发违规弹窗...');
    await page.waitForTimeout(3000);

    console.log('📸 测试后的截图...');
    try {
      await page.screenshot({
        path: 'test-fixed-after.png',
        fullPage: false,
        type: 'png'
      });
      console.log('✅ 测试后截图完成');
    } catch (e) {
      console.log('⚠️ 截图跳过:', e.message);
    }

    console.log('🔍 检查是否有违规管控弹窗...');
    const violationElements = await page.$$('div:has-text("违规"), div:has-text("管控")');
    console.log('违规相关元素数量:', violationElements.length);

    let hasViolationPopup = false;
    for (let i = 0; i < violationElements.length; i++) {
      const elem = violationElements[i];
      const isVisible = await elem.isVisible().catch(() => false);
      const textContent = await elem.textContent().catch(() => '');
      if (isVisible && textContent.includes('违规管控')) {
        console.log('❌ 仍然有违规管控弹窗:', textContent.substring(0, 50));
        hasViolationPopup = true;
      }
    }

    if (!hasViolationPopup) {
      console.log('✅ 成功！没有触发违规管控弹窗');
    }

    console.log('🎉 测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

testSafePopupClosure();