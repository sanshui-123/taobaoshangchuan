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

    // 检查是否有模板商品ID配置（优化路径）
    const templateItemId = ctx.templateItemId ||
      process.env.TEMPLATE_ITEM_ID ||
      (ctx.taskCache && ctx.taskCache.taobaoItemId);

    if (templateItemId) {
      // 🚀 优化路径：使用直达链接跳过搜索流程
      ctx.logger.info('🚀 使用直达链接快速进入发布页面...');
      ctx.logger.info(`模板商品ID: ${templateItemId}`);

      const directUrl = `https://item.upload.taobao.com/sell/v2/publish.htm?copyItem=true&itemId=${templateItemId}&fromAIPublish=true`;
      ctx.logger.info(`直达链接: ${directUrl}`);

      // 直接访问发布页面
      await page.goto(directUrl, {
        waitUntil: 'domcontentloaded',
        timeout: timeout
      });

      // 等待页面加载完成
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // 检查是否需要登录
      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('passport')) {
        throw new Error('登录状态已失效，请重新登录');
      }

      ctx.logger.success('✅ 已通过直达链接进入发布页面');
      page1 = page;

    } else {
      // 传统路径：通过搜索和点击"发布相似品"
      ctx.logger.info('⚙️  使用传统搜索流程（未配置模板商品ID）...');

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

      // 打开我的商品列表
      ctx.logger.info('进入商品管理页面，准备搜索指定商品');
      await page.goto('https://myseller.taobao.com/home.htm/SellManage/all?current=1&pageSize=20', {
        waitUntil: 'networkidle'
      });
      await page.waitForTimeout(2000);

      // 查找商家编码搜索框
      const searchInputSelectors = ['#queryOuterId', 'input[placeholder*="商家编码"]'];
      let searchInput = null;
      for (const selector of searchInputSelectors) {
        const locator = page.locator(selector);
        if (await locator.count()) {
          searchInput = locator.first();
          break;
        }
      }
      if (!searchInput) {
        throw new Error('未找到商家编码搜索框，无法定位商品');
      }

      await searchInput.fill(ctx.productId);
      const searchButton = page.locator('button:has-text("搜索")').first();
      if (await searchButton.count()) {
        await searchButton.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(3000);

      // 定位商品所在行
      const rowSelectors = [
        `.next-table-row:has-text("${ctx.productId}")`,
        `tbody tr:has-text("${ctx.productId}")`
      ];
      let productRow = null;
      for (const selector of rowSelectors) {
        const candidate = page.locator(selector).first();
        if (await candidate.count()) {
          productRow = candidate;
          break;
        }
      }
      if (!productRow) {
        throw new Error(`未在商品列表中找到 ${ctx.productId}`);
      }
      ctx.logger.success('✅ 已定位至指定商品行');

      // 查找"发布相似品"按钮
      const publishSelectors = [
        'button:has-text("发布相似品")',
        'a:has-text("发布相似品")',
        '[class*="publish"]:has-text("发布相似品")'
      ];
      let publishButton = null;
      for (const selector of publishSelectors) {
        const candidate = productRow.locator(selector).first();
        if (await candidate.count()) {
          publishButton = candidate;
          break;
        }
      }
      if (!publishButton) {
        throw new Error('未找到"发布相似品"按钮');
      }

      ctx.logger.info('点击"发布相似品"进入发布页面...');
      const [newPage] = await Promise.all([
        context.waitForEvent('page').catch(() => null),
        publishButton.click({ timeout: 10000 })
      ]);

      if (newPage) {
        page1 = newPage;
        await page1.waitForLoadState('load');
      } else {
        // 某些情况下在同一页打开
        await page.waitForLoadState('networkidle');
        page1 = page;
      }
      ctx.logger.success('✅ 已从"发布相似品"入口进入发布页面');
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
