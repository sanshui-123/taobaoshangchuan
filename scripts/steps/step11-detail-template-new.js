const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

async function handleCropConfirm(page, ctx) {
  try {
    const cropMask = page.locator('.media-wrap, [class*="media-wrap"], [class*="cropper"], .Footer_editOk__');
    const okCandidates = [
      page.locator('button:has-text("确定")').filter({ has: cropMask }).first(),
      page.locator('.next-btn-primary:has-text("确定")').first(),
      page.locator('button[class*="Footer_editOk"]').first()
    ];

    const maskVisible = await cropMask.first().isVisible().catch(() => false);
    let okBtn = null;
    for (const btn of okCandidates) {
      if (btn && await btn.isVisible().catch(() => false)) {
        okBtn = btn;
        break;
      }
    }

    if (maskVisible || okBtn) {
      ctx.logger.info('  检测到裁剪弹窗，尝试点击"确定"');

      // 先关闭任何可能遮挡的警告弹窗（如"流量限制"）
      try {
        const warningCloseSelectors = [
          'button[aria-label="Close"]',
          '.next-message-close',
          '.next-dialog-close',
          'button:has-text("×")',
          '[class*="close"]:has-text("×")'
        ];
        for (const sel of warningCloseSelectors) {
          const closeBtn = page.locator(sel).first();
          if (await closeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
            await closeBtn.click({ force: true }).catch(() => {});
            ctx.logger.info('  ✅ 已关闭警告遮挡层');
            await page.waitForTimeout(300);
            break;
          }
        }
      } catch (e) {
        // 忽略
      }

      if (okBtn) {
        await okBtn.click({ force: true, timeout: 3000 }).catch(() => {});
      }
      await page.waitForTimeout(800);
      const stillVisible = await cropMask.first().isVisible().catch(() => false);
      if (!stillVisible) {
        ctx.logger.info('  ✅ 裁剪弹窗已关闭');
      } else {
        ctx.logger.warn('  ⚠️ 裁剪弹窗可能仍存在，请留意后续步骤');
      }
    }
  } catch (e) {
    ctx.logger.warn(`  ⚠️ 处理裁剪弹窗时出错（忽略继续）: ${e.message}`);
  }
}

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

    // 点击清空按钮（限定在编辑区域，避免多匹配）
    const clearBtn = page.locator('#panel_edit').getByRole('button', { name: '清空' }).first();
    await clearBtn.click();
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

    // 按品牌选择模板：PEARLY GATES 用专属模板，其余用默认（男店 Archivio 用 ada小狗牌）
    const store = (process.env.TAOBAO_STORE || 'male').trim().toLowerCase(); // male / female
    const brandKey = (productData.brand || '').trim().toLowerCase();
    const defaultTemplate = process.env.DETAIL_TEMPLATE_DEFAULT || '卡-LL=';
    const pingTemplate = process.env.DETAIL_TEMPLATE_PING || '卡-LL=';
    const mizunoTemplate = process.env.DETAIL_TEMPLATE_MIZUNO || '卡-LL=';
    const maleArchivioTemplate = process.env.DETAIL_TEMPLATE_MALE_ARCHIVIO || 'ada小狗牌';
    const femaleArchivioTemplate = process.env.DETAIL_TEMPLATE_FEMALE_ARCHIVIO || 'archivio';
    const isMaleArchivio = store === 'male' && brandKey.includes('archivio');
    const isFemaleArchivio = store === 'female' && brandKey.includes('archivio');
    const templateName = isMaleArchivio
      ? maleArchivioTemplate
      : isFemaleArchivio
        ? femaleArchivioTemplate
      : (brandKey === 'pearly gates'
        ? (process.env.DETAIL_TEMPLATE_PEARLY_GATES || 'MBE')
        : (brandKey.includes('ping')
          ? pingTemplate
          : ((brandKey.includes('mizuno') || brandKey.includes('美津浓')) ? mizunoTemplate : defaultTemplate)));

    const templateOption = page.getByText(templateName, { exact: true });
    await templateOption.click();
    await page.waitForTimeout(500);  // 优化：1000ms降到500ms

    ctx.logger.info(`  ✅ 已选择模板: ${templateName}`);

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
    await page.waitForTimeout(500);  // 优化：1000ms降到500ms

    ctx.logger.info('  ✅ 已打开模板编辑弹窗');

    // ==================== 步骤3.2：清理所有残留锚点（批量模式兜底） ====================
    ctx.logger.info('\n[步骤3.2] 清理所有残留锚点（批量模式必须）');

    try {
      const cleaned = await page.evaluate(() => {
        let count = 0;
        // 清理所有可能的锚点ID
        const anchorIds = ['__cursor_anchor__', '__cursor_anchor_img__'];
        anchorIds.forEach(id => {
          const elements = document.querySelectorAll(`#${id}`);
          elements.forEach(el => {
            el.remove();
            count++;
          });
        });
        // 额外清理：移除所有宽度为0的span（可能是遗留锚点）
        const allSpans = document.querySelectorAll('span[style*="width: 0"], span[style*="width:0"]');
        allSpans.forEach(span => {
          if (span.id.includes('cursor') || span.id.includes('anchor')) {
            span.remove();
            count++;
          }
        });
        return count;
      });

      if (cleaned > 0) {
        ctx.logger.info(`  ✅ 已清理 ${cleaned} 个残留锚点元素`);
      } else {
        ctx.logger.info('  ✅ 无残留锚点，DOM状态干净');
      }

      // 等待DOM稳定
      await page.waitForTimeout(300);
    } catch (e) {
      ctx.logger.warn(`  ⚠️ 清理锚点时出错（继续执行）: ${e.message}`);
    }

    // ==================== 步骤3.5：定位到第一张图片左侧（确保新内容插在最前） ====================
    ctx.logger.info('\n[步骤3.5] 定位光标到第一张图片左侧');

    // 在编辑弹窗中找到可编辑区域
    const editableArea = page.locator('.next-dialog-body [contenteditable="true"]').first();

    // 先点击编辑区域获取焦点
    await editableArea.click();
    await page.waitForTimeout(300);

    let positioned = false;
    try {
      const success = await page.evaluate(() => {
        const editable = document.querySelector('.next-dialog-body [contenteditable="true"]');
        if (!editable) return false;
        // 移除旧锚点
        const old = editable.querySelector('#__cursor_anchor__');
        if (old) old.remove();
        const anchor = document.createElement('span');
        anchor.id = '__cursor_anchor__';
        anchor.style.display = 'inline-block';
        anchor.style.width = '0';

        const firstImg = editable.querySelector('img');
        if (firstImg && firstImg.parentNode) {
          firstImg.parentNode.insertBefore(anchor, firstImg);
        } else {
          editable.insertBefore(anchor, editable.firstChild);
        }

        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(anchor, 0);
        range.setEnd(anchor, 0);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      });
      if (success) {
        positioned = true;
        // 预留空行，确保后续插入在图片之前
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowUp');
        ctx.logger.info('  ✅ 已将光标定位到模板首图之前（或文首），并预留空行');
      }
    } catch (e) {
      ctx.logger.warn(`  ⚠️ 定位图片前插入位置失败: ${e.message}`);
    }

    if (!positioned) {
      // 备用：移动到文档开头插入空行
      ctx.logger.info('  ℹ️ 使用文档开头作为插入位置');
      await page.keyboard.press('Control+Home').catch(() => {});
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowUp');
    }

    // ==================== 步骤4：插入详情页文字 ====================
    ctx.logger.info('\n[步骤4] 插入详情页文字');

    // 从飞书数据中获取详情文案（可能是数组）
    let detailText = '';
    if (Array.isArray(productData.detailCN)) {
      detailText = productData.detailCN.join('\n');
      ctx.logger.info(`  从数组获取详情文案: ${productData.detailCN.length} 行`);
    } else if (productData.detailCN) {
      detailText = productData.detailCN;
      ctx.logger.info(`  从字符串获取详情文案`);
    } else if (productData.detailText) {
      detailText = productData.detailText;
      ctx.logger.info(`  从 detailText 字段获取详情文案`);
    }

    if (detailText && detailText.trim()) {
      // 打印前50个字符用于调试
      ctx.logger.info(`  详情文案预览: ${detailText.substring(0, 50)}...`);

      // 使用 insertText 插入文字，确保完整插入
      await page.keyboard.insertText(detailText);
      await page.waitForTimeout(500); // 增加等待时间确保文字完整插入

      // 插入后换两行，与尺码表分隔
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');

      ctx.logger.info(`  ✅ 已插入详情页文字 (${detailText.length} 字符)`);
    } else {
      ctx.logger.info('  ℹ️ 无详情页文字，跳过');
    }

    // ==================== 步骤5：插入尺码表 ====================
    ctx.logger.info('\n[步骤5] 插入尺码表');

    // 从飞书数据中获取尺码表 - 尝试多个可能的字段名
    let sizeTable = '';

    // 首先检查直接的尺码表字段
    if (productData.sizeTable) {
      sizeTable = productData.sizeTable;
      ctx.logger.info(`  从 sizeTable 字段获取尺码表`);
    } else if (productData.sizeTableText) {
      sizeTable = productData.sizeTableText;
      ctx.logger.info(`  从 sizeTableText 字段获取尺码表`);
    } else if (productData.sizeTableCN) {
      sizeTable = productData.sizeTableCN;
      ctx.logger.info(`  从 sizeTableCN 字段获取尺码表`);
    } else if (productData.size_table) {
      sizeTable = productData.size_table;
      ctx.logger.info(`  从 size_table 字段获取尺码表`);
    }

    // 处理数组格式的尺码表
    if (Array.isArray(sizeTable)) {
      sizeTable = sizeTable.join('\n');
      ctx.logger.info(`  尺码表为数组格式，已合并`);
    }

    // 确保sizeTable是字符串
    if (typeof sizeTable !== 'string') {
      sizeTable = '';
    }

    if (sizeTable && sizeTable.trim()) {
      // 打印前100个字符用于调试（尺码表可能比较长）
      ctx.logger.info(`  尺码表预览: ${sizeTable.substring(0, 100)}...`);
      ctx.logger.info(`  尺码表总长度: ${sizeTable.length} 字符`);

      // 使用 insertText 插入尺码表，确保完整插入
      await page.keyboard.insertText(sizeTable);
      await page.waitForTimeout(800); // 增加等待时间确保文字完整插入

      // 插入后换两行，与图片分隔
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');

      ctx.logger.info(`  ✅ 已插入尺码表 (${sizeTable.length} 字符)`);
    } else {
      // 打印所有字段名帮助调试
      ctx.logger.info('  ℹ️ 未找到尺码表数据');
      ctx.logger.info(`  可用字段: ${Object.keys(productData).join(', ')}`);
    }

    // ==================== 步骤5.5：重新定位到模板图片前（确保图片正确插入） ====================
    ctx.logger.info('\n[步骤5.5] 重新定位光标到模板图片前');

    // 文案和尺码表已插入在图片上方
    // 现在需要重新定位到模板第一张图片前，确保后续插入的商品图片在正确位置
    // 使用和插入文字一样的DOM Range API方法，确保位置准确
    try {
      const success = await page.evaluate(() => {
        const editable = document.querySelector('.next-dialog-body [contenteditable="true"]');
        if (!editable) return false;

        // 移除旧锚点
        const old = editable.querySelector('#__cursor_anchor_img__');
        if (old) old.remove();

        // 创建新锚点
        const anchor = document.createElement('span');
        anchor.id = '__cursor_anchor_img__';
        anchor.style.display = 'inline-block';
        anchor.style.width = '0';

        // 找到第一张图片，在其前面插入锚点
        const firstImg = editable.querySelector('img');
        if (firstImg && firstImg.parentNode) {
          firstImg.parentNode.insertBefore(anchor, firstImg);
        } else {
          // 如果没有图片，插入到可编辑区域的最前面
          editable.insertBefore(anchor, editable.firstChild);
        }

        // 使用DOM Range API设置光标位置
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(anchor, 0);
        range.setEnd(anchor, 0);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      });

      if (success) {
        // 预留空行，确保后续插入在图片之前
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowUp');
        ctx.logger.info('  ✅ 已使用DOM Range API将光标定位到模板图片前，准备插入商品图片');
      } else {
        ctx.logger.warn('  ⚠️ DOM定位失败，光标保持当前位置');
      }
    } catch (e) {
      ctx.logger.warn(`  ⚠️ 重新定位失败: ${e.message}，光标保持当前位置`);
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
    await page.waitForTimeout(500);  // 优化：1500ms降到500ms

    ctx.logger.info('  ✅ 已打开图像选择弹窗');

    // ==================== 步骤7：搜索商品文件夹 ====================
    ctx.logger.info('\n[步骤7] 搜索商品文件夹');

    // 动态查找包含搜索框的 iframe（参考 Step5 的逻辑）
    // 先在弹窗内查找 iframe，再全局兜底
    const imageDialogLocator = page.locator('.next-dialog:has-text("图像"), .next-dialog:has-text("图片"), .next-dialog');
    let imageFrame = null;

    const scanFrames = async (framesLocator) => {
      const total = await framesLocator.count();
      for (let i = 0; i < total; i++) {
        try {
          const locator = framesLocator.nth(i);
          const frame = await locator.contentFrame();
          if (!frame) continue;
          const searchInput = frame.getByRole('combobox', { name: '请输入文件夹名称' });
          if (await searchInput.isVisible({ timeout: 800 })) {
            ctx.logger.info(`  ✅ 在第 ${i + 1} 个 iframe 中找到搜索框`);
            return frame;
          }
        } catch (e) {
          // 继续尝试下一个
        }
      }
      return null;
    };

    // 方案1：弹窗内的 iframe
    if (await imageDialogLocator.count()) {
      const dialogFrames = imageDialogLocator.locator('iframe');
      imageFrame = await scanFrames(dialogFrames);
    }

    // 方案2：全局 iframe 兜底
    if (!imageFrame) {
      const globalIframes = page.locator('iframe');
      const iframeCount = await globalIframes.count();
      ctx.logger.info(`  检测到 ${iframeCount} 个 iframe（全局兜底）`);
      imageFrame = await scanFrames(globalIframes);
    }

    if (!imageFrame) {
      throw new Error('未找到图片选择弹窗的 iframe');
    }

    // 输入商品ID搜索文件夹
    const folderInput = imageFrame.getByRole('combobox', { name: '请输入文件夹名称' });
    await folderInput.click();
    await page.waitForTimeout(300);
    await folderInput.fill(productId);
    await page.waitForTimeout(500);  // 优化：1000ms降到500ms

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
    await page.waitForTimeout(500);  // 优化：1500ms降到500ms

    ctx.logger.info(`  ✅ 已选择文件夹: ${productId}`);

    // 排序：文件名降序
    try {
      ctx.logger.info('  排序：尝试点击排序下拉并选择"文件名降序"');
      const triggers = [
        // 方式1：带文字的下拉选择器
        imageFrame.locator('.next-select-trigger, .next-select').filter({ hasText: /上传时间|文件名|排序/ }).first(),
        // 方式2：按钮角色
        imageFrame.getByRole('button', { name: /上传时间|文件名|排序/ }).first(),
        // 方式3：data-testid 或 class 包含 sort
        imageFrame.locator('[data-testid*="sort"], [class*="sort"], .PicList_sort, .picList_sort').locator('button, .next-select-trigger').first(),
        // 方式4：包含"排序"文字的元素
        imageFrame.getByText(/排序/).locator('..').locator('button, .next-select-trigger').first(),
        // 方式5：下拉箭头图标（通常有 .next-icon-arrow-down）
        imageFrame.locator('button').filter({ has: imageFrame.locator('.next-icon-arrow-down, .arrow-down') }).first(),
        // 方式6：工具栏中的下拉按钮
        imageFrame.locator('.toolbar, .action-bar, .filter-bar').locator('.next-select-trigger, select, button').first()
      ];

      let trigger = null;
      for (let i = 0; i < triggers.length; i++) {
        const t = triggers[i];
        try {
          const count = await t.count();
          if (count > 0) {
            ctx.logger.info(`  找到排序触发器（方式${i + 1}），共${count}个`);
            trigger = t;
            break;
          }
        } catch (e) {
          // 忽略单个选择器的错误，继续尝试下一个
        }
      }

      if (trigger) {
        await trigger.click({ force: true });
        await page.waitForTimeout(500);  // 增加等待时间，让下拉菜单完全展开

        const optionSelectors = [
          'li.next-menu-item:has-text("文件名降序")',
          'li:has-text("文件名降序")',
          'li:has-text("文件名倒序")',
          'li:has-text("名称降序")',
          'li:has-text("按文件名降序")',
          '[role="option"]:has-text("文件名降序")',
          '[role="menuitem"]:has-text("文件名降序")',
          '.next-menu-item:has-text("降序")',
          'text=/文件名.*降序/',
          'text=/名称.*降序/'
        ];

        let option = null;
        for (const sel of optionSelectors) {
          try {
            const candidate = page.locator(sel).first();  // 使用 page 而不是 imageFrame，因为下拉菜单可能在外层
            const count = await candidate.count();
            if (count > 0) {
              ctx.logger.info(`  找到排序选项: ${sel}`);
              option = candidate;
              break;
            }
          } catch (e) {
            // 忽略单个选择器的错误
          }
        }

        if (option) {
          await option.click({ force: true });
          ctx.logger.info('  ✅ 已选择"文件名降序"');
          await page.waitForTimeout(400);
        } else {
          ctx.logger.warn('  ⚠️ 未找到"文件名降序/倒序"选项，继续默认排序');
          // 尝试按ESC键关闭可能打开的下拉菜单
          await page.keyboard.press('Escape');
        }
      } else {
        ctx.logger.warn('  ⚠️ 未找到排序下拉，继续默认排序');
      }
    } catch (e) {
      ctx.logger.warn(`  ⚠️ 排序操作失败（忽略继续）: ${e.message}`);
      // 尝试按ESC键关闭可能打开的下拉菜单
      try {
        await page.keyboard.press('Escape');
      } catch {}
    }

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

    // 素材库弹窗的确定按钮 - 多种选择器策略
    // 策略1: 带计数的确定按钮（旧版）
    const confirmWithCount = imageFrame.locator('button:has(.next-btn-count):has-text("确定")');

    // 策略2: 主按钮样式的确定按钮（新版，基于实际DOM）
    const confirmPrimaryBtn = imageFrame.locator('button.next-btn-primary:has-text("确定")');

    // 策略3: 带括号数字的确定按钮
    const fallbackWithBracket = imageFrame.locator('button').filter({
      hasText: /\(\s*\d+\s*\)/,
      hasText: /确定|確定/
    });

    // 策略4: 任何包含"确定"的按钮（最后兜底）
    const fallbackAnyConfirm = imageFrame.locator('button').filter({
      hasText: /确定|確定/
    });

    let imageLibraryConfirmBtn = null;
    const countStrategy1 = await confirmWithCount.count();
    const countStrategy2 = await confirmPrimaryBtn.count();
    const countStrategy3 = await fallbackWithBracket.count();
    const countStrategy4 = await fallbackAnyConfirm.count();
    ctx.logger.info(`  🔍 确定按钮匹配: strategy1=${countStrategy1}, strategy2=${countStrategy2}, strategy3=${countStrategy3}, strategy4=${countStrategy4}`);

    if (countStrategy1 > 0) {
      imageLibraryConfirmBtn = confirmWithCount;
      ctx.logger.info('  ℹ️ 使用策略1（带计数元素）');
    } else if (countStrategy2 > 0) {
      imageLibraryConfirmBtn = confirmPrimaryBtn;
      ctx.logger.info('  ℹ️ 使用策略2（主按钮样式 .next-btn-primary）');
    } else if (countStrategy3 > 0) {
      imageLibraryConfirmBtn = fallbackWithBracket;
      ctx.logger.info('  ℹ️ 使用策略3（括号数字匹配）');
    } else if (countStrategy4 > 0) {
      imageLibraryConfirmBtn = fallbackAnyConfirm;
      ctx.logger.info('  ℹ️ 使用策略4（通用确定按钮）');
    } else {
      throw new Error('未找到任何确定按钮选择器');
    }

    await imageLibraryConfirmBtn.first().waitFor({ state: 'visible', timeout: 8000 });
    await imageLibraryConfirmBtn.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const enabled = await imageLibraryConfirmBtn.first().isEnabled();
    if (!enabled) {
      throw new Error('素材库确定按钮不可用');
    }

    await imageLibraryConfirmBtn.first().click({ force: true });

    // 若首次点击后按钮仍存在，再尝试一次点击（防止首次未生效）
    try {
      await imageLibraryConfirmBtn.first().waitFor({ state: 'detached', timeout: 3000 });
    } catch (e) {
      ctx.logger.warn('  ⚠️ 首次点击后按钮仍在，重试一次');
      await imageLibraryConfirmBtn.first().click({ force: true });
    }

    // 再等弹窗关闭或按钮消失，最多5秒
    await imageLibraryConfirmBtn.first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);  // 优化：1500ms降到500ms

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
    await page.waitForTimeout(500);  // 优化：1000ms降到500ms

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
