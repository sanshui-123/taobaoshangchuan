/**
 * 权限失效弹窗处理测试脚本
 * 用于验证advert-handler中权限失效弹窗的处理能力
 */

const { closeMaterialCenterPopups } = require('./scripts/utils/advert-handler');
const { chromium } = require('playwright');

async function testAuthFailureHandling() {
  console.log('🧪 开始测试权限失效弹窗处理...');

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

    // 测试广告处理功能
    console.log('\n🔍 开始检查权限失效弹窗...');
    const result = await closeMaterialCenterPopups(page);

    console.log('\n📊 处理结果:');
    console.log(`- 视频弹窗: ${result.videoDialogClosed ? '✅ 已关闭' : '❌ 未发现'}`);
    console.log(`- 迁移引导: ${result.migrationGuideSkipped ? '✅ 已关闭' : '❌ 未发现'}`);
    console.log(`- 通知弹窗: ${result.bottomNotificationClosed ? '✅ 已关闭' : '❌ 未发现'}`);
    console.log(`- 权限失效: ${result.authFailureClosed ? '✅ 已关闭' : '❌ 未发现'}`);
    console.log(`- 总计关闭: ${result.totalClosed} 个弹窗`);

    if (result.totalClosed > 0) {
      console.log('\n🎉 成功处理了弹窗干扰！');
    } else {
      console.log('\n✨ 当前页面很干净，没有发现弹窗');
    }

    // 等待几秒观察页面状态
    console.log('\n⏳ 等待5秒观察页面状态...');
    await page.waitForTimeout(5000);

    console.log('\n✅ 测试完成');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('详细错误:', error);
  } finally {
    // 注意：不关闭浏览器，因为我们是连接到现有浏览器
    console.log('\n📝 测试结束，浏览器连接保持打开状态');
  }
}

// 运行测试
testAuthFailureHandling();