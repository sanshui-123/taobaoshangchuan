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
      if (process.env.TAKE_SCREENSHOT === 'true') {
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }

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
      if (process.env.TAKE_SCREENSHOT === 'true') {
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }

      throw new Error(`查重失败: ${error.message}。当前URL: ${currentUrl}。截图已保存: ${screenshotPath}`);
    }

    // 检查是否找到了商品
    console.log('🔍 检查搜索结果...');

    // 等待搜索结果加载 - 使用多种策略
    console.log('⏳ 等待搜索结果加载...');

    let searchResultsFound = false;

    // 策略1: 等待表格或空数据提示出现
    try {
      await Promise.race([
        page.waitForSelector('.next-table .next-table-inner table', { timeout: 10000 }),
        page.waitForSelector('.next-table-empty', { timeout: 10000 })
      ]);
      searchResultsFound = true;
      console.log('✅ 搜索结果已加载（表格或空数据）');
    } catch (error) {
      console.log('⚠️ 表格选择器超时，尝试其他策略...');
    }

    // 策略2: 如果表格选择器失败，尝试更通用的选择器
    if (!searchResultsFound) {
      try {
        await page.waitForSelector('table', { timeout: 5000 });
        searchResultsFound = true;
        console.log('✅ 找到通用table元素');
      } catch (error) {
        console.log('⚠️ 通用table选择器也超时');
      }
    }

    // 策略3: 最后等待一下确保页面稳定
    if (!searchResultsFound) {
      console.log('⏳ 等待页面稳定...');
      await page.waitForTimeout(3000);
    }

    // 检查是否有空数据提示
    const emptyVisible = await page.locator('.next-table-empty').isVisible().catch(() => false);
    console.log(`📝 空数据提示状态: ${emptyVisible}`);

    // 统计商品行数 - 使用多种选择器策略
    let rows = 0;
    let tableRows = null;

    // 策略1: 使用用户提供的精确选择器
    try {
      tableRows = page.locator('tbody tr.next-table-row');
      rows = await tableRows.count();
      console.log(`📊 策略1: 找到 ${rows} 行商品数据（使用 tbody tr.next-table-row）`);
    } catch (error) {
      console.log('⚠️ 策略1失败:', error.message);
    }

    // 策略2: 如果策略1失败，尝试更通用的表格行选择器
    if (rows === 0) {
      try {
        tableRows = page.locator('table tr');
        rows = await tableRows.count();
        console.log(`📊 策略2: 找到 ${rows} 行表格数据（使用 table tr）`);
      } catch (error) {
        console.log('⚠️ 策略2失败:', error.message);
      }
    }

    // 策略3: 检查页面是否包含商品ID文本
    if (rows === 0) {
      try {
        const pageText = await page.textContent('body');
        const productIdFound = pageText.includes(productId);
        console.log(`📊 策略3: 页面文本中${productIdFound ? '包含' : '不包含'}商品ID ${productId}`);

        // 如果页面包含商品ID，说明可能有结果但是DOM结构不同
        if (productIdFound) {
          rows = 1; // 假设找到商品
          console.log('📊 基于页面文本内容，判定找到了商品');
        }
      } catch (error) {
        console.log('⚠️ 策略3失败:', error.message);
      }
    }

    if (emptyVisible || rows === 0) {
      console.log(`❌ 商品不存在 (空提示: ${emptyVisible}, 行数: ${rows})`);

      // 截图保存空结果
      const screenshotPath = path.resolve(
        process.cwd(),
        'screenshots',
        `check_empty_${productId}_${Date.now()}.png`
      );
      if (process.env.TAKE_SCREENSHOT === 'true') {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 截图已保存: ${screenshotPath}`);
      }

      return false;
    }

    // 检查商品ID是否在结果中
    console.log(`🔍 检查商品ID ${productId} 是否存在...`);

    // 遍历每一行，查找商品ID
    let productFound = false;

    // 如果有tableRows，遍历查找
    if (tableRows && rows > 0) {
      for (let i = 0; i < rows; i++) {
        const row = tableRows.nth(i);
        const rowText = await row.textContent();
        if (rowText.includes(productId)) {
          productFound = true;
          console.log(`✅ 找到商品 ${productId} 在第 ${i + 1} 行`);
          break;
        }
      }
    } else {
      // 如果没有表格行，使用策略3的结果
      console.log(`📊 基于页面文本内容判定: ${rows > 0 ? '找到' : '未找到'}商品`);
      productFound = rows > 0;
    }

    if (productFound) {
      console.log(`✅ 商品 ${productId} 已存在于淘宝`);

      // 截图保存证据
      const screenshotPath = path.resolve(
        process.cwd(),
        'screenshots',
        `check_exists_${productId}_${Date.now()}.png`
      );
      if (process.env.TAKE_SCREENSHOT === 'true') {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 截图已保存: ${screenshotPath}`);
      }

      return true;
    } else {
      console.log(`❌ 商品 ${productId} 不在搜索结果中（但有其他 ${rows} 行数据）`);

      // 截图保存
      const screenshotPath = path.resolve(
        process.cwd(),
        'screenshots',
        `check_notfound_${productId}_${Date.now()}.png`
      );
      if (process.env.TAKE_SCREENSHOT === 'true') {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 截图已保存: ${screenshotPath}`);
      }

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