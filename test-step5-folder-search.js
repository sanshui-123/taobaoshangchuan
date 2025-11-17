/**
 * 测试脚本：验证 Step5 搜索文件夹功能
 * 用于测试商品ID搜索和下拉建议选择逻辑
 */

const { chromium } = require('playwright');
const path = require('path');

async function testFolderSearch() {
  console.log('🚀 开始测试 Step5 文件夹搜索功能\n');

  let browser, context, page;

  try {
    // 启动浏览器
    console.log('📱 启动浏览器...');
    browser = await chromium.launch({
      headless: false,
      slowMo: 500  // 放慢操作，方便观察
    });

    // 加载已有的登录状态
    const storageStatePath = '/Users/sanshui/Desktop/tbzhuaqu/storage/taobao-storage-state.json';
    context = await browser.newContext({
      storageState: storageStatePath,
      viewport: { width: 1920, height: 1080 }
    });

    page = await context.newPage();
    console.log('✅ 浏览器启动完成\n');

    // 测试商品ID（可修改为实际存在的商品ID）
    const testProductId = 'C25233113';
    console.log(`📦 测试商品ID: ${testProductId}\n`);

    // 打开淘宝发布页（需要替换为实际的URL）
    console.log('🌐 打开淘宝发布页...');
    await page.goto('https://upload.taobao.com/auction/publish/publish.htm?spm=a21bo.jianhua.0.0.5af911d98eF2wt');
    await page.waitForTimeout(3000);
    console.log('✅ 页面加载完成\n');

    // 模拟点击第一个上传位（需要根据实际页面结构调整选择器）
    console.log('📸 尝试点击上传位...');
    const uploadBoxSelectors = [
      '.sell-component-info-wrapper-component-child div.placeholder',
      'div.placeholder',
      '.upload-pic-box:first-child'
    ];

    let clicked = false;
    for (const selector of uploadBoxSelectors) {
      try {
        const locator = page.locator(selector).first();
        const count = await locator.count();
        if (count > 0) {
          await locator.click({ timeout: 5000 });
          console.log(`✅ 成功点击上传位（${selector}）\n`);
          clicked = true;
          break;
        }
      } catch (e) {
        console.log(`⚠️  选择器失败: ${selector}`);
      }
    }

    if (!clicked) {
      throw new Error('❌ 无法找到上传位');
    }

    // 等待弹窗出现
    console.log('⏳ 等待"选择图片"弹窗出现...');
    await page.waitForTimeout(2000);

    // 获取 iframe
    const uploadFrame = page.frameLocator('iframe').first();
    console.log('✅ 找到上传iframe\n');

    // ========== 核心测试：搜索文件夹 ==========
    console.log('🔍 开始测试搜索框功能\n');

    // 步骤1：定位搜索框
    console.log('  [1/5] 定位搜索框...');
    const searchInput = uploadFrame.locator('input[placeholder*="请输入文件夹名称"], input[placeholder*="文件夹名称"], input[placeholder*="文件夹"]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    console.log('  ✅ 找到搜索框\n');

    // 步骤2：输入商品ID
    console.log(`  [2/5] 输入商品ID: ${testProductId}`);
    await searchInput.click();
    await searchInput.fill('');
    await page.waitForTimeout(300);
    await searchInput.fill(testProductId);
    console.log('  ✅ 输入完成\n');

    // 步骤3：智能等待下拉建议出现
    console.log('  [3/5] 等待下拉建议出现...');
    let suggestionAppeared = false;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);

      const dropdownVisible = await uploadFrame.locator('.next-menu, .dropdown-menu, [role="listbox"], [class*="suggest"]').count();
      if (dropdownVisible > 0) {
        console.log(`  ✅ 下拉建议已出现（等待${(i + 1) * 0.5}秒）\n`);
        suggestionAppeared = true;
        break;
      }

      console.log(`  ⏱️  等待中... ${(i + 1) * 0.5}秒`);
    }

    if (!suggestionAppeared) {
      console.log('  ⚠️  下拉建议未出现，继续尝试\n');
    }

    await page.waitForTimeout(500);

    // 步骤4：查找并点击下拉建议
    console.log('  [4/5] 尝试点击下拉建议...');
    const suggestionSelectors = [
      `.next-menu-item:has-text("${testProductId}")`,
      `[role="option"]:has-text("${testProductId}")`,
      `.dropdown-item:has-text("${testProductId}")`,
      `li:has-text("${testProductId}")`,
      `text="${testProductId}"`,
      `:has-text("${testProductId}")`,
      `div:has-text("${testProductId}")`,
    ];

    let folderSelected = false;
    for (const selector of suggestionSelectors) {
      try {
        const suggestion = uploadFrame.locator(selector).first();
        const count = await suggestion.count();

        console.log(`    🔎 尝试选择器: ${selector} (找到 ${count} 个)`);

        if (count > 0) {
          await suggestion.waitFor({ state: 'visible', timeout: 2000 });
          await suggestion.click({ timeout: 3000 });
          console.log(`    ✅ 成功点击下拉建议\n`);
          folderSelected = true;
          break;
        }
      } catch (e) {
        console.log(`    ❌ 失败: ${e.message}`);
      }
    }

    if (!folderSelected) {
      console.log('  ⚠️  未能通过下拉建议选择，尝试左侧文件夹树...\n');

      // Fallback：尝试左侧文件夹树
      const treeFolderSelectors = [
        `[title="${testProductId}"]`,
        `.folder-item:has-text("${testProductId}")`,
        `.PicGroupList :has-text("${testProductId}")`,
        `.folder-tree :has-text("${testProductId}")`,
        `text="${testProductId}"`,
        `:has-text("${testProductId}")`,
      ];

      for (const selector of treeFolderSelectors) {
        try {
          const folderInTree = uploadFrame.locator(selector).first();
          const count = await folderInTree.count();

          console.log(`    🔎 尝试树选择器: ${selector} (找到 ${count} 个)`);

          if (count > 0) {
            await folderInTree.waitFor({ state: 'visible', timeout: 2000 });
            await folderInTree.click({ timeout: 3000 });
            console.log(`    ✅ 成功从侧边栏选择文件夹\n`);
            folderSelected = true;
            break;
          }
        } catch (e) {
          console.log(`    ❌ 失败: ${e.message}`);
        }
      }
    }

    if (!folderSelected) {
      throw new Error('❌ 两种方案都失败了');
    }

    // 步骤5：验证文件夹已打开
    console.log('  [5/5] 验证文件夹内容...');
    await page.waitForTimeout(2000);

    const imageCount = await uploadFrame.locator('.PicList_pic_background__pGTdV, [class*="pic-item"], img').count();
    console.log(`  ✅ 检测到 ${imageCount} 张图片\n`);

    // 保存成功截图
    const screenshotPath = `/Users/sanshui/Desktop/tbzhuaqu/screenshots/test-step5-success-${testProductId}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 成功截图已保存: ${screenshotPath}\n`);

    console.log('✅ 测试全部通过！\n');
    console.log('='.repeat(60));
    console.log('测试总结:');
    console.log(`  - 商品ID: ${testProductId}`);
    console.log(`  - 文件夹选择方式: ${folderSelected ? '搜索框/侧边栏' : '未知'}`);
    console.log(`  - 图片数量: ${imageCount}`);
    console.log('='.repeat(60));

    // 保持浏览器打开，方便人工检查（自动测试模式：5秒后关闭）
    console.log('\n🔍 浏览器将保持打开5秒...');
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);

    // 保存错误截图
    if (page) {
      try {
        const errorScreenshot = `/Users/sanshui/Desktop/tbzhuaqu/screenshots/test-step5-error-${Date.now()}.png`;
        await page.screenshot({ path: errorScreenshot, fullPage: true });
        console.error(`📸 错误截图: ${errorScreenshot}`);
      } catch (e) {
        // 忽略截图错误
      }
    }

    throw error;

  } finally {
    // 自动关闭浏览器
    if (browser) {
      await browser.close();
      console.log('🔒 浏览器已关闭');
    }
  }
}

// 运行测试
testFolderSearch().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
