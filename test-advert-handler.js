/**
 * 广告处理模块测试脚本
 * 用于测试素材库页面的广告弹窗处理功能
 */

const { chromium } = require('playwright');
const { closeMaterialCenterPopups, closeAllPopups } = require('./scripts/utils/advert-handler');
const fs = require('fs');
const path = require('path');

// 检查是否启用详细模式
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// 创建截图目录
function ensureScreenshotDir() {
  const screenshotDir = './screenshots';
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    console.log(`📁 创建截图目录: ${screenshotDir}`);
  }
}

// 安全的截图保存函数
async function safeScreenshot(page, filename) {
  const screenshotPath = `./screenshots/${filename}`;
  try {
    logVerbose(`开始保存截图: ${filename}`);

    // 使用 viewport 截图而不是全页面截图，避免性能问题
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,  // 改为 viewport 截图
      type: 'png'
    });

    // 检查文件是否真的存在且可读
    if (fs.existsSync(screenshotPath)) {
      const stats = fs.statSync(screenshotPath);
      console.log(`✅ 截图已保存: ${screenshotPath} (${stats.size} bytes)`);
      logVerbose(`截图详细信息:`, {
        filename,
        path: screenshotPath,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      });
      return screenshotPath;
    } else {
      throw new Error('截图文件未创建');
    }
  } catch (error) {
    console.error(`❌ 截图保存失败: ${screenshotPath} - ${error.message}`);
    logVerbose('截图错误详情:', {
      filename,
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

// 详细日志函数
function logVerbose(message, data = null) {
  if (VERBOSE) {
    if (data) {
      console.log(`[详细] ${message}`, data);
    } else {
      console.log(`[详细] ${message}`);
    }
  }
}

async function testAdvertHandler() {
  console.log('🧪 开始测试广告处理模块...');
  console.log(`🔧 详细模式: ${VERBOSE ? '开启' : '关闭'}`);
  console.log('🔗 连接到当前运行的 Chrome (端口 9222)...');

  // 确保截图目录存在
  ensureScreenshotDir();

  let browser;
  let page;

  try {
    // 连接到当前运行的 Chrome
    logVerbose('尝试连接到 Chrome CDP 端点...');
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    console.log('✅ Chrome 连接成功');

    // 获取或创建 context
    logVerbose('获取现有 context...');
    const contexts = browser.contexts();
    let context;
    if (contexts.length > 0) {
      context = contexts[0];
      console.log('✅ 使用现有 context');
      logVerbose('Context 详细信息:', {
        browserContextIds: contexts.map(c => c._browserContextId),
        pagesCount: contexts[0].pages().length
      });
    } else {
      context = await browser.newContext();
      console.log('✅ 创建新 context');
    }

    // 获取现有页面或创建新页面
    logVerbose('获取现有页面...');
    const existingPages = context.pages();
    if (existingPages.length > 0) {
      page = existingPages[0];
      console.log('✅ 使用现有页面');
      logVerbose('页面信息:', {
        url: page.url(),
        title: await page.title().catch(() => 'N/A')
      });
    } else {
      page = await context.newPage();
      console.log('✅ 创建新页面');
    }

    // 访问素材库页面
    console.log('🌐 访问素材库页面...');
    logVerbose('导航到素材库 URL...');
    await page.goto('https://myseller.taobao.com/home.htm/material-center/mine-material/sucai-tu');

    // 等待页面加载
    console.log('⏳ 等待页面加载完成...');
    await page.waitForTimeout(3000);
    logVerbose('页面当前 URL:', page.url());
    logVerbose('页面标题:', await page.title().catch(() => 'N/A'));

    // 保存页面加载后的截图
    console.log('📸 保存页面初始状态截图...');
    await safeScreenshot(page, 'advert-test-initial.png');

    // 测试1：单次广告处理
    console.log('\n=== 测试1：单次广告处理 ===');
    logVerbose('开始执行单次广告处理...');
    const result1 = await closeMaterialCenterPopups(page);
    console.log('单次处理结果:', result1);
    logVerbose('单次处理后等待2秒...');

    // 保存第一次处理后的截图
    await safeScreenshot(page, 'advert-test-after-single.png');

    // 等待2秒看看是否还有新的弹窗出现
    await page.waitForTimeout(2000);

    // 测试2：批量广告处理
    console.log('\n=== 测试2：批量广告处理 ===');
    logVerbose('开始执行批量广告处理(2次)...');
    const result2 = await closeAllPopups(page, 2);
    console.log('批量处理结果:', result2);

    // 保存最终截图
    console.log('📸 保存最终结果截图...');
    const finalScreenshot = await safeScreenshot(page, 'advert-test-result.png');

    // 检查最终截图
    if (finalScreenshot) {
      console.log(`📊 截图文件信息:`, {
        path: finalScreenshot,
        size: fs.existsSync(finalScreenshot) ? fs.statSync(finalScreenshot).size : 'N/A',
        readable: fs.existsSync(finalScreenshot)
      });
    }

    console.log('\n🎉 广告处理测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('❌ 错误堆栈:', error.stack);

    // 保存错误截图
    if (page) {
      console.log('📸 尝试保存错误截图...');
      const errorScreenshot = await safeScreenshot(page, 'advert-test-error.png');
      if (errorScreenshot) {
        console.log(`❌ 错误截图: ${errorScreenshot}`);
      }
    }

  } finally {
    // 不关闭 browser，因为我们复用现有的 Chrome 实例
    console.log('🔄 保持 Chrome 实例运行，供后续流程复用');

    // 打印截图目录信息
    const screenshotDir = './screenshots';
    if (fs.existsSync(screenshotDir)) {
      const files = fs.readdirSync(screenshotDir).filter(f => f.includes('advert-test'));
      console.log(`📁 截图目录中的文件:`, files);
      files.forEach(file => {
        const filePath = path.join(screenshotDir, file);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          console.log(`  - ${file}: ${stats.size} bytes, 创建时间: ${stats.mtime}`);
        }
      });
    }
  }
}

// 运行测试
if (require.main === module) {
  testAdvertHandler().catch(console.error);
}

module.exports = { testAdvertHandler };