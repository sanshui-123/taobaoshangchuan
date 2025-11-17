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

  let context;
  let page;
  let page1; // 发布页面

  try {
    // 获取配置
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

    // 只使用模板商品ID，直达发布页
    const templateItemId = ctx.templateItemId ||
      process.env.TEMPLATE_ITEM_ID ||
      (ctx.taskCache && (ctx.taskCache.templateItemId || ctx.taskCache.taobaoItemId));

    if (!templateItemId) {
      throw new Error('未配置 TEMPLATE_ITEM_ID（或 ctx.templateItemId），无法直达发布页面');
    }

    ctx.logger.info('🚀 使用模板商品直达发布页面...');
    ctx.logger.info(`模板商品ID: ${templateItemId}`);

    const directUrl = `https://item.upload.taobao.com/sell/v2/publish.htm?copyItem=true&itemId=${templateItemId}&fromAIPublish=true`;
    ctx.logger.info(`直达链接: ${directUrl}`);

    await page.bringToFront().catch(() => {});
    await page.goto(directUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeout
    });

    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      ctx.logger.warn('发布页未达到完全空闲状态，但继续执行（正常现象）');
    }
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('passport')) {
      throw new Error('登录状态已失效，请重新登录');
    }

    ctx.logger.success('✅ 已通过直达链接进入发布页面');
    page1 = page;

    ctx.logger.success('✅ 发布页面已打开');

    // 设置页面1的超时
    page1.setDefaultTimeout(timeout);

    // 等待发布页面加载（使用 try-catch 避免 networkidle 超时）
    try {
      await page1.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      ctx.logger.warn('发布页面未达到完全空闲状态，但继续执行');
    }
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

    // 截图保存（使用 try-catch 避免截图超时阻断流程）
    try {
      const screenshotPath = path.join(
        screenshotDir,
        `${ctx.productId}_step4_publish_page.png`
      );
      await page1.screenshot({
        path: screenshotPath,
        fullPage: false,  // 只截取可见区域，避免等待整页加载
        timeout: 10000    // 10秒超时
      });
      ctx.logger.info(`截图已保存: ${screenshotPath}`);
    } catch (screenshotError) {
      ctx.logger.warn(`截图失败（但不影响流程）: ${screenshotError.message}`);
    }

    // 更新缓存
    const taskCache = loadTaskCache(ctx.productId);
    taskCache.browserContext = {
      browser: true,
      pageCount: context ? context.pages().length : 1,
      publishPageUrl: page1.url(),
      templateItemId
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
