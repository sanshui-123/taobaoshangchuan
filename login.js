const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/**
 * 淘宝登录脚本
 * 保存登录状态到storage文件
 */
async function login() {
  console.log('🚀 启动淘宝登录流程...');

  const storagePath = process.env.TAOBAO_STORAGE_STATE_PATH ||
    path.resolve(process.cwd(), 'storage', 'taobao-storage-state.json');

  // 确保storage目录存在
  const storageDir = path.dirname(storagePath);
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  let browser;
  try {
    // 启动浏览器
    console.log('🌐 启动浏览器...');
    browser = await chromium.launch({
      headless: false, // 必须有头模式，方便用户手动登录
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const context = await browser.newContext({
      viewport: null,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    const page = await context.newPage();

    // 访问千牛主页
    console.log('📍 访问千牛主页...');
    await page.goto('https://myseller.taobao.com', {
      waitUntil: 'networkidle'
    });

    // 检查是否已登录
    console.log('🔍 检查登录状态...');

    // 等待用户登录
    console.log('\n⚠️  请在浏览器中完成登录操作');
    console.log('   - 扫码登录或账号密码登录');
    console.log('   - 登录成功后请勿关闭浏览器');
    console.log('   - 程序将自动检测并保存登录状态\n');

    // 轮询检查登录状态
    let loginSuccess = false;
    let attempts = 0;
    const maxAttempts = 120; // 最多等待2分钟

    while (!loginSuccess && attempts < maxAttempts) {
      attempts++;

      try {
        // 检查是否包含登录成功标志
        const url = page.url();

        // 方法1：检查URL
        if (url.includes('myseller.taobao.com') &&
            !url.includes('login') &&
            !url.includes('passport')) {

          // 方法2：检查页面是否有用户信息
          const userInfo = await page.$('.user-nick, .header-user, .user-info');

          if (userInfo || url.includes('home.htm')) {
            loginSuccess = true;
            console.log('\n✅ 检测到登录成功！');
            break;
          }
        }

        // 如果还在登录页面
        if (url.includes('login.taobao.com') || url.includes('passport')) {
          console.log(`   等待登录中... (${attempts}/${maxAttempts})`);
        }

      } catch (error) {
        console.log(`   检查登录状态时出错: ${error.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!loginSuccess) {
      console.log('\n❌ 登录超时！');
      console.log('   请确保已完成登录后重试');
      process.exit(11); // 退出码11：超时
    }

    // 等待一下确保页面完全加载
    await page.waitForTimeout(3000);

    // 保存storage state
    console.log('\n💾 保存登录状态...');
    const storageState = await context.storageState();

    // 写入文件
    fs.writeFileSync(storagePath, JSON.stringify(storageState, null, 2));
    console.log(`✅ 登录状态已保存到: ${storagePath}`);

    // 截图作为凭证
    const screenshotPath = path.join(
      path.dirname(storagePath),
      'login-proof.png'
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 登录截图已保存: ${screenshotPath}`);

    console.log('\n✅ 登录流程完成！');
    process.exit(0); // 退出码0：成功

  } catch (error) {
    console.error('\n❌ 登录失败:', error.message);

    if (error.message.includes('SIGINT')) {
      console.log('   用户中断登录');
      process.exit(10); // 退出码10：用户中断
    }

    process.exit(1); // 退出码1：其他错误

  } finally {
    if (browser) {
      console.log('\n🔒 关闭浏览器...');
      await browser.close();
    }
  }
}

// 处理Ctrl+C中断
process.on('SIGINT', () => {
  console.log('\n\n⚠️  接收到中断信号，正在退出...');
  process.exit(10);
});

// 运行登录
login().catch(error => {
  console.error('\n💥 登录程序异常:', error);
  process.exit(1);
});