const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤12：填写详情模板
 * 填写商品详情页模板内容，处理复杂的 iframe 嵌套
 */
const step12 = async (ctx) => {
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
    const detailJP = productData.detailJP || '';
    const sellingPointsJP = productData.sellingPointsJP || '';
    const titleJP = productData.titleJP || '';

    ctx.logger.info(`准备填写详情页内容`);
    ctx.logger.info(`标题长度: ${titleJP.length}`);
    ctx.logger.info(`卖点长度: ${sellingPointsJP.length}`);
    ctx.logger.info(`详情长度: ${detailJP.length}`);

    // 步骤1：切换到详情编辑标签
    ctx.logger.info('\n[步骤1] 切换到详情编辑');

    // 查找并点击详情标签
    const detailTab = await page.$('.next-tabs-tab:has-text("详情"), .tab-item:has-text("商品详情")');
    if (detailTab) {
      await detailTab.click();
      ctx.logger.success('✅ 已切换到详情编辑');
      await page.waitForTimeout(2000);
    } else {
      ctx.logger.warn('未找到详情标签，可能已在详情页');
    }

    // 步骤2：等待编辑器加载
    ctx.logger.info('\n[步骤2] 等待详情编辑器加载');

    // 等待编辑器iframe加载
    let editorFrame = null;
    const maxWait = 10;
    for (let i = 0; i < maxWait; i++) {
      const frame = await page.$('.editor-container iframe, .detail-editor iframe, .ke-edit-iframe');
      if (frame) {
        editorFrame = frame;
        break;
      }
      await page.waitForTimeout(1000);
      ctx.logger.info(`  等待编辑器加载... ${i + 1}/${maxWait}`);
    }

    if (!editorFrame) {
      // 尝试其他可能的选择器
      const alternativeFrames = await page.$$('iframe');
      for (const frame of alternativeFrames) {
        const src = await frame.getAttribute('src');
        if (src && (src.includes('editor') || src.includes('edit'))) {
          editorFrame = frame;
          break;
        }
      }
    }

    if (!editorFrame) {
      throw new Error('未找到详情编辑器iframe');
    }

    ctx.logger.success('✅ 找到编辑器iframe');

    // 步骤3：获取编辑器内容并清理
    ctx.logger.info('\n[步骤3] 清理编辑器内容');

    const contentFrame = await editorFrame.contentFrame();
    if (!contentFrame) {
      throw new Error('无法进入编辑器iframe内容');
    }

    // 等待编辑器内DOM加载
    await contentFrame.waitForLoadState('domcontentloaded');

    // 查找编辑器主体
    const editorBody = await contentFrame.$('body, .editor-body, .content-body, [contenteditable="true"]');
    if (editorBody) {
      // 清空现有内容
      await contentFrame.evaluate(() => {
        const body = document.body || document.querySelector('.editor-body') || document.querySelector('.content-body');
        if (body) {
          body.innerHTML = '';
        }
      });
      ctx.logger.info('✅ 编辑器内容已清空');
    }

    // 步骤4：构建详情页HTML内容
    ctx.logger.info('\n[步骤4] 构建详情页内容');

    const detailHtml = buildDetailTemplate({
      title: titleJP,
      sellingPoints: sellingPointsJP,
      detail: detailJP,
      brand: productData.brand || '',
      productId: productId,
      colors: productData.colors || [],
      sizes: productData.sizes || []
    });

    // 步骤5：填充详情内容
    ctx.logger.info('\n[步骤5] 填充详情页内容');

    try {
      // 方法1：直接设置HTML
      await contentFrame.evaluate((html) => {
        const body = document.body || document.querySelector('.editor-body') || document.querySelector('.content-body');
        if (body) {
          body.innerHTML = html;
          // 触发change事件
          body.dispatchEvent(new Event('input', { bubbles: true }));
          body.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, detailHtml);

      ctx.logger.success('✅ 详情内容已填充');
    } catch (error) {
      ctx.logger.warn(`直接填充失败: ${error.message}`);

      // 方法2：模拟输入
      ctx.logger.info('尝试模拟输入方式...');
      await fillDetailByTyping(contentFrame, detailHtml, ctx);
    }

    // 步骤6：插入产品图片
    ctx.logger.info('\n[步骤6] 插入产品图片');

    // 查找插入图片按钮
    const insertImageButton = await page.$('button:has-text("图片"), .toolbar-image, .insert-image');
    if (insertImageButton) {
      // 获取已上传的图片列表
      const imageItems = await page.$$('.material-image-item img');
      if (imageItems.length > 0) {
        ctx.logger.info(`找到 ${imageItems.length} 张可用图片`);

        // 插入前3张图片到详情页
        for (let i = 0; i < Math.min(3, imageItems.length); i++) {
          const img = imageItems[i];
          const imgSrc = await img.getAttribute('src');

          if (imgSrc) {
            // 点击插入图片按钮
            await insertImageButton.click();
            await page.waitForTimeout(1000);

            // 选择图片
            const imageOption = await page.$(`img[src="${imgSrc}"], .image-item img[src="${imgSrc}"]`);
            if (imageOption) {
              await imageOption.click();
              await page.waitForTimeout(500);
            }

            // 确认插入
            const confirmButton = await page.$('button:has-text("确定"), .confirm-btn');
            if (confirmButton) {
              await confirmButton.click();
              await page.waitForTimeout(1000);
            }

            ctx.logger.info(`  ✓ 插入图片 ${i + 1}`);
          }
        }
      }
    }

    // 步骤7：保存详情内容
    ctx.logger.info('\n[步骤7] 保存详情内容');

    // 查找保存按钮
    const saveButton = await page.$('button:has-text("保存"), .save-detail-btn, .btn-save');
    if (saveButton) {
      await saveButton.click();
      ctx.logger.info('✅ 点击保存按钮');
      await page.waitForTimeout(2000);
    }

    // 步骤8：验证详情内容
    ctx.logger.info('\n[步骤8] 验证详情内容');

    // 检查是否有错误提示
    const errorMessages = await page.$$('[data-field="detail"] .error-message, .detail-error');
    if (errorMessages.length > 0) {
      ctx.logger.warn('发现详情错误:');
      for (const error of errorMessages) {
        const errorText = await error.textContent();
        ctx.logger.warn(`  - ${errorText}`);
      }
    }

    // 获取编辑器内容长度
    const contentLength = await contentFrame.evaluate(() => {
      const body = document.body || document.querySelector('.editor-body');
      return body ? body.textContent.length : 0;
    });

    ctx.logger.info(`详情内容长度: ${contentLength} 字符`);

    // 更新缓存
    taskCache.detailResults = {
      contentLength: contentLength,
      htmlLength: detailHtml.length,
      templateUsed: 'standard',
      imagesInserted: Math.min(3, await page.$$('.material-image-item img').length),
      success: true,
      timestamp: new Date().toISOString()
    };

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n=== 详情模板填写完成 ===');
    ctx.logger.info(`内容长度: ${contentLength} 字符`);
    ctx.logger.info(`插入图片: ${taskCache.detailResults.imagesInserted} 张`);

  } catch (error) {
    ctx.logger.error(`详情模板填写失败: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `步骤12失败: ${error.message}`
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

/**
 * 构建详情页HTML模板
 */
function buildDetailTemplate(data) {
  const { title, sellingPoints, detail, brand, productId, colors, sizes } = data;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <!-- 商品标题 -->
      <h1 style="text-align: center; color: #333; margin-bottom: 20px;">${title}</h1>

      <!-- 品牌信息 -->
      ${brand ? `
      <div style="text-align: center; margin-bottom: 30px;">
        <span style="background: #f0f0f0; padding: 5px 15px; border-radius: 3px; font-size: 14px;">
          品牌: ${brand}
        </span>
      </div>
      ` : ''}

      <!-- 商品卖点 -->
      ${sellingPoints ? `
      <div style="background: #f9f9f9; padding: 15px; margin: 20px 0; border-radius: 5px;">
        <h3 style="margin-top: 0; color: #333;">商品特点</h3>
        <div style="line-height: 1.8;">${sellingPoints.replace(/\n/g, '<br>')}</div>
      </div>
      ` : ''}

      <!-- 商品详情 -->
      ${detail ? `
      <div style="margin: 30px 0;">
        <h3 style="color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px;">商品详情</h3>
        <div style="line-height: 1.8; color: #666;">${detail.replace(/\n/g, '<br>')}</div>
      </div>
      ` : ''}

      <!-- 规格信息 -->
      <div style="background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
        <h3 style="margin-top: 0; color: #333;">规格信息</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #fff; font-weight: bold;">商品编号</td>
            <td style="padding: 8px; border: 1px solid #ddd; background: #fff;">${productId}</td>
          </tr>
          ${colors.length > 0 ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #fff; font-weight: bold;">颜色</td>
            <td style="padding: 8px; border: 1px solid #ddd; background: #fff;">
              ${colors.map(c => c.colorName).join('、')}
            </td>
          </tr>
          ` : ''}
          ${sizes.length > 0 ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #fff; font-weight: bold;">尺码</td>
            <td style="padding: 8px; border: 1px solid #ddd; background: #fff;">
              ${sizes.join('、')}
            </td>
          </tr>
          ` : ''}
        </table>
      </div>

      <!-- 购买须知 -->
      <div style="background: #fff8e1; padding: 15px; margin: 20px 0; border-left: 4px solid #ffc107;">
        <h4 style="margin-top: 0; color: #333;">购买须知</h4>
        <ul style="line-height: 1.8; color: #666;">
          <li>商品实物拍摄，因光线、显示器不同可能存在轻微色差</li>
          <li>尺码仅供参考，请根据个人情况选择</li>
          <li>支持7天无理由退换货（商品完好情况下）</li>
          <li>如有任何问题，请联系客服</li>
        </ul>
      </div>

      <!-- 品牌承诺 -->
      <div style="text-align: center; margin-top: 40px; padding: 20px; background: #f0f0f0;">
        <p style="margin: 0; color: #666;">品质保证 · 正品保障 · 售后无忧</p>
      </div>
    </div>
  `;
}

/**
 * 通过模拟输入填充内容
 */
async function fillDetailByTyping(contentFrame, html, ctx) {
  // 分段输入避免内容过大
  const chunks = html.match(/.{1,1000}/g) || [html];

  for (const chunk of chunks) {
    try {
      await contentFrame.type('body', chunk, { delay: 10 });
      ctx.logger.info(`  已输入 ${chunk.length} 字符`);
    } catch (error) {
      ctx.logger.warn(`输入失败: ${error.message}`);
    }
  }
}

module.exports = { step12 };