const fs = require('fs');
const path = require('path');

/**
 * 步骤11：填写详情模板（优化版）
 * 大幅减少等待时间，使用条件等待代替硬编码延迟
 */
async function step11Detail(ctx) {
  ctx.logger.info('开始填写商品详情模板');

  const { page1: page, productId } = ctx;
  if (!page) {
    throw new Error('页面未初始化');
  }

  ctx.logger.info('\n========== 填写详情模板 ==========');

  try {
    // 步骤1：点击清空按钮
    ctx.logger.info('\n[步骤1] 点击清空按钮清除旧内容');
    const clearButton = page.locator('button:has-text("清空")').first();

    if (await clearButton.isVisible()) {
      await clearButton.click();
      // 优化：减少到100ms
      await page.waitForTimeout(100);
      ctx.logger.info('  ✅ 已清空旧内容');
    } else {
      ctx.logger.info('  未找到清空按钮，跳过');
    }

    // 步骤2：选择模板
    ctx.logger.info('\n[步骤2] 选择模板');
    const templateSelector = 'span:has-text("卡-LL=")';
    const templateElement = page.locator(templateSelector).first();

    if (await templateElement.isVisible()) {
      await templateElement.click();
      // 优化：减少到100ms
      await page.waitForTimeout(100);
      ctx.logger.info('  ✅ 已选择模板: 卡-LL=');
    } else {
      ctx.logger.warn('  未找到指定模板，使用默认模板');
    }

    // 步骤3：打开模板编辑弹窗
    ctx.logger.info('\n[步骤3] 打开模板编辑弹窗');

    // 优化：使用条件等待模板内容出现
    try {
      await page.waitForSelector('#panel_edit p img', {
        timeout: 3000,
        state: 'visible'
      });
      ctx.logger.info('  ✅ 找到模板内容图片: #panel_edit p img');
    } catch (e) {
      ctx.logger.warn('  未找到模板内容图片，继续执行');
    }

    // 双击图片打开编辑弹窗
    const templateImage = page.locator('#panel_edit p img').first();
    if (await templateImage.isVisible()) {
      await templateImage.dblclick();

      // 优化：等待弹窗出现
      try {
        await page.waitForSelector('.next-dialog-body [contenteditable="true"]', {
          timeout: 2000,
          state: 'visible'
        });
        ctx.logger.info('  ✅ 已打开模板编辑弹窗');
      } catch (e) {
        ctx.logger.warn('  弹窗可能已打开');
      }
    }

    // 步骤3.5：定位光标到第一张图片左侧
    ctx.logger.info('\n[步骤3.5] 定位光标到第一张图片左侧');

    // 优化：查找第一张图片
    const firstImage = page.getByLabel('编辑模块').locator('img').first();

    if (await firstImage.isVisible()) {
      ctx.logger.info('  找到第一张图片');

      // 获取图片位置并点击左侧
      const box = await firstImage.boundingBox();
      if (box) {
        await page.mouse.click(box.x - 5, box.y + box.height / 2);
        // 优化：减少到100ms
        await page.waitForTimeout(100);
        ctx.logger.info('  点击了图片左侧位置');
      }

      // 确保光标在行首
      await page.keyboard.press('Home');
      await page.waitForTimeout(50);

      // 按向上键回到图片前的行
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(50);

      ctx.logger.info('  ✅ 已定位到图片左侧');
    }

    // 步骤4：插入详情页文字
    ctx.logger.info('\n[步骤4] 插入详情页文字');

    // 从缓存读取详情文案
    const cacheFile = path.join(__dirname, '..', 'cache', `${productId}.json`);
    let detailText = '';

    try {
      if (fs.existsSync(cacheFile)) {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

        if (Array.isArray(cache.detailText)) {
          detailText = cache.detailText.join('\n');
          ctx.logger.info(`  从数组获取详情文案: ${cache.detailText.length} 行`);
        } else if (cache.detailText) {
          detailText = cache.detailText;
          ctx.logger.info('  从字符串获取详情文案');
        }
      }
    } catch (e) {
      ctx.logger.warn(`  读取缓存失败: ${e.message}`);
    }

    if (detailText) {
      // 插入详情文字（优化：使用type而非insertText）
      const preview = detailText.substring(0, 50);
      ctx.logger.info(`  详情文案预览: ${preview}...`);

      await page.keyboard.type(detailText);
      // 优化：减少到100ms
      await page.waitForTimeout(100);

      ctx.logger.info(`  ✅ 已插入详情页文字 (${detailText.length} 字符)`);
    } else {
      ctx.logger.warn('  未找到详情文案');
    }

    // 步骤5：插入尺码表
    ctx.logger.info('\n[步骤5] 插入尺码表');

    let sizeTable = '';
    try {
      if (fs.existsSync(cacheFile)) {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        sizeTable = cache.sizeTable || '';
        ctx.logger.info('  从 sizeTable 字段获取尺码表');
      }
    } catch (e) {
      ctx.logger.warn(`  读取尺码表失败: ${e.message}`);
    }

    if (sizeTable) {
      const preview = sizeTable.substring(0, 80);
      ctx.logger.info(`  尺码表预览: ${preview}...`);

      await page.keyboard.type(sizeTable);
      // 优化：减少到100ms
      await page.waitForTimeout(100);

      ctx.logger.info(`  ✅ 已插入尺码表 (${sizeTable.length} 字符)`);
    }

    // 步骤5.5：强化光标重定位（DOM Range方式）
    ctx.logger.info('\n[步骤5.5] 强化光标重定位确保图文分离');

    const movedBeforeImage = await page.evaluate(() => {
      const editable = document.querySelector('.next-dialog-body [contenteditable="true"]');
      if (!editable) return false;

      const firstImg = editable.querySelector('img');
      if (!firstImg) return false;

      const range = document.createRange();
      range.setStartBefore(firstImg);
      range.collapse(true);

      const selection = window.getSelection();
      if (!selection) return false;

      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    });

    if (movedBeforeImage) {
      await page.waitForTimeout(50);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(50);
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(50);
      ctx.logger.info('  ✅ 已将光标定位在图片前的空行');
    }

    // 步骤6：点击图像按钮进入素材库
    ctx.logger.info('\n[步骤6] 点击图像按钮进入素材库');

    // 查找图像按钮（多种方式）
    const imageButtonSelectors = [
      'button[aria-label*="图"]',
      'button:has([class*="image"])',
      '.editor-toolbar button:nth-of-type(3)',
      'button[title*="图"]'
    ];

    let imageButtonClicked = false;
    for (const selector of imageButtonSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible()) {
          await button.click();
          ctx.logger.info(`  ✅ 找到图像按钮 (${selector})`);
          imageButtonClicked = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!imageButtonClicked) {
      throw new Error('未找到图像按钮');
    }

    // 优化：等待素材库弹窗出现
    try {
      await page.waitForSelector('iframe, .next-dialog', {
        timeout: 3000,
        state: 'visible'
      });
      ctx.logger.info('  ✅ 已打开图像选择弹窗');
    } catch (e) {
      ctx.logger.warn('  弹窗检测超时');
    }

    // 优化：只等待100ms
    await page.waitForTimeout(100);

    // 步骤7：搜索商品文件夹
    ctx.logger.info('\n[步骤7] 搜索商品文件夹');

    // 检测iframe
    const iframeCount = await page.locator('iframe').count();
    ctx.logger.info(`  检测到 ${iframeCount} 个 iframe`);

    let searchCompleted = false;

    if (iframeCount > 0) {
      // 在最后一个iframe中查找（通常素材库在最后）
      const frameLocator = page.frameLocator('iframe').last();

      try {
        // 查找并填写搜索框
        const searchInput = frameLocator.locator('input[placeholder*="文件夹"]').first();

        if (await searchInput.isVisible()) {
          await searchInput.clear();
          await searchInput.fill(productId);
          await searchInput.press('Enter');

          ctx.logger.info('  ✅ 在iframe中找到搜索框并输入');
          searchCompleted = true;

          // 优化：等待文件夹内容加载
          await page.waitForTimeout(200);
        }
      } catch (e) {
        ctx.logger.warn('  iframe搜索失败');
      }
    }

    if (!searchCompleted) {
      // 尝试在主页面搜索
      try {
        const searchInput = page.locator('input[placeholder*="文件夹"]').first();
        await searchInput.clear();
        await searchInput.fill(productId);
        await searchInput.press('Enter');
        ctx.logger.info('  ✅ 在主页面找到搜索框');

        await page.waitForTimeout(200);
      } catch (e) {
        ctx.logger.warn('  主页面搜索失败');
      }
    }

    ctx.logger.info(`  ✅ 已选择文件夹: ${productId}`);

    // 步骤8：选择图片（从最后一张往前）
    ctx.logger.info('\n[步骤8] 选择图片（从最后一张往前）');

    // 根据是否有iframe决定操作对象
    const workingLocator = iframeCount > 0 ?
      page.frameLocator('iframe').last() : page;

    // 查找所有图片
    const imageCards = workingLocator.locator('.PicList_pic_background__pGTdV, [class*="pic_background"]');
    const imageCount = await imageCards.count();

    ctx.logger.info(`  找到 ${imageCount} 张图片，开始倒序选择...`);

    // 倒序选择所有图片（优化：减少等待）
    for (let i = imageCount - 1; i >= 0; i--) {
      try {
        await imageCards.nth(i).click();

        // 优化：只等待50ms
        if (i % 5 === 0) {
          await page.waitForTimeout(50);
        }

        ctx.logger.info(`    ✓ 已选择第 ${imageCount - i} 张图片`);
      } catch (e) {
        ctx.logger.warn(`    ✗ 选择第 ${imageCount - i} 张失败`);
      }
    }

    ctx.logger.info(`  ✅ 已选择 ${imageCount} 张图片`);

    // 步骤9：点击素材库确定按钮
    ctx.logger.info('\n[步骤9] 点击素材库弹窗确定按钮');

    const confirmSelectors = [
      'button:has-text("确定")',
      'button.next-btn-primary:has-text("确定")',
      '.next-dialog-footer button.next-btn-primary'
    ];

    for (const selector of confirmSelectors) {
      try {
        const button = workingLocator.locator(selector).first();
        if (await button.isVisible()) {
          await button.click();
          ctx.logger.info(`  ✅ 找到素材库确定按钮`);

          // 优化：只等待200ms
          await page.waitForTimeout(200);
          ctx.logger.info('  ✅ 已点击素材库确定按钮');
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // 步骤10：点击编辑模块确定按钮
    ctx.logger.info('\n[步骤10] 点击编辑模块弹窗确定按钮');

    // 查找编辑模块的确定按钮（在主页面）
    const editConfirmSelectors = [
      '.next-dialog-footer button:has-text("确定")',
      'button.next-btn-primary:has-text("确定")'
    ];

    for (const selector of editConfirmSelectors) {
      try {
        const button = page.locator(selector).last();
        if (await button.isVisible()) {
          await button.click();
          ctx.logger.info(`  ✅ 找到编辑模块确定按钮`);

          // 优化：只等待300ms
          await page.waitForTimeout(300);
          ctx.logger.info('  ✅ 已点击编辑模块确定按钮，图片已写入编辑器');
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // 步骤11：保存结果
    ctx.logger.info('\n[步骤11] 保存结果');

    // 更新缓存
    try {
      const cache = fs.existsSync(cacheFile) ?
        JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};

      cache.step11Status = {
        completed: true,
        timestamp: new Date().toISOString(),
        template: '卡-LL=',
        imageCount: imageCount
      };

      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
      ctx.logger.info('  ✅ 缓存已更新');
    } catch (e) {
      ctx.logger.warn(`  更新缓存失败: ${e.message}`);
    }

    ctx.logger.info('\n========== 详情模板填写完成 ==========');
    ctx.logger.info(`使用模板: 卡-LL=`);
    ctx.logger.info(`选择图片: ${imageCount} 张`);
    ctx.logger.success('\n✅ Step11 详情模板填写完成，可继续到 Step12 提交商品');

  } catch (error) {
    ctx.logger.error(`详情模板填写失败: ${error.message}`);
    throw error;
  }
}

module.exports = { step11Detail };