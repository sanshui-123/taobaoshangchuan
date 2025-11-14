/**
 * 广告处理模块测试脚本
 * 用于测试素材库页面的广告弹窗处理功能
 */

const { chromium } = require('playwright');
const { closeMaterialCenterPopups, closeAllPopups } = require('./scripts/utils/advert-handler');

async function testAdvertHandler() {
  console.log('🧪 开始测试广告处理模块...');
  console.log('🔗 连接到当前运行的 Chrome (端口 9222)...');

  let browser;
  let page;

  try {
    // 连接到当前运行的 Chrome
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    console.log('✅ Chrome 连接成功');

    // 获取或创建 context
    const contexts = browser.contexts();
    let context;
    if (contexts.length > 0) {
      context = contexts[0];
      console.log('✅ 使用现有 context');
    } else {
      context = await browser.newContext();
      console.log('✅ 创建新 context');
    }

    // 获取现有页面或创建新页面
    const existingPages = context.pages();
    if (existingPages.length > 0) {
      page = existingPages[0];
      console.log('✅ 使用现有页面');
    } else {
      page = await context.newPage();
      console.log('✅ 创建新页面');
    }

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
    // 不关闭 browser，因为我们复用现有的 Chrome 实例
    console.log('🔄 保持 Chrome 实例运行，供后续流程复用');
  }
}

// 运行测试
if (require.main === module) {
  testAdvertHandler().catch(console.error);
}

module.exports = { testAdvertHandler };