/**
 * 淘宝商品查重工具
 * 使用 Playwright 检查商品是否已上传到淘宝
 */
const path = require('path');
const browserManager = require('./browser-manager');

/**
 * 检查商品是否已存在于淘宝
 * @param {string} productId - 商品ID
 * @returns {Promise<boolean>} - 返回商品是否存在
 */
async function checkProductExists(productId) {
  if (!productId) {
    console.log('❌ 商品ID为空');
    return false;
  }

  // 获取存储状态路径
  const storageStatePath = process.env.STORAGE_STATE_PATH ||
                          process.env.TAOBAO_STORAGE_STATE_PATH ||
                          path.resolve(process.cwd(), 'storage/storageState.json');

  // 检查存储状态文件是否存在
  if (!require('fs').existsSync(storageStatePath)) {
    console.log(`❌ 存储状态文件不存在: ${storageStatePath}`);
    return false;
  }

  // 获取浏览器配置
  const headless = process.env.HEADLESS !== 'false';  // 默认为true，只有明确设置为false时才显示浏览器
  const timeout = parseInt(process.env.TIMEOUT || '30000');

  console.log(`\n🔍 开始检查商品是否存在: ${productId}`);
  console.log(`📁 存储状态文件: ${storageStatePath}`);
  console.log(`🌐 无头模式: ${headless ? '是' : '否'}`);
  console.log(`📋 HEADLESS配置值: ${process.env.HEADLESS || 'undefined'}`);

  let context = null;
  let page = null;

  try {
    // 使用持久化浏览器上下文
    context = await browserManager.getContext();
    page = await context.newPage();
    page.setDefaultTimeout(timeout);

    // 访问千牛卖家中心-我的商品页面
    console.log('📖 访问千牛卖家中心...');
    try {
      await page.goto('https://myseller.taobao.com/home.htm/SellManage/all', {
        waitUntil: 'networkidle',
        timeout: 30000 // 30秒超时
      });
    } catch (error) {
      // 页面加载失败，截图并抛出异常
      const timestamp = Date.now();
      const screenshotPath = path.resolve(
        process.cwd(),
        'screenshots',
        `check_page_load_fail_${productId}_${timestamp}.png`
      );

      console.error('❌ 页面加载失败!');
      console.log('📸 保存截图:', screenshotPath);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      throw new Error(`页面加载失败: ${error.message}。截图已保存: ${screenshotPath}`);
    }

    // 等待页面加载
    await page.waitForTimeout(2000);

    // 查找搜索框
    console.log('🔍 查找搜索框...');
    const searchInput = await page.locator('input[placeholder*="搜索"], input[placeholder*="商品"]').first();

    if (await searchInput.isVisible()) {
      console.log('✅ 找到搜索框，输入商品ID...');
      await searchInput.fill(productId);
      await page.waitForTimeout(500);

      // 点击搜索按钮或按回车
      console.log('🔎 提交搜索...');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
    } else {
      // 如果没有找到搜索框，抛出异常并截图
      const timestamp = Date.now();
      const screenshotPath = path.resolve(
        process.cwd(),
        'screenshots',
        `check_no_searchbox_${productId}_${timestamp}.png`
      );

      console.error('❌ 未找到搜索框！');
      console.log('📸 保存截图:', screenshotPath);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      throw new Error(`无法找到搜索框，页面可能加载失败。截图已保存: ${screenshotPath}`);
    }

    // 检查是否找到了商品
    console.log('🔍 检查搜索结果...');

    // 多种方式检查商品是否存在
    const exists = await Promise.race([
      // 方法1: 查找包含商品ID的文本
      page.locator(`text=${productId}`).isVisible(),

      // 方法2: 查找商品链接
      page.locator(`a[href*="${productId}"]`).isVisible(),

      // 方法3: 查找商品标题或ID单元格
      page.locator('td, div, span').filter({ hasText: productId }).first().isVisible()
    ]);

    if (exists) {
      console.log(`✅ 商品 ${productId} 已存在于淘宝`);

      // 截图保存证据
      const screenshotPath = path.resolve(
        process.cwd(),
        'screenshots',
        `check_exists_${productId}_${Date.now()}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 截图已保存: ${screenshotPath}`);

      return true;
    } else {
      console.log(`❌ 商品 ${productId} 不存在于淘宝`);
      return false;
    }

  } catch (error) {
    console.error(`❌ 检查商品时出错: ${error.message}`);

    // 尝试截图错误页面
    if (page) {
      try {
        const errorScreenshotPath = path.resolve(
          process.cwd(),
          'screenshots',
          `check_error_${productId}_${Date.now()}.png`
        );
        await page.screenshot({ path: errorScreenshotPath, fullPage: true });
        console.log(`📸 错误截图已保存: ${errorScreenshotPath}`);
      } catch (screenshotError) {
        // 忽略截图错误
      }
    }

    return false;
  }
  // 注意：不关闭页面，保持浏览器打开状态
  console.log('📄 检查完成，页面保持打开状态');
}

// 如果直接运行此文件
if (require.main === module) {
  const productId = process.argv[2];

  if (!productId) {
    console.error('请提供商品ID作为参数');
    console.log('用法: node taobao-check.js <productId>');
    process.exit(1);
  }

  checkProductExists(productId)
    .then(exists => {
      console.log(`\n最终结果: ${exists ? '商品存在' : '商品不存在'}`);
      process.exit(exists ? 0 : 1);
    })
    .catch(error => {
      console.error('执行失败:', error);
      process.exit(1);
    });
}

module.exports = { checkProductExists };