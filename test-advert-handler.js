/**
 * 广告处理模块测试脚本
 * 用于测试素材库页面的广告弹窗处理功能
 */

const { chromium } = require('playwright');
const { closeMaterialCenterPopups, closeAllPopups } = require('./scripts/utils/advert-handler');

async function testAdvertHandler() {
  console.log('🧪 开始测试广告处理模块...');

  let browser;
  let page;

  try {
    // 启动浏览器
    browser = await chromium.launch({
      headless: false,
      slowMo: 1000 // 减慢操作速度便于观察
    });

    const context = await browser.newContext();
    page = await context.newPage();

    // 访问素材库页面
    console.log('🌐 访问素材库页面...');
    await page.goto('https://myseller.taobao.com/home.htm/material-center/mine-material/sucai-tu');

    // 等待页面加载
    await page.waitForTimeout(3000);

    // 测试1：单次广告处理
    console.log('\n=== 测试1：单次广告处理 ===');
    const result1 = await closeMaterialCenterPopups(page);
    console.log('单次处理结果:', result1);

    // 等待2秒看看是否还有新的弹窗出现
    await page.waitForTimeout(2000);

    // 测试2：批量广告处理
    console.log('\n=== 测试2：批量广告处理 ===');
    const result2 = await closeAllPopups(page, 2);
    console.log('批量处理结果:', result2);

    // 保存截图
    const screenshotPath = './screenshots/advert-test-result.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`✅ 截图已保存: ${screenshotPath}`);

    console.log('\n🎉 广告处理测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);

    // 保存错误截图
    if (page) {
      try {
        const errorScreenshot = './screenshots/advert-test-error.png';
        await page.screenshot({ path: errorScreenshot, fullPage: true });
        console.log(`❌ 错误截图: ${errorScreenshot}`);
      } catch (screenshotError) {
        // 忽略截图错误
      }
    }

  } finally {
    // 清理资源
    if (browser) {
      await browser.close();
    }
  }
}

// 运行测试
if (require.main === module) {
  testAdvertHandler().catch(console.error);
}

module.exports = { testAdvertHandler };