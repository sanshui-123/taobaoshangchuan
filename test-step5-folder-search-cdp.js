/**
 * 测试脚本：验证 Step5 搜索文件夹功能（使用 CDP 连接）
 * 通过 CDP 连接到已打开的浏览器，复用现有的发布页面
 */

const { chromium } = require('playwright');

async function testFolderSearchCDP() {
  console.log('🚀 开始测试 Step5 文件夹搜索功能（CDP 模式）\n');

  let browser, context, page;

  try {
    // ========== 关键：通过 CDP 连接到已打开的浏览器 ==========
    console.log('🔗 连接到远程调试浏览器...');
    console.log('   调试端口: http://127.0.0.1:9222');

    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    console.log('✅ 已连接到浏览器\n');

    // 获取所有已存在的上下文
    const contexts = browser.contexts();
    console.log(`📋 发现 ${contexts.length} 个浏览器上下文`);

    if (contexts.length === 0) {
      throw new Error('未找到浏览器上下文，请确保浏览器已启动并开启了远程调试');
    }

    // 使用第一个上下文
    context = contexts[0];
    console.log('✅ 使用现有上下文\n');

    // 获取所有已打开的页面
    const pages = context.pages();
    console.log(`📄 发现 ${pages.length} 个已打开的页面`);

    if (pages.length === 0) {
      throw new Error('未找到已打开的页面，请确保发布页面已打开');
    }

    // 查找发布页面（包含 upload.taobao.com 的页面）
    let publishPage = null;
    for (const p of pages) {
      const url = p.url();
      console.log(`   - ${url}`);

      if (url.includes('upload.taobao.com') || url.includes('publish')) {
        publishPage = p;
        console.log(`     ✅ 找到发布页面`);
      }
    }

    if (!publishPage) {
      console.log('\n⚠️  未找到发布页面，使用第一个页面');
      publishPage = pages[0];
    }

    page = publishPage;
    console.log(`\n✅ 使用页面: ${page.url()}\n`);

    // 测试商品ID（从页面或缓存中获取）
    const testProductId = 'C25233113';
    console.log(`📦 测试商品ID: ${testProductId}\n`);

    // ========== 重要：不导航，直接在当前页面操作 ==========
    console.log('📍 保持当前页面，不进行导航\n');

    // 等待页面稳定
    await page.waitForTimeout(1000);

    // 检查是否已经有上传弹窗打开
    console.log('🔍 检查是否有上传弹窗...');
    const existingIframe = page.locator('iframe').first();
    const iframeCount = await existingIframe.count();

    if (iframeCount > 0) {
      console.log('✅ 发现上传弹窗已打开\n');
    } else {
      console.log('⚠️  上传弹窗未打开，需要先点击上传位\n');

      // 尝试点击上传位
      console.log('📸 尝试点击第一个上传位...');
      const uploadBoxSelectors = [
        '.sell-component-info-wrapper-component-child div.placeholder',
        'div.placeholder',
        '.upload-pic-box:first-child',
        '[class*="upload"]:first-child'
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
          console.log(`  ⚠️  选择器失败: ${selector}`);
        }
      }

      if (!clicked) {
        throw new Error('❌ 无法找到上传位，请确保在正确的发布页面');
      }

      // 等待弹窗出现
      console.log('⏳ 等待"选择图片"弹窗出现...');
      await page.waitForTimeout(2000);
    }

    // ========== 核心测试：搜索文件夹 ==========
    console.log('🔍 开始测试搜索框功能\n');

    // 获取 iframe
    const uploadFrame = page.frameLocator('iframe').first();
    console.log('✅ 找到上传iframe\n');

    // 步骤1：定位搜索框
    console.log('  [1/5] 定位搜索框...');
    const searchInput = uploadFrame.locator('input[placeholder*="请输入文件夹名称"], input[placeholder*="文件夹名称"], input[placeholder*="文件夹"]').first();

    try {
      await searchInput.waitFor({ state: 'visible', timeout: 5000 });
      console.log('  ✅ 找到搜索框\n');
    } catch (e) {
      console.log('  ❌ 未找到搜索框，可能页面结构不匹配');
      throw e;
    }

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
    const screenshotPath = `/Users/sanshui/Desktop/tbzhuaqu/screenshots/test-step5-cdp-success-${testProductId}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 成功截图已保存: ${screenshotPath}\n`);

    console.log('✅ 测试全部通过！\n');
    console.log('='.repeat(60));
    console.log('测试总结:');
    console.log(`  - 连接方式: CDP 远程调试`);
    console.log(`  - 商品ID: ${testProductId}`);
    console.log(`  - 文件夹选择方式: ${folderSelected ? '成功' : '失败'}`);
    console.log(`  - 图片数量: ${imageCount}`);
    console.log('='.repeat(60));

    console.log('\n✅ 测试完成，保持页面状态');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);

    // 保存错误截图
    if (page) {
      try {
        const errorScreenshot = `/Users/sanshui/Desktop/tbzhuaqu/screenshots/test-step5-cdp-error-${Date.now()}.png`;
        await page.screenshot({ path: errorScreenshot, fullPage: true });
        console.error(`📸 错误截图: ${errorScreenshot}`);
      } catch (e) {
        // 忽略截图错误
      }
    }

    throw error;

  } finally {
    // ========== 关键：不关闭浏览器，只断开连接 ==========
    if (browser) {
      await browser.close();  // 只断开 CDP 连接，不关闭浏览器
      console.log('🔌 已断开 CDP 连接（浏览器保持打开）');
    }
  }
}

// 运行测试
testFolderSearchCDP().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
