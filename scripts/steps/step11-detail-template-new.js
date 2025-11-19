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

    // ==================== 步骤3.5：定位到"注：SS=XS..."行末尾 ====================
    ctx.logger.info('\n[步骤3.5] 定位光标到尺码注释行末尾');

    // 在编辑弹窗中找到可编辑区域
    const editableArea = page.locator('.next-dialog-body [contenteditable="true"]').first();

    // 先点击编辑区域获取焦点
    await editableArea.click();
    await page.waitForTimeout(300);

    // 查找包含完整文字的段落，使用精确匹配避免截断
    try {
      // 使用完整文本进行精确定位
      const fullText = '注：SS=XS，LL=XL，3L=XXL，4L=XXXL';
      const sizeNoteParagraph = page.getByLabel('编辑模块').getByText(fullText, { exact: true });

      if (await sizeNoteParagraph.isVisible({ timeout: 2000 })) {
        // 先悬停在文字上
        await sizeNoteParagraph.hover();
        await page.waitForTimeout(100);

        // 点击文字（会将光标放在某处）
        await sizeNoteParagraph.click();
        await page.waitForTimeout(100);

        // 按End键移动到行末
        await page.keyboard.press('End');
        await page.waitForTimeout(100);

        // 再按右箭头确保在最末尾
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(100);

        ctx.logger.info('  ✅ 已定位到尺码注释行最末尾');
      } else {
        // 备用方案：使用Ctrl+End定位到文档末尾
        await page.keyboard.press('Control+End');
        ctx.logger.info('  ℹ️ 未找到尺码注释行，使用文档末尾位置');
      }
    } catch (e) {
      // 如果精确匹配失败，使用Ctrl+End定位到文档末尾
      await page.keyboard.press('Control+End');
      ctx.logger.info('  ℹ️ 定位失败，使用文档末尾位置');
    }

    // 按回车创建新行
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // ==================== 步骤4：插入详情页文字 ====================
    ctx.logger.info('\n[步骤4] 插入详情页文字');

    // 从飞书数据中获取详情文案（可能是数组）
    const detailText = Array.isArray(productData.detailCN)
      ? productData.detailCN.join('\n')
      : (productData.detailCN || productData.detailText || '');

    if (detailText) {
      // 使用 insertText 插入文字
      await page.keyboard.insertText(detailText);
      await page.waitForTimeout(300);
      // 插入后换两行，与尺码表分隔
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      ctx.logger.info(`  ✅ 已插入详情页文字 (${detailText.length} 字符)`);
    } else {
      ctx.logger.info('  ℹ️ 无详情页文字，跳过');
    }

    // ==================== 步骤5：插入尺码表 ====================
    ctx.logger.info('\n[步骤5] 插入尺码表');

    // 从飞书数据中获取尺码表
    const sizeTable = productData.sizeTable || productData.sizeTableText || '';

    if (sizeTable) {
      await page.keyboard.insertText(sizeTable);
      await page.waitForTimeout(300);
      // 插入后换两行，与图片分隔
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      ctx.logger.info(`  ✅ 已插入尺码表 (${sizeTable.length} 字符)`);
    } else {
      ctx.logger.info('  ℹ️ 无尺码表，跳过');
    }

    // ==================== 步骤6：点击图像按钮进入素材库 ====================
    ctx.logger.info('\n[步骤6] 点击图像按钮进入素材库');

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

    // ==================== 步骤7：搜索商品文件夹 ====================
    ctx.logger.info('\n[步骤7] 搜索商品文件夹');

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

    // ==================== 步骤8：从最后一张往前选择图片 ====================
    ctx.logger.info('\n[步骤8] 选择图片（从最后一张往前）');

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

    // ==================== 步骤9：点击素材库弹窗的"确定（N）"按钮 ====================
    ctx.logger.info('\n[步骤9] 点击素材库弹窗确定按钮');

    // 素材库弹窗的确定按钮：button.next-btn.next-medium.next-btn-primary.Footer_selectOk__...
    // 文字会显示"确定（22）"等
    const imageLibraryConfirmSelectors = [
      () => imageFrame.locator('button.Footer_selectOk__nEl3N'),  // 精确类名
      () => imageFrame.locator('button[class*="Footer_selectOk"]'),  // 模糊匹配类名
      () => imageFrame.getByRole('button', { name: /确定\s*\(\d+\)/ }),  // 匹配"确定（N）"
      () => imageFrame.getByRole('button', { name: /确定/ }).first()  // 通用备选
    ];

    let imageLibraryConfirmBtn = null;
    for (let i = 0; i < imageLibraryConfirmSelectors.length; i++) {
      try {
        const btn = imageLibraryConfirmSelectors[i]();
        if (await btn.isVisible({ timeout: 1000 })) {
          imageLibraryConfirmBtn = btn;
          ctx.logger.info(`  ✅ 找到素材库确定按钮 (方式${i + 1})`);
          break;
        }
      } catch (e) {
        // 继续尝试
      }
    }

    if (!imageLibraryConfirmBtn) {
      throw new Error('未找到素材库弹窗的确定按钮');
    }

    await imageLibraryConfirmBtn.click({ force: true });
    await page.waitForTimeout(1500);

    ctx.logger.info('  ✅ 已点击素材库确定按钮');

    // ==================== 步骤10：点击编辑模块弹窗的"确定"按钮 ====================
    ctx.logger.info('\n[步骤10] 点击编辑模块弹窗确定按钮');

    // 编辑模块弹窗的确定按钮：button.next-btn.next-medium.next-btn-primary.next-dialog-btn
    const editDialogConfirmSelectors = [
      () => page.locator('button.next-dialog-btn.next-btn-primary'),  // 精确类名
      () => page.locator('button[class*="next-dialog-btn"][class*="next-btn-primary"]'),
      () => page.locator('.next-dialog-footer button.next-btn-primary'),
      () => page.getByRole('button', { name: '确定' }).last()  // 最后一个确定按钮
    ];

    let editDialogConfirmBtn = null;
    for (let i = 0; i < editDialogConfirmSelectors.length; i++) {
      try {
        const btn = editDialogConfirmSelectors[i]();
        if (await btn.isVisible({ timeout: 2000 })) {
          editDialogConfirmBtn = btn;
          ctx.logger.info(`  ✅ 找到编辑模块确定按钮 (方式${i + 1})`);
          break;
        }
      } catch (e) {
        // 继续尝试
      }
    }

    if (!editDialogConfirmBtn) {
      throw new Error('未找到编辑模块弹窗的确定按钮');
    }

    await editDialogConfirmBtn.click({ force: true });
    await page.waitForTimeout(1000);

    ctx.logger.info('  ✅ 已点击编辑模块确定按钮，图片已写入编辑器');

    // ==================== 步骤11：保存结果 ====================
    ctx.logger.info('\n[步骤11] 保存结果');

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
