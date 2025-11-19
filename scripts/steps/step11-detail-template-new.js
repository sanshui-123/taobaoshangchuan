const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤11：填写详情模板
 * 简化版实现，按用户精确操作流程
 */
const step11Detail = async (ctx) => {
  ctx.logger.info('开始填写商品详情模板');

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
    if (!taskCache.productData) {
      throw new Error('缓存中没有商品信息');
    }

    const productData = taskCache.productData;

    ctx.logger.info('\n========== 填写详情模板 ==========');

    // ==================== 步骤1：点击清空按钮清除旧内容 ====================
    ctx.logger.info('\n[步骤1] 点击清空按钮清除旧内容');

    // 点击清空按钮
    await page.getByRole('button', { name: '清空' }).click();
    await page.waitForTimeout(500);

    // 点击确认对话框的确定按钮
    await page.getByRole('button', { name: '确定' }).click();
    await page.waitForTimeout(500);

    ctx.logger.info('  ✅ 已清空旧内容');

    // ==================== 步骤2：选择模板 ====================
    ctx.logger.info('\n[步骤2] 选择模板');

    // 点击模板按钮
    await page.locator('#panel_edit').getByText('模板', { exact: true }).click();
    await page.waitForTimeout(500);

    // 选择"卡-LL="模板
    await page.getByText('卡-LL=').click();
    await page.waitForTimeout(1000);

    ctx.logger.info('  ✅ 已选择模板: 卡-LL=');

    // ==================== 步骤3：点击模板内容中的图片打开编辑弹窗 ====================
    ctx.logger.info('\n[步骤3] 打开模板编辑弹窗');

    // 先滚动到详情编辑区域
    await page.locator('#panel_edit').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // 点击模板内容中的图片（在段落或内容区域内，不是工具栏按钮）
    // 使用更精确的选择器避免点击到上传按钮
    const contentImageSelectors = [
      '#panel_edit p img',                    // 段落内的图片
      '#panel_edit .content img',             // 内容区的图片
      '#panel_edit [contenteditable] img',    // 可编辑区域的图片
      '#panel_edit .preview img',             // 预览区的图片
      '#panel_edit .template-preview img',    // 模板预览的图片
      '#panel_edit .detail-content img'       // 详情内容的图片
    ];

    let contentImg = null;
    for (const selector of contentImageSelectors) {
      const img = page.locator(selector).first();
      try {
        if (await img.isVisible({ timeout: 1000 })) {
          contentImg = img;
          ctx.logger.info(`  ✅ 找到模板内容图片: ${selector}`);
          break;
        }
      } catch (e) {
        // 继续尝试下一个
      }
    }

    if (!contentImg) {
      throw new Error('未在模板内容中找到图片，无法打开编辑弹窗');
    }

    await contentImg.scrollIntoViewIfNeeded();
    await contentImg.click();
    await page.waitForTimeout(1000);

    ctx.logger.info('  ✅ 已打开模板编辑弹窗');

    // ==================== 步骤4：点击图像按钮进入素材库 ====================
    ctx.logger.info('\n[步骤4] 点击图像按钮进入素材库');

    // 在弹窗中找图像按钮
    const imageButtonSelectors = [
      () => page.getByRole('button', { name: '图像' }),
      () => page.locator('button:has-text("图像")'),
      () => page.locator('[title="图像"]'),
      () => page.locator('button:has-text("图片")'),
      () => page.locator('button:has-text("插入图片")')
    ];

    let imageButton = null;
    for (let i = 0; i < imageButtonSelectors.length; i++) {
      try {
        const btn = imageButtonSelectors[i]();
        if (await btn.isVisible({ timeout: 2000 })) {
          imageButton = btn;
          ctx.logger.info(`  ✅ 找到图像按钮 (方式${i + 1})`);
          break;
        }
      } catch (e) {
        // 继续尝试下一个
      }
    }

    if (!imageButton) {
      throw new Error('未找到图像按钮');
    }

    await imageButton.click();
    await page.waitForTimeout(1500);

    ctx.logger.info('  ✅ 已打开图像选择弹窗');

    // ==================== 步骤5：搜索商品文件夹 ====================
    ctx.logger.info('\n[步骤5] 搜索商品文件夹');

    // 动态查找包含搜索框的 iframe（参考 Step5 的逻辑）
    const iframes = page.locator('iframe');
    const iframeCount = await iframes.count();
    ctx.logger.info(`  检测到 ${iframeCount} 个 iframe`);

    let imageFrame = null;
    for (let i = 0; i < iframeCount; i++) {
      try {
        const frame = iframes.nth(i).contentFrame();
        const searchInput = frame.getByRole('combobox', { name: '请输入文件夹名称' });
        if (await searchInput.isVisible({ timeout: 500 })) {
          imageFrame = frame;
          ctx.logger.info(`  ✅ 在第 ${i + 1} 个 iframe 中找到搜索框`);
          break;
        }
      } catch (e) {
        // 继续尝试下一个
      }
    }

    if (!imageFrame) {
      throw new Error('未找到图片选择弹窗的 iframe');
    }

    // 输入商品ID搜索文件夹
    const folderInput = imageFrame.getByRole('combobox', { name: '请输入文件夹名称' });
    await folderInput.click();
    await page.waitForTimeout(300);
    await folderInput.fill(productId);
    await page.waitForTimeout(1000);

    // 等待下拉建议出现并点击
    try {
      // 等待下拉菜单出现
      await imageFrame.locator('.next-menu-item-inner').first().waitFor({ state: 'visible', timeout: 5000 });
      await imageFrame.locator('.next-menu-item-inner').first().click();
    } catch (e) {
      // 备用方案：使用文本匹配
      ctx.logger.info('  ℹ️ 尝试备用方案选择文件夹');
      await imageFrame.locator(`:has-text("${productId}")`).first().click();
    }
    await page.waitForTimeout(1500);

    ctx.logger.info(`  ✅ 已选择文件夹: ${productId}`);

    // ==================== 步骤6：从最后一张往前选择图片 ====================
    ctx.logger.info('\n[步骤6] 选择图片（从最后一张往前）');

    // 不尝试排序，直接获取图片数量
    const imageCards = imageFrame.locator('.PicList_pic_background__pGTdV');
    const imageCount = await imageCards.count();

    ctx.logger.info(`  找到 ${imageCount} 张图片，开始倒序选择...`);

    // 从最后一张往前选择所有图片
    // 点击蓝色选中遮罩 .PicList_hoverBK__zH1fy
    for (let i = imageCount; i >= 1; i--) {
      try {
        // 定位到第 i 个图片卡片
        const card = imageFrame.locator(`.PicList_pic_background__pGTdV`).nth(i - 1);
        const hoverBK = card.locator('.PicList_hoverBK__zH1fy');

        // 先滚动卡片到可视区域
        await card.scrollIntoViewIfNeeded();
        // 悬停在卡片上，让蓝色遮罩层显示出来
        await card.hover();
        await page.waitForTimeout(100);
        // 点击蓝色遮罩层
        await hoverBK.click({ force: true });
        await page.waitForTimeout(80);

        ctx.logger.info(`    ✓ 已选择第 ${i} 张图片`);
      } catch (e) {
        ctx.logger.warn(`  ⚠️ 图片 ${i} 选择失败: ${e.message}`);
      }
    }

    ctx.logger.info(`  ✅ 已选择 ${imageCount} 张图片`);

    // ==================== 步骤7：确认选择 ====================
    ctx.logger.info('\n[步骤7] 确认选择');

    // 只点击确定按钮，不点击"本地上传"等其他按钮
    const confirmBtn = imageFrame.getByRole('button', { name: /确定/ }).first();
    await confirmBtn.click({ force: true });
    await page.waitForTimeout(1000);

    ctx.logger.info('  ✅ 已确认图片选择');

    // ==================== 步骤8：保存结果 ====================
    ctx.logger.info('\n[步骤8] 保存结果');

    // 更新缓存
    taskCache.detailResults = {
      templateUsed: '卡-LL=',
      imagesSelected: imageCount,
      success: true,
      timestamp: new Date().toISOString()
    };

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n========== 详情模板填写完成 ==========');
    ctx.logger.info(`使用模板: 卡-LL=`);
    ctx.logger.info(`选择图片: ${imageCount} 张`);
    ctx.logger.info('\n✅ Step11 详情模板填写完成，可继续到 Step12 提交商品');

  } catch (error) {
    ctx.logger.error(`❌ 详情模板填写失败: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `步骤11失败: ${error.message}`
        });
      } catch (updateError) {
        ctx.logger.error(`更新飞书错误日志失败: ${updateError.message}`);
      }
    }

    throw error;

  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');
  }
};

module.exports = { step11Detail };
