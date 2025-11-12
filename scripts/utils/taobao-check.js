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
    // 获取已有页面（不创建新页面）
    page = await browserManager.getPage();
    page.setDefaultTimeout(timeout);
    console.log('✅ 复用已有页面');

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

    // 等待主表格真正渲染完
    console.log('⏳ 等待主表格渲染...');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('div.next-table', { timeout: 20000 });
    console.log('✅ 主表格已渲染');

    try {
      // 使用最精确的选择器定位输入框
      console.log('🔍 查找商家编码输入框...');
      const codeInput = page.locator('span.next-input.input-queryOuterId input');
      await codeInput.waitFor({ state: 'visible', timeout: 20000 });
      console.log('✅ 找到商家编码输入框');

      // 输入商品ID
      console.log('✅ 输入商品ID:', productId);
      await codeInput.clear();
      await codeInput.fill(productId);

      // 查找并点击搜索按钮
      console.log('🔎 查找搜索按钮...');
      const searchButton = page.locator('button.next-btn.next-small.next-btn-primary', { hasText: '搜索' });
      await searchButton.waitFor({ state: 'visible', timeout: 10000 });
      console.log('✅ 找到搜索按钮');

      await searchButton.click();
      console.log('✅ 已点击搜索按钮');

      // 等待搜索结果
      await page.waitForTimeout(3000);

    } catch (error) {
      // 打印详细错误信息
      const currentUrl = await page.url();
      console.error('❌ 错误详情:', error.message);
      console.error('当前页面URL:', currentUrl);

      // 保存错误截图
      const timestamp = Date.now();
      const screenshotPath = path.resolve(
        process.cwd(),
        'screenshots',
        `check_error_${productId}_${timestamp}.png`
      );

      console.log('📸 保存错误截图:', screenshotPath);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      throw new Error(`查重失败: ${error.message}。当前URL: ${currentUrl}。截图已保存: ${screenshotPath}`);
    }

    // 检查是否找到了商品
    console.log('🔍 检查搜索结果...');

    // 等待表格渲染 - 使用千牛实际DOM结构
    console.log('⏳ 等待表格内容渲染...');
    await page.waitForSelector('.next-table .next-table-inner table', { timeout: 15000 });
    console.log('✅ 表格内容已渲染');

    // 等待一下确保数据加载完成
    await page.waitForTimeout(1000);

    // 检查是否有空数据提示
    const emptyVisible = await page.locator('.next-table-empty').isVisible().catch(() => false);
    console.log(`📝 空数据提示状态: ${emptyVisible}`);

    // 统计商品行数 - 使用实际DOM结构 tbody > tr.next-table-row
    const tableRows = page.locator('tbody tr.next-table-row');
    const rows = await tableRows.count();
    console.log(`📊 找到 ${rows} 行商品数据`);

    if (emptyVisible || rows === 0) {
      console.log(`❌ 商品不存在 (空提示: ${emptyVisible}, 行数: ${rows})`);

      // 截图保存空结果
      const screenshotPath = path.resolve(
        process.cwd(),
        'screenshots',
        `check_empty_${productId}_${Date.now()}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 截图已保存: ${screenshotPath}`);

      return false;
    }

    // 检查商品ID是否在结果中
    console.log(`🔍 检查商品ID ${productId} 是否存在...`);

    // 遍历每一行，查找商品ID
    let productFound = false;

    for (let i = 0; i < rows; i++) {
      const row = tableRows.nth(i);
      const rowText = await row.textContent();
      if (rowText.includes(productId)) {
        productFound = true;
        console.log(`✅ 找到商品 ${productId} 在第 ${i + 1} 行`);
        break;
      }
    }

    if (productFound) {
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
      console.log(`❌ 商品 ${productId} 不在搜索结果中（但有其他 ${rows} 行数据）`);

      // 截图保存
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

    // 注释掉错误截图，避免页面超时关闭
    // if (page) {
    //   try {
    //     const errorScreenshotPath = path.resolve(
    //       process.cwd(),
    //       'screenshots',
    //       `check_error_${productId}_${Date.now()}.png`
    //     );
    //     await page.screenshot({ path: errorScreenshotPath, fullPage: true });
    //     console.log(`📸 错误截图已保存: ${errorScreenshotPath}`);
    //   } catch (screenshotError) {
    //     // 忽略截图错误
    //   }
    // }

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