/**
 * 简化的广告处理测试脚本
 * 专注于广告检测和关闭逻辑，跳过截图功能
 */

const { chromium } = require('playwright');
const { closeMaterialCenterPopups, closeAllPopups } = require('./scripts/utils/advert-handler');

async function testAdvertHandlerSimple() {
  console.log('🧪 开始简化广告处理测试...');
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
      console.log(`📍 当前页面: ${page.url()}`);
    } else {
      page = await context.newPage();
      console.log('✅ 创建新页面');
    }

    // 检查页面状态
    console.log('📊 页面状态检查:');
    try {
      const title = await page.title();
      const url = page.url();
      console.log(`  - 标题: ${title}`);
      console.log(`  - URL: ${url}`);
    } catch (e) {
      console.log(`  - 页面状态检查失败: ${e.message}`);
    }

    // 如果不是素材库页面，导航到素材库
    if (!page.url().includes('material-center')) {
      console.log('🌐 导航到素材库页面...');
      await page.goto('https://myseller.taobao.com/home.htm/material-center/mine-material/sucai-tu');
      console.log('⏳ 等待页面加载...');
      await page.waitForTimeout(3000);
    }

    console.log('\n=== 🔍 开始广告处理测试 ===');

    // 测试1：单次广告处理
    console.log('\n📋 测试1：单次广告处理');
    const result1 = await closeMaterialCenterPopups(page);
    console.log('📊 单次处理结果:', JSON.stringify(result1, null, 2));

    // 等待2秒
    await page.waitForTimeout(2000);

    // 测试2：批量广告处理
    console.log('\n📋 测试2：批量广告处理（3次）');
    const result2 = await closeAllPopups(page, 3);
    console.log('📊 批量处理结果:', JSON.stringify(result2, null, 2));

    console.log('\n✅ 广告处理测试完成！');
    console.log('📝 总结:');
    console.log(`  - 单次处理关闭弹窗: ${result1.totalClosed} 个`);
    console.log(`  - 批量处理关闭弹窗: ${result2.totalClosed} 个`);
    console.log(`  - 视频弹窗: ${result1.videoDialogClosed ? '✅ 已关闭' : '❌ 未发现'}`);
    console.log(`  - 迁移引导: ${result1.migrationGuideSkipped ? '✅ 已跳过' : '❌ 未发现'}`);
    console.log(`  - 右下角通知: ${result1.bottomNotificationClosed ? '✅ 已关闭' : '❌ 未发现'}`);

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('❌ 错误堆栈:', error.stack);
  } finally {
    console.log('🔄 保持 Chrome 实例运行，供后续流程复用');
  }
}

// 运行测试
if (require.main === module) {
  testAdvertHandlerSimple().catch(console.error);
}

module.exports = { testAdvertHandlerSimple };