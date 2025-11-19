const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤10：裁剪3:4主图
 * 简化版实现，使用页面内置的裁剪功能
 */
const step10Crop = async (ctx) => {
  ctx.logger.info('开始裁剪3:4主图');

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

    // 加载缓存
    const taskCache = loadTaskCache(productId);

    ctx.logger.info('\n========== 裁剪3:4主图 ==========');

    // ==================== 步骤1：定位3:4主图区域 ====================
    ctx.logger.info('\n[步骤1] 定位3:4主图区域');

    try {
      await page.getByText('3:4主图图片要求：宽高比为3:4，推荐尺寸').scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      ctx.logger.info('  ✅ 已定位到3:4主图区域');
    } catch (e) {
      ctx.logger.info('  ℹ️ 尝试其他方式定位3:4主图区域');
      // 备用定位方式
      const cropSection = page.locator('text=3:4主图').first();
      if (await cropSection.isVisible()) {
        await cropSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
      }
    }

    // ==================== 步骤2：点击裁剪按钮 ====================
    ctx.logger.info('\n[步骤2] 点击裁剪按钮');

    const cropButton = page.getByRole('button', { name: '从1:1主图裁剪' });
    await cropButton.click();
    ctx.logger.info('  ✅ 已点击"从1:1主图裁剪"按钮');

    // ==================== 步骤3：等待裁剪完成 ====================
    ctx.logger.info('\n[步骤3] 等待裁剪完成');

    await page.waitForTimeout(2000);
    ctx.logger.info('  ✅ 裁剪处理完成');

    // ==================== 步骤4：保存结果 ====================
    ctx.logger.info('\n[步骤4] 保存结果');

    // 更新缓存
    taskCache.cropResults = {
      method: 'auto_crop',
      status: 'completed',
      timestamp: new Date().toISOString()
    };

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n========== 3:4主图裁剪完成 ==========');
    ctx.logger.info('裁剪方式: 从1:1主图自动裁剪');
    ctx.logger.info('\n✅ Step10 3:4主图裁剪完成，可继续到 Step11 详情模板');

  } catch (error) {
    ctx.logger.error(`❌ 3:4主图裁剪失败: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `步骤10失败: ${error.message}`
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

module.exports = { step10Crop };
