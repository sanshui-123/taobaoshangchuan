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
    console.log('📖 访问千牛卖家中心商品管理页面...');
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
    await page.waitForTimeout(3000);

    // 查找商家编码输入框
    console.log('🔍 查找商家编码输入框...');
    let searchInput;
    try {
      // 使用你提供的选择器
      searchInput = await page.locator('.input-queryOuterId input').first();
      if (!(await searchInput.isVisible())) {
        // 备用选择器
        searchInput = await page.locator('input[placeholder*="商家编码"]').first();
      }
    } catch (e) {
      // 尝试其他可能的选择器
      searchInput = await page.locator('input[placeholder*="编码"], input[placeholder*="商家"], input[placeholder*="ID"]').first();
    }

    if (await searchInput.isVisible()) {
      console.log('✅ 找到商家编码输入框，输入商品ID...');
      await searchInput.clear();
      await searchInput.fill(productId);
      await page.waitForTimeout(500);

      // 查找并点击搜索按钮
      console.log('🔎 查找搜索按钮...');
      let searchButton;
      try {
        searchButton = await page.locator('button.next-btn.next-small.next-btn-primary').first();
        if (!(await searchButton.isVisible())) {
          // 备用选择器
          searchButton = await page.locator('button:has-text("搜索"), button:has-text("查询"), .next-btn-primary').first();
        }
      } catch (e) {
        searchButton = await page.locator('button:has-text("搜索")').first();
      }

      if (await searchButton.isVisible()) {
        console.log('✅ 找到搜索按钮，点击搜索...');
        await searchButton.click();
        // 等待列表刷新
        await page.waitForTimeout(3000);
      } else {
        // 尝试按回车键
        console.log('⚠️ 未找到搜索按钮，尝试按回车键...');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);
      }
    } else {
      // 如果没有找到输入框，抛出异常并截图
      const timestamp = Date.now();
      const screenshotPath = path.resolve(
        process.cwd(),
        'screenshots',
        `check_no_input_${productId}_${timestamp}.png`
      );

      console.error('❌ 未找到商家编码输入框！');
      console.log('📸 保存截图:', screenshotPath);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      throw new Error(`无法找到商家编码输入框，页面可能加载失败或结构已改变。截图已保存: ${screenshotPath}`);
    }

    // 检查是否找到了商品
    console.log('🔍 检查搜索结果...');

    // 先等待页面加载完成
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 检查是否有空数据提示
    const hasEmptyData = await page.locator('.next-table-empty').isVisible();
    if (hasEmptyData) {
      console.log('❌ 找到空数据提示，商品不存在');

      // 截图保存
      const screenshotPath = path.resolve(
        process.cwd(),
        'screenshots',
        `check_empty_${productId}_${Date.now()}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 截图已保存: ${screenshotPath}`);

      return false;
    }

    // 检查表格行数
    const tableRows = await page.locator('.next-table-body tr').count();
    console.log(`📊 找到 ${tableRows} 行数据`);

    if (tableRows === 0) {
      console.log('❌ 没有找到任何商品行');
      return false;
    }

    // 查找包含商品ID的行
    const hasProduct = await page.locator('.next-table-cell-wrap', { hasText: productId }).isVisible();

    if (hasProduct) {
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

      // 截图保存当前状态
      const screenshotPath = path.resolve(
        process.cwd(),
        'screenshots',
        `check_notfound_${productId}_${Date.now()}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 截图已保存: ${screenshotPath}`);

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