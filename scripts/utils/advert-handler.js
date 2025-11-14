/**
 * 素材库广告弹窗处理模块
 * 用于处理素材库页面的各种广告弹窗，确保主流程不受干扰
 */

/**
 * 关闭素材库页面的广告弹窗
 * @param {Object} page - Playwright页面对象
 * @returns {Promise<Object>} 处理结果统计
 */
async function closeMaterialCenterPopups(page) {
  const results = {
    videoDialogClosed: false,
    migrationGuideSkipped: false,
    bottomNotificationClosed: false,
    totalClosed: 0
  };

  const ctx = {
    logger: {
      info: (msg) => console.log(`[广告处理] ${msg}`),
      success: (msg) => console.log(`[广告处理] ✅ ${msg}`),
      warn: (msg) => console.log(`[广告处理] ⚠️ ${msg}`)
    }
  };

  ctx.logger.info('开始检查素材库页面广告弹窗...');

  try {
    // 处理第一个广告：视频弹窗
    await closeVideoDialog(page, ctx, results);

    // 处理第二个广告：迁移引导弹窗
    await closeMigrationGuide(page, ctx, results);

    // 处理第三个广告：右下角通知弹窗
    await closeBottomNotification(page, ctx, results);

    // 输出处理结果
    ctx.logger.success(`广告处理完成 - 共关闭 ${results.totalClosed} 个弹窗`);
    if (results.totalClosed > 0) {
      ctx.logger.info(`处理详情: 视频${results.videoDialogClosed ? '✓' : '✗'} | 迁移${results.migrationGuideSkipped ? '✓' : '✗'} | 通知${results.bottomNotificationClosed ? '✓' : '✗'}`);
    } else {
      ctx.logger.info('未检测到广告弹窗');
    }

    return results;

  } catch (error) {
    ctx.logger.warn(`广告处理过程中出现异常: ${error.message}`);
    return results;
  }
}

/**
 * 关闭视频弹窗广告
 * @param {Object} page
 * @param {Object} ctx
 * @param {Object} results
 */
async function closeVideoDialog(page, ctx, results) {
  try {
    ctx.logger.info('检查视频弹窗广告...');

    // 等待一下让弹窗可能加载完成
    await page.waitForTimeout(1000);

    // 查找视频弹窗对话框
    const videoDialog = await page.$('.next-dialog-body:has(.next-video)');
    if (videoDialog) {
      ctx.logger.info('发现视频弹窗');

      // 查找关闭按钮 - 右上角的X图标
      const closeButton = await videoDialog.$('.next-icon-close, .next-dialog-close');
      if (closeButton) {
        await closeButton.click();
        await page.waitForTimeout(500); // 等待弹窗关闭动画

        results.videoDialogClosed = true;
        results.totalClosed++;
        ctx.logger.success('已关闭视频弹窗广告');
        return;
      }

      // 备用方案：通过文本内容查找关闭按钮
      const closeByTitle = await page.$('.next-dialog-header:has-text("视频") .next-icon-close');
      if (closeByTitle) {
        await closeByTitle.click();
        await page.waitForTimeout(500);

        results.videoDialogClosed = true;
        results.totalClosed++;
        ctx.logger.success('已关闭视频弹窗广告（通过标题）');
        return;
      }

      // 第三种方案：直接点击关闭按钮的位置
      await page.click('.next-dialog:has(.next-video) .next-icon-close');
      await page.waitForTimeout(500);

      results.videoDialogClosed = true;
      results.totalClosed++;
      ctx.logger.success('已关闭视频弹窗广告（通用方案）');
    } else {
      ctx.logger.info('未发现视频弹窗广告');
    }

  } catch (error) {
    ctx.logger.info('未发现视频弹窗广告或关闭失败');
    // 不抛出异常，继续处理其他广告
  }
}

/**
 * 关闭迁移引导弹窗
 * @param {Object} page
 * @param {Object} ctx
 * @param {Object} results
 */
async function closeMigrationGuide(page, ctx, results) {
  try {
    ctx.logger.info('检查迁移引导弹窗...');

    // 查找"跳过"按钮 - 根据截图中的类名
    const skipButton = await page.$('.Intro_cardSkip');
    if (skipButton) {
      ctx.logger.info('发现迁移引导弹窗');

      await skipButton.click();
      await page.waitForTimeout(500);

      results.migrationGuideSkipped = true;
      results.totalClosed++;
      ctx.logger.success('已点击跳过迁移引导弹窗');
      return;
    }

    // 备用方案：通过文本内容查找跳过按钮
    const skipByText = await page.$('button:has-text("跳过")');
    if (skipByText) {
      await skipByText.click();
      await page.waitForTimeout(500);

      results.migrationGuideSkipped = true;
      results.totalClosed++;
      ctx.logger.success('已点击跳过按钮（文本方案）');
      return;
    }

    // 第三种方案：查找包含"已迁移至"文本的弹窗
    const migrationDialog = await page.$('div:has-text("已迁移至")');
    if (migrationDialog) {
      const skipBtn = await migrationDialog.$('button');
      if (skipBtn) {
        await skipBtn.click();
        await page.waitForTimeout(500);

        results.migrationGuideSkipped = true;
        results.totalClosed++;
        ctx.logger.success('已关闭迁移引导弹窗（内容方案）');
        return;
      }
    }

    ctx.logger.info('未发现迁移引导弹窗');

  } catch (error) {
    ctx.logger.info('未发现迁移引导弹窗或关闭失败');
  }
}

/**
 * 关闭右下角通知弹窗
 * @param {Object} page
 * @param {Object} ctx
 * @param {Object} results
 */
async function closeBottomNotification(page, ctx, results) {
  try {
    ctx.logger.info('检查右下角通知弹窗...');

    // 查找通知弹窗容器
    const notification = await page.$('.notify_body, .notification-body, .message-popup');
    if (notification) {
      ctx.logger.info('发现右下角通知弹窗');

      // 查找关闭图标
      const closeIcon = await notification.$('.next-icon-close, .close-icon, .notification-close');
      if (closeIcon) {
        await closeIcon.click();
        await page.waitForTimeout(500);

        results.bottomNotificationClosed = true;
        results.totalClosed++;
        ctx.logger.success('已关闭右下角通知弹窗');
        return;
      }

      // 备用方案：查找通用关闭按钮
      const closeBtn = await notification.$('button[aria-label*="关闭"], button[title*="关闭"]');
      if (closeBtn) {
        await closeBtn.click();
        await page.waitForTimeout(500);

        results.bottomNotificationClosed = true;
        results.totalClosed++;
        ctx.logger.success('已关闭通知弹窗（aria-label方案）');
        return;
      }

      // 第三种方案：直接点击通知的关闭区域
      await notification.click('.next-icon');
      await page.waitForTimeout(500);

      results.bottomNotificationClosed = true;
      results.totalClosed++;
      ctx.logger.success('已关闭通知弹窗（通用方案）');
      return;
    }

    // 备用方案：通过"重要消息"文本查找
    const importantMessage = await page.$('div:has-text("重要消息")');
    if (importantMessage) {
      const closeBtn = await importantMessage.$('.next-icon-close');
      if (closeBtn) {
        await closeBtn.click();
        await page.waitForTimeout(500);

        results.bottomNotificationClosed = true;
        results.totalClosed++;
        ctx.logger.success('已关闭重要消息弹窗');
        return;
      }
    }

    ctx.logger.info('未发现右下角通知弹窗');

  } catch (error) {
    ctx.logger.info('未发现右下角通知弹窗或关闭失败');
  }
}

/**
 * 批量关闭多个广告弹窗（用于页面加载后多次调用）
 * @param {Object} page
 * @param {number} maxAttempts 最大尝试次数
 * @returns {Promise<Object>}
 */
async function closeAllPopups(page, maxAttempts = 3) {
  const totalResults = {
    videoDialogClosed: 0,
    migrationGuideSkipped: 0,
    bottomNotificationClosed: 0,
    totalClosed: 0
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[广告处理] 第 ${attempt} 次尝试关闭弹窗...`);

    const result = await closeMaterialCenterPopups(page);
    totalResults.videoDialogClosed += result.videoDialogClosed ? 1 : 0;
    totalResults.migrationGuideSkipped += result.migrationGuideSkipped ? 1 : 0;
    totalResults.bottomNotificationClosed += result.bottomNotificationClosed ? 1 : 0;
    totalResults.totalClosed += result.totalClosed;

    // 如果没有找到弹窗，提前退出
    if (result.totalClosed === 0) {
      break;
    }

    // 等待一下，看看是否有新的弹窗出现
    await page.waitForTimeout(1000);
  }

  console.log(`[广告处理] 批量处理完成 - 总共关闭 ${totalResults.totalClosed} 个弹窗`);
  return totalResults;
}

module.exports = {
  closeMaterialCenterPopups,
  closeAllPopups
};