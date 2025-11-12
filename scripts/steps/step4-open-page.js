const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
const browserManager = require('../utils/browser-manager');

/**
 * 步骤4：打开发布页面
 * 使用Playwright启动浏览器并打开发布相似品页面
 */
const step4 = async (ctx) => {
  ctx.logger.info('启动浏览器，打开发布页面');

  // 创建心跳定时器
  const heartbeat = setInterval(() => {
    process.stdout.write('.');
  }, 5000);

  let browser;
  let context;
  let page;
  let page1; // 发布页面

  try {
    // 检查storage路径
    const storagePath = ctx.storagePath || process.env.TAOBAO_STORAGE_STATE_PATH;
    if (!storagePath || !fs.existsSync(storagePath)) {
      throw new Error('未找到登录状态文件，请先执行步骤3');
    }

    ctx.logger.info(`使用storage文件: ${storagePath}`);

    // 获取配置
    const headless = process.env.HEADLESS !== 'false';
    const timeout = parseInt(process.env.TAOBAO_TIMEOUT || '30000');
    const screenshotDir = process.env.TAOBAO_SCREENSHOT_DIR ||
      path.resolve(process.cwd(), 'screenshots');

    // 确保截图目录存在
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    // 使用全局browser-manager获取context和页面
    ctx.logger.info('获取浏览器上下文...');
    context = await browserManager.getContext();
    page = await browserManager.getMainPage();
    ctx.logger.info('✅ 使用已有浏览器上下文和主页面');

    // 设置超时
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);

    // 访问千牛主页
    await page.goto('https://myseller.taobao.com/home.htm', {
      waitUntil: 'networkidle'
    });

    // 检查是否已登录
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('passport')) {
      throw new Error('登录状态已失效，请重新登录');
    }

    ctx.logger.success('✅ 登录状态有效');

    // 等待页面加载
    await page.waitForTimeout(2000);

    // 查找并点击"我的商品"
    ctx.logger.info('查找"我的商品"菜单...');
    try {
      await page.waitForSelector('text=我的商品', { timeout: 10000 });
      await page.click('text=我的商品');
      ctx.logger.success('✅ 点击"我的商品"');
    } catch (error) {
      ctx.logger.warn('未找到"我的商品"菜单，尝试直接访问商品管理页面');
      await page.goto('https://myseller.taobao.com/home.htm/SellManage/all', {
        waitUntil: 'networkidle'
      });
    }

    // 等待商品列表加载
    await page.waitForTimeout(2000);

    // 查找商品
    ctx.logger.info(`查找商品ID: ${ctx.productId}`);
    let productFound = false;

    // 尝试多种选择器查找商品
    const selectors = [
      `text=${ctx.productId}`,
      `[title*="${ctx.productId}"]`,
      `[data-id*="${ctx.productId}"]`,
      `td:has-text("${ctx.productId}")`
    ];

    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        ctx.logger.success(`✅ 找到商品: ${selector}`);

        // 右键点击商品
        await page.click(selector, { button: 'right' });
        await page.waitForTimeout(500);
        break;
      } catch (e) {
        // 继续尝试下一个选择器
      }
    }

    // 如果右键菜单没反应，尝试直接进入发布页面
    ctx.logger.info('进入发布相似品页面...');

    // 直接在主页面访问发布页面，不打开新标签
    ctx.logger.info('访问发布页面...');
    try {
      await page.goto('https://sell.taobao.com/publish/publish.htm', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      ctx.logger.success('✅ 已访问发布页面');
      page1 = page; // 使用同一个页面
    } catch (error) {
      ctx.logger.error(`访问发布页面失败: ${error.message}`);
      throw new Error('无法访问发布页面');
    }

    ctx.logger.success('✅ 发布页面已打开');

    // 设置页面1的超时
    page1.setDefaultTimeout(timeout);

    // 等待发布页面加载
    await page1.waitForLoadState('networkidle');
    await page1.waitForTimeout(3000);

    // 验证页面是否正确加载
    const pageTitle = await page1.title();
    ctx.logger.info(`页面标题: ${pageTitle}`);

    // 检查是否在正确的发布页面
    if (pageTitle.includes('发布') || page1.url().includes('publish')) {
      ctx.logger.success('✅ 成功进入发布页面');
    } else {
      ctx.logger.warn('页面可能未正确加载，但继续执行');
    }

    // 保存页面引用到上下文
    ctx.page = page; // 主页面
    ctx.page1 = page1; // 发布页面

    // 截图保存
    const screenshotPath = path.join(
      screenshotDir,
      `${ctx.productId}_step4_publish_page.png`
    );
    await page1.screenshot({ path: screenshotPath, fullPage: true });
    ctx.logger.info(`截图已保存: ${screenshotPath}`);

    // 更新缓存
    const taskCache = loadTaskCache(ctx.productId);
    taskCache.browserContext = {
      browser: true,
      pageCount: 2,
      publishPageUrl: page1.url()
    };
    taskCache.stepStatus[4] = 'done';
    saveTaskCache(ctx.productId, taskCache);

    updateStepStatus(ctx.productId, 4, 'done');

    ctx.logger.success('\n=== 步骤4完成 ===');
    ctx.logger.info(`发布页面URL: ${page1.url()}`);
    ctx.logger.info('浏览器已就绪，可以继续下一步');

  } catch (error) {
    ctx.logger.error(`打开发布页面失败: ${error.message}`);

    // 尝试截图保存错误信息
    if (page) {
      try {
        const errorScreenshot = path.join(
          screenshotDir,
          `${ctx.productId}_step4_error.png`
        );
        await page.screenshot({ path: errorScreenshot, fullPage: true });
        ctx.logger.info(`错误截图已保存: ${errorScreenshot}`);
      } catch (screenshotError) {
        ctx.logger.error(`截图失败: ${screenshotError.message}`);
      }
    }

    // 注意：不关闭浏览器，保持打开状态供后续步骤使用
    ctx.logger.info('💡 浏览器保持打开状态，供后续步骤使用');

    updateStepStatus(ctx.productId, 4, 'failed');
    throw error;

  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');

    // 浏览器保持打开状态，供后续步骤使用
  }
};

module.exports = { step4 };