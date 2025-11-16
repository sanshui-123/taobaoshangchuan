const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
const { closeMaterialCenterPopups } = require('../utils/advert-handler');

/**
 * 步骤5：上传1:1主图
 * 上传商品主图到素材库并选择
 */
const step5 = async (ctx) => {
  ctx.logger.info('开始上传1:1主图');

  // 创建心跳定时器
  const heartbeat = setInterval(() => {
    process.stdout.write('.');
  }, 5000);

  try {
    // 检查是否有页面引用
    if (!ctx.page1) {
      throw new Error('未找到发布页面，请先执行步骤4');
    }

    const page = ctx.page1;
    const productId = ctx.productId;

    // 加载缓存获取商品信息
    const taskCache = loadTaskCache(productId);
    if (!taskCache.productData || !taskCache.productData.colors) {
      throw new Error('缓存中没有商品颜色信息');
    }

    const colors = taskCache.productData.colors;
    const colorCount = colors.length;
    ctx.logger.info(`商品颜色数量: ${colorCount}`);

    // 根据颜色数量确定策略
    const strategy = determineUploadStrategy(colorCount);
    ctx.logger.info(`使用策略: ${strategy.name}`);

    // ========== 新流程开始 ==========

    // 步骤1：滚动到页面顶部
    ctx.logger.info('\n[步骤1] 滚动到页面顶部');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
    ctx.logger.success('✅ 已滚动到顶部');

    // 步骤2：禁用其他上传位，防止误点击
    ctx.logger.info('\n[步骤2] 禁用其他上传位');
    await page.evaluate(() => {
      // 找到所有上传框
      const uploadBoxes = document.querySelectorAll('.upload-pic-box, [class*="upload"], .sell-field-mainImagesGroup .upload-item');
      uploadBoxes.forEach((box, index) => {
        if (index > 0) {
          box.style.pointerEvents = 'none';
          box.style.opacity = '0.5';
        }
      });
    });
    ctx.logger.success('✅ 已禁用其他上传位');

    // 步骤3：点击第一个白底图上传位
    ctx.logger.info('\n[步骤3] 点击第一个白底图上传位');

    // 多种可能的选择器，优先级从高到低
    const uploadBoxSelectors = [
      // 查找包含"上传图片"或"白底图"文字的按钮/区域
      'button:has-text("上传图片")',
      'div:has-text("上传图片")',
      '[class*="upload"]:has-text("上传图片")',
      // 查找第一个上传框
      '.sell-field-mainImagesGroup .upload-pic-box:first-child',
      '.upload-pic-box:first-child',
      '[class*="mainImages"] .upload-item:first-child',
      '.white-bg-image .upload-box:first-child',
      // 通过图片上传icon查找
      'svg[class*="upload"], i[class*="upload"]'
    ];

    let uploadBoxClicked = false;
    for (const selector of uploadBoxSelectors) {
      try {
        const locator = page.locator(selector).first();
        const count = await locator.count();
        if (count > 0) {
          await locator.click({ timeout: 5000 });
          ctx.logger.success(`✅ 已点击第一个上传位（${selector}）`);
          uploadBoxClicked = true;
          break;
        }
      } catch (e) {
        ctx.logger.warn(`尝试选择器失败: ${selector} - ${e.message}`);
        continue;
      }
    }

    if (!uploadBoxClicked) {
      throw new Error('无法找到上传位，请检查页面结构');
    }

    // 等待弹窗出现
    ctx.logger.info('\n等待"选择图片"弹窗出现...');
    try {
      // 等待iframe或对话框出现
      await page.waitForSelector('iframe, .next-dialog:has-text("选择图片")', { timeout: 10000 });
      ctx.logger.success('✅ 弹窗已出现');
    } catch (e) {
      ctx.logger.warn('未检测到弹窗，尝试继续...');
    }
    await page.waitForTimeout(2000);

    // 步骤4：在弹出的"选择图片"对话框中搜索文件夹
    ctx.logger.info('\n[步骤4] 在弹窗中搜索文件夹');

    // 方案A：优先使用搜索框
    try {
      // 查找搜索框（可能在主页面或iframe中）
      let searchInput = null;
      let isInIframe = false;

      // 先尝试主页面
      const mainSearchInput = await page.$('input[placeholder*="文件夹"], input[placeholder*="搜索"]');
      if (mainSearchInput) {
        searchInput = mainSearchInput;
        ctx.logger.info('  找到搜索框（主页面）');
      } else {
        // 尝试iframe
        const uploadFrame = page.frameLocator('iframe').first();
        searchInput = uploadFrame.locator('input[placeholder*="文件夹"], input[placeholder*="搜索"]');
        isInIframe = true;
        ctx.logger.info('  找到搜索框（iframe）');
      }

      // 输入 productId
      if (isInIframe) {
        await searchInput.fill(productId);
      } else {
        await searchInput.fill(productId);
      }
      ctx.logger.info(`  输入搜索关键词: ${productId}`);
      await page.waitForTimeout(1500); // 等待下拉建议出现

      // 点击下拉建议中的文件夹
      if (isInIframe) {
        const uploadFrame = page.frameLocator('iframe').first();
        const folderSuggestion = uploadFrame.locator(`.next-menu-item:has-text("${productId}"), .folder-item:has-text("${productId}")`).first();
        await folderSuggestion.click();
      } else {
        const folderSuggestion = await page.locator(`.next-menu-item:has-text("${productId}"), .folder-item:has-text("${productId}")`).first();
        await folderSuggestion.click();
      }
      ctx.logger.success(`✅ 已选择文件夹: ${productId}`);
      await page.waitForTimeout(2000);

    } catch (searchError) {
      // 方案B：搜索失败时，使用左侧文件夹树
      ctx.logger.warn(`搜索框方案失败: ${searchError.message}`);
      ctx.logger.info('  使用方案B：左侧文件夹树');

      try {
        const uploadFrame = page.frameLocator('iframe').first();
        // 在左侧树中找到对应文件夹
        const folderInTree = uploadFrame.locator(`.PicGroupList [title="${productId}"], .folder-tree [title="${productId}"]`).first();
        await folderInTree.click();
        ctx.logger.success(`✅ 已从侧边栏选择文件夹: ${productId}`);
        await page.waitForTimeout(2000);
      } catch (treeError) {
        throw new Error(`两种方案都失败了。搜索: ${searchError.message}, 树导航: ${treeError.message}`);
      }
    }

    // 获取 uploadFrame（如果需要在后续步骤中使用）
    const uploadFrame = page.frameLocator('iframe').first();

    try {
      // 设置排序方式为文件名升序（可选，根据需要）
      ctx.logger.info('\n[步骤5] 设置文件名升序');
      try {
        await uploadFrame.locator('.next-btn:has-text("文件名")').click();
        await page.waitForTimeout(500);
        await uploadFrame.locator('text=文件名升序').click();
        ctx.logger.success('✅ 已设置文件名升序');
      } catch (e) {
        ctx.logger.warn('设置排序失败，继续执行');
      }
      await page.waitForTimeout(1000);

      // 步骤6：检查并选择图片
      ctx.logger.info('\n[步骤6] 选择图片');

      // 获取图片数量
      const imageCount = await uploadFrame.locator('.PicList_pic_background__pGTdV').count();
      ctx.logger.info(`  检测到 ${imageCount} 张图片`);

      if (imageCount === 0) {
        throw new Error('文件夹中没有找到图片');
      }

      // 根据策略选择图片
      const selectedCount = await selectImages(uploadFrame, imageCount, strategy, ctx);
      ctx.logger.success(`✅ 已选择 ${selectedCount} 张图片`);

      // 步骤7：确认上传
      ctx.logger.info('\n[步骤7] 确认上传');
      const confirmButton = uploadFrame.locator(`.next-btn-primary:has-text("确定(${selectedCount})")`);
      await confirmButton.click();
      ctx.logger.success('✅ 点击确定按钮');
      await page.waitForTimeout(3000);

      // 步骤8：检查上传结果
      ctx.logger.info('\n[步骤8] 验证上传结果');

      // 切换回主frame检查上传的图片
      const uploadedImages = await page.locator('.material-image-item').count();
      ctx.logger.success(`✅ 成功上传 ${uploadedImages} 张图片到素材库`);

      // 统计成功率
      const successRate = (uploadedImages / Math.min(imageCount, 6) * 100).toFixed(1);
      ctx.logger.info(`上传成功率: ${successRate}%`);

      // 步骤9：保存截图
      const screenshotDir = process.env.TAOBAO_SCREENSHOT_DIR ||
        path.resolve(process.cwd(), 'screenshots');

      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      const screenshotPath = path.join(
        screenshotDir,
        `${productId}_step5_uploaded.png`
      );

      await page.screenshot({ path: screenshotPath, fullPage: true });
      ctx.logger.info(`截图已保存: ${screenshotPath}`);

      // 更新缓存
      taskCache.uploadResults = {
        strategy: strategy.name,
        totalImages: imageCount,
        selectedImages: selectedCount,
        uploadedImages: uploadedImages,
        successRate: parseFloat(successRate),
        colorCount: colorCount,
        timestamp: new Date().toISOString()
      };

      taskCache.stepStatus[5] = 'done';
      saveTaskCache(productId, taskCache);

      updateStepStatus(productId, 5, 'done');

      // 输出总结
      ctx.logger.success('\n=== 主图上传完成 ===');
      ctx.logger.info(`策略: ${strategy.name}`);
      ctx.logger.info(`原始图片数: ${imageCount}`);
      ctx.logger.info(`选择图片数: ${selectedCount}`);
      ctx.logger.info(`成功上传: ${uploadedImages}`);
      ctx.logger.info(`成功率: ${successRate}%`);

    } catch (error) {
      ctx.logger.error(`上传失败: ${error.message}`);

      // 尝试降级策略
      if (strategy.canFallback) {
        ctx.logger.info('尝试降级策略...');
        await applyFallbackStrategy(page, productId, ctx);
      } else {
        throw error;
      }
    }

  } catch (error) {
    ctx.logger.error(`主图上传失败: ${error.message}`);

    // 保存错误截图
    if (ctx.page1) {
      try {
        const errorScreenshot = path.join(
          path.resolve(process.cwd(), 'screenshots'),
          `${ctx.productId}_step5_error.png`
        );
        await ctx.page1.screenshot({ path: errorScreenshot, fullPage: true });
        ctx.logger.info(`错误截图: ${errorScreenshot}`);
      } catch (e) {
        // 忽略截图错误
      }
    }

    updateStepStatus(ctx.productId, 5, 'failed');
    throw error;

  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');
  }
};

/**
 * 确定上传策略
 */
function determineUploadStrategy(colorCount) {
  if (colorCount === 1) {
    return {
      name: '单色策略',
      maxImages: 6,
      canFallback: true,
      description: '选择第一张主图（带商品ID）'
    };
  } else if (colorCount === 2) {
    return {
      name: '双色策略',
      maxImages: 6,
      canFallback: true,
      description: '颜色1选主图，颜色2选2张图'
    };
  } else {
    return {
      name: '多色策略',
      maxImages: 6,
      canFallback: true,
      description: '每个颜色选1张，最多6张'
    };
  }
}

/**
 * 选择图片
 */
async function selectImages(uploadFrame, imageCount, strategy, ctx) {
  let selectedCount = 0;

  switch (strategy.name) {
    case '单色策略':
      // 单色：选择前6张
      selectedCount = Math.min(imageCount, 6);
      for (let i = 0; i < selectedCount; i++) {
        await uploadFrame.locator(`.PicList_pic_background__pGTdV`).nth(i).click();
        await uploadFrame.waitForTimeout(200);
      }
      break;

    case '双色策略':
      // 双色：第一张主图（带商品ID）+ 第二色的前2张
      // 先找带商品ID的图片
      const hasProductId = await uploadFrame.locator(`.PicList_pic_background__pGTdV:has-text("${ctx.productId}")`).count();
      if (hasProductId > 0) {
        await uploadFrame.locator(`.PicList_pic_background__pGTdV:has-text("${ctx.productId}")`).first().click();
        selectedCount++;
      }

      // 再从颜色2选择2张
      const remaining = Math.min(imageCount - selectedCount, 2);
      for (let i = selectedCount; i < selectedCount + remaining && i < imageCount; i++) {
        await uploadFrame.locator(`.PicList_pic_background__pGTdV`).nth(i).click();
        await uploadFrame.waitForTimeout(200);
      }
      selectedCount += remaining;
      break;

    default:
      // 多色：每个颜色选1张
      selectedCount = Math.min(imageCount, 6);
      for (let i = 0; i < selectedCount; i++) {
        await uploadFrame.locator(`.PicList_pic_background__pGTdV`).nth(i).click();
        await uploadFrame.waitForTimeout(200);
      }
  }

  return selectedCount;
}

/**
 * 应用降级策略
 */
async function applyFallbackStrategy(page, productId, ctx) {
  ctx.logger.info('应用降级策略：选择所有可见图片');

  try {
    // 重新打开上传对话框
    await page.click('.next-tabs-tab:has-text("素材库")');
    await page.waitForTimeout(2000);

    // 处理素材库页面的广告弹窗
    await closeMaterialCenterPopups(page);

    await page.click('.next-tabs-tab:has-text("图片")');
    await page.click('text=上传图片');
    await page.waitForTimeout(2000);

    // 选择所有图片
    const uploadFrame = page.frameLocator('iframe').first();
    const allImages = await uploadFrame.locator('.PicList_pic_background__pGTdV').count();

    for (let i = 0; i < allImages; i++) {
      await uploadFrame.locator('.PicList_pic_background__pGTdV').nth(i).click();
      await uploadFrame.waitForTimeout(100);
    }

    await uploadFrame.locator('.next-btn-primary:has-text("确定")').click();
    await page.waitForTimeout(3000);

    ctx.logger.success('✅ 降级策略执行成功');
  } catch (error) {
    ctx.logger.error(`降级策略失败: ${error.message}`);
    throw error;
  }
}

module.exports = { step5 };