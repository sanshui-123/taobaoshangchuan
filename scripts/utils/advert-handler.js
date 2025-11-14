/**
 * 素材库广告弹窗处理模块
 * 用于处理素材库页面的各种广告弹窗，确保主流程不受干扰
 */

// 检查是否启用详细模式
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

/**
 * 详细日志函数
 * @param {string} message
 * @param {any} data
 */
function logVerbose(message, data = null) {
  if (VERBOSE) {
    if (data) {
      console.log(`[广告-详细] ${message}`, data);
    } else {
      console.log(`[广告-详细] ${message}`);
    }
  }
}

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
  logVerbose('当前页面 URL:', page.url());
  logVerbose('页面标题:', await page.title().catch(() => 'N/A'));

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
    logVerbose('异常堆栈:', error.stack);
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
    logVerbose('开始搜索视频弹窗元素...');

    // 等待一下让弹窗可能加载完成
    await page.waitForTimeout(1000);

    // 检查页面上是否有任何对话框
    const allDialogs = await page.$$('.next-dialog, .next-dialog-body');
    logVerbose('找到的对话框数量:', allDialogs.length);

    // 检查页面上是否有视频元素
    const videoElements = await page.$$('.next-video, video');
    logVerbose('找到的视频元素数量:', videoElements.length);

    // 查找视频弹窗对话框
    logVerbose('查找主要视频弹窗选择器: .next-dialog-body:has(.next-video)');
    const videoDialog = await page.$('.next-dialog-body:has(.next-video)');
    if (videoDialog) {
      ctx.logger.info('发现视频弹窗');
      logVerbose('视频弹窗元素已找到');

      // 查找关闭按钮 - 右上角的X图标
      logVerbose('查找关闭按钮: .next-icon-close, .next-dialog-close');
      const closeButton = await videoDialog.$('.next-icon-close, .next-dialog-close');
      if (closeButton) {
        logVerbose('找到关闭按钮，准备点击...');
        await closeButton.click();
        await page.waitForTimeout(500); // 等待弹窗关闭动画

        results.videoDialogClosed = true;
        results.totalClosed++;
        ctx.logger.success('已关闭视频弹窗广告');
        logVerbose('视频弹窗关闭成功');
        return;
      } else {
        logVerbose('未找到主关闭按钮，尝试备用方案...');
      }

      // 备用方案：通过文本内容查找关闭按钮
      logVerbose('备用方案: 查找 .next-dialog-header:has-text("视频") .next-icon-close');
      const closeByTitle = await page.$('.next-dialog-header:has-text("视频") .next-icon-close');
      if (closeByTitle) {
        logVerbose('通过标题找到关闭按钮，准备点击...');
        await closeByTitle.click();
        await page.waitForTimeout(500);

        results.videoDialogClosed = true;
        results.totalClosed++;
        ctx.logger.success('已关闭视频弹窗广告（通过标题）');
        logVerbose('通过标题关闭视频弹窗成功');
        return;
      }

      // 第三种方案：直接点击关闭按钮的位置
      logVerbose('第三种方案: 点击 .next-dialog:has(.next-video) .next-icon-close');
      try {
        await page.click('.next-dialog:has(.next-video) .next-icon-close');
        await page.waitForTimeout(500);

        results.videoDialogClosed = true;
        results.totalClosed++;
        ctx.logger.success('已关闭视频弹窗广告（通用方案）');
        logVerbose('通用方案关闭视频弹窗成功');
        return;
      } catch (clickError) {
        logVerbose('通用方案点击失败:', clickError.message);
      }
    } else {
      logVerbose('未找到主要视频弹窗选择器，尝试更广泛的搜索...');

      // 尝试查找任何包含视频的对话框
      const anyVideoDialog = await page.$('.next-dialog:has(video), .next-dialog-body:has(video)');
      if (anyVideoDialog) {
        logVerbose('找到包含视频元素的对话框');
      } else {
        logVerbose('确实没有视频弹窗');
      }

      ctx.logger.info('未发现视频弹窗广告');
    }

  } catch (error) {
    ctx.logger.info('未发现视频弹窗广告或关闭失败');
    logVerbose('视频弹窗处理异常:', error.message);
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
    logVerbose('开始搜索迁移引导弹窗元素...');

    // 查找"跳过"按钮 - 根据截图中的类名
    logVerbose('查找跳过按钮: .Intro_cardSkip');
    const skipButton = await page.$('.Intro_cardSkip');
    if (skipButton) {
      ctx.logger.info('发现迁移引导弹窗');
      logVerbose('找到 .Intro_cardSkip 按钮，准备点击...');

      await skipButton.click();
      await page.waitForTimeout(500);

      results.migrationGuideSkipped = true;
      results.totalClosed++;
      ctx.logger.success('已点击跳过迁移引导弹窗');
      logVerbose('迁移引导弹窗跳过成功');
      return;
    } else {
      logVerbose('未找到 .Intro_cardSkip 按钮');
    }

    // 备用方案：通过文本内容查找跳过按钮
    logVerbose('备用方案: 查找 button:has-text("跳过")');
    const skipByText = await page.$('button:has-text("跳过")');
    if (skipByText) {
      logVerbose('找到包含"跳过"文本的按钮，准备点击...');
      await skipByText.click();
      await page.waitForTimeout(500);

      results.migrationGuideSkipped = true;
      results.totalClosed++;
      ctx.logger.success('已点击跳过按钮（文本方案）');
      logVerbose('通过文本跳过迁移引导弹窗成功');
      return;
    } else {
      logVerbose('未找到包含"跳过"文本的按钮');
    }

    // 第三种方案：查找包含"已迁移至"文本的弹窗
    logVerbose('第三种方案: 查找包含"已迁移至"文本的弹窗');
    const migrationDialog = await page.$('div:has-text("已迁移至")');
    if (migrationDialog) {
      logVerbose('找到包含"已迁移至"文本的弹窗');
      const skipBtn = await migrationDialog.$('button');
      if (skipBtn) {
        logVerbose('找到弹窗中的按钮，准备点击...');
        await skipBtn.click();
        await page.waitForTimeout(500);

        results.migrationGuideSkipped = true;
        results.totalClosed++;
        ctx.logger.success('已关闭迁移引导弹窗（内容方案）');
        logVerbose('通过内容关闭迁移引导弹窗成功');
        return;
      } else {
        logVerbose('在迁移弹窗中未找到按钮');
      }
    } else {
      logVerbose('未找到包含"已迁移至"文本的元素');
    }

    // 额外检查：查找任何可能的跳过按钮
    logVerbose('额外检查: 查找所有可能的跳过按钮');
    const allSkipButtons = await page.$$('button, .skip, .btn-skip');
    logVerbose('找到的所有按钮数量:', allSkipButtons.length);

    for (let i = 0; i < allSkipButtons.length; i++) {
      const btn = allSkipButtons[i];
      const text = await btn.textContent().catch(() => '');
      logVerbose(`按钮 ${i + 1} 文本: "${text}"`);
      if (text && text.includes('跳过')) {
        logVerbose('找到包含跳过的按钮，尝试点击...');
        await btn.click();
        await page.waitForTimeout(500);
        results.migrationGuideSkipped = true;
        results.totalClosed++;
        ctx.logger.success('已点击跳过按钮（遍历方案）');
        logVerbose('通过遍历跳过迁移引导弹窗成功');
        return;
      }
    }

    ctx.logger.info('未发现迁移引导弹窗');

  } catch (error) {
    ctx.logger.info('未发现迁移引导弹窗或关闭失败');
    logVerbose('迁移引导弹窗处理异常:', error.message);
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
    logVerbose('开始搜索右下角通知弹窗元素...');

    // 查找通知弹窗容器
    logVerbose('查找通知弹窗容器: .notify_body, .notification-body, .message-popup');
    const notification = await page.$('.notify_body, .notification-body, .message-popup');
    if (notification) {
      ctx.logger.info('发现右下角通知弹窗');
      logVerbose('找到通知弹窗容器');

      // 查找关闭图标
      logVerbose('查找关闭图标: .next-icon-close, .close-icon, .notification-close');
      const closeIcon = await notification.$('.next-icon-close, .close-icon, .notification-close');
      if (closeIcon) {
        logVerbose('找到关闭图标，准备点击...');
        await closeIcon.click();
        await page.waitForTimeout(500);

        results.bottomNotificationClosed = true;
        results.totalClosed++;
        ctx.logger.success('已关闭右下角通知弹窗');
        logVerbose('右下角通知弹窗关闭成功');
        return;
      } else {
        logVerbose('未找到主关闭图标，尝试备用方案...');
      }

      // 备用方案：查找通用关闭按钮
      logVerbose('备用方案: 查找通用关闭按钮 button[aria-label*="关闭"], button[title*="关闭"]');
      const closeBtn = await notification.$('button[aria-label*="关闭"], button[title*="关闭"]');
      if (closeBtn) {
        logVerbose('找到 aria-label 关闭按钮，准备点击...');
        await closeBtn.click();
        await page.waitForTimeout(500);

        results.bottomNotificationClosed = true;
        results.totalClosed++;
        ctx.logger.success('已关闭通知弹窗（aria-label方案）');
        logVerbose('通过 aria-label 关闭通知弹窗成功');
        return;
      } else {
        logVerbose('未找到 aria-label 关闭按钮');
      }

      // 第三种方案：直接点击通知的关闭区域
      logVerbose('第三种方案: 点击 .next-icon');
      try {
        await notification.click('.next-icon');
        await page.waitForTimeout(500);

        results.bottomNotificationClosed = true;
        results.totalClosed++;
        ctx.logger.success('已关闭通知弹窗（通用方案）');
        logVerbose('通过通用方案关闭通知弹窗成功');
        return;
      } catch (clickError) {
        logVerbose('通用方案点击失败:', clickError.message);
      }
    } else {
      logVerbose('未找到主要通知弹窗选择器');
    }

    // 备用方案：通过"重要消息"文本查找 - 强化版本
    logVerbose('备用方案: 严格查找并关闭重要消息弹窗');

    // 方法1: 根据截图精确查找 notify_body__vpaId 弹窗并直接点击关闭按钮
    const notifyBodies = await page.$$('div.notify_body__vpaId, div[class*="notify_body"]');
    logVerbose(`找到 ${notifyBodies.length} 个 notify_body 类元素`);

    for (let i = 0; i < notifyBodies.length; i++) {
      const notifyBody = notifyBodies[i];
      const isVisible = await notifyBody.isVisible().catch(() => false);
      const textContent = await notifyBody.textContent().catch(() => '');

      logVerbose(`notify_body ${i + 1}: 可见=${isVisible}, 文本前100字符="${textContent.substring(0, 100)}"`);
      logVerbose(`notify_body ${i + 1} className: "${await notifyBody.getAttribute('class').catch(() => 'N/A')}"`);

      if (isVisible && textContent.includes('重要消息')) {
        logVerbose(`✅ 找到包含"重要消息"的弹窗，开始处理关闭按钮`);

        try {
          logVerbose(`🎯 直接定位关闭按钮: i.next-icon-close_blod`);

          // 保存点击前的状态
          const beforeClick = Date.now();

          // 使用 locator 和 force: true 强制点击关闭按钮（根据实际调试发现的选择器）
          await notifyBody.locator('i.next-icon-close_blod').click({ force: true });
          logVerbose(`🖱️ 已强制点击关闭按钮`);

          // 等待弹窗消失
          logVerbose('⏳ 等待弹窗消失...');
          try {
            // 使用正确的方式等待元素消失
            await page.waitForSelector('div.notify_body__vpaId:has-text("重要消息")', { state: 'detached', timeout: 5000 });
            logVerbose(`✅ 弹窗已成功消失，耗时 ${Date.now() - beforeClick}ms`);

            results.bottomNotificationClosed = true;
            results.totalClosed++;
            ctx.logger.success('🎯 已精准关闭重要消息弹窗（next-icon-close 按钮）');
            logVerbose('🎉 重要消息弹窗精准关闭成功！');
            return;
          } catch (waitError) {
            logVerbose(`弹窗消失等待超时: ${waitError.message}`);

            // 备用方案：检查元素是否还可见
            const stillVisible = await notifyBody.isVisible().catch(() => false);
            if (!stillVisible) {
              logVerbose('✅ 弹窗已不可见，认为关闭成功');
              results.bottomNotificationClosed = true;
              results.totalClosed++;
              ctx.logger.success('已关闭重要消息弹窗（备用验证）');
              return;
            } else {
              logVerbose('❌ 弹窗仍然可见，继续尝试其他方法');
            }
          }
        } catch (clickError) {
          logVerbose(`❌ 精准点击关闭按钮失败: ${clickError.message}`);

          // 如果精准点击失败，尝试通用的 force click 方法
          logVerbose('🔄 尝试备用强制点击方法...');
          try {
            await page.evaluate((popup) => {
              const closeBtn = popup.querySelector('i.next-icon-close_blod');
              if (closeBtn) {
                closeBtn.click();
                return true;
              }
              return false;
            }, notifyBody);

            await page.waitForTimeout(1000);
            logVerbose('🖱️ 已执行备用点击方法');

            // 检查弹窗是否消失
            const stillExists = await page.$('div.notify_body__vpaId:has-text("重要消息")').then(el => !!el).catch(() => false);
            if (!stillExists) {
              logVerbose('✅ 备用方法成功关闭弹窗');
              results.bottomNotificationClosed = true;
              results.totalClosed++;
              ctx.logger.success('已关闭重要消息弹窗（备用方法）');
              return;
            }
          } catch (backupError) {
            logVerbose(`❌ 备用方法也失败: ${backupError.message}`);
          }
        }

        // 如果主要方法都失败，继续尝试其他弹窗
        logVerbose('当前弹窗处理失败，继续检查其他弹窗...');
      }
    }

    // 方法2: 如果上面的方法失败，使用原来的查找方式但加强处理
    logVerbose('备用方案: 使用原始查找方式但加强处理');
    const importantMessage = await page.$('div:has-text("重要消息")');
    if (importantMessage) {
      logVerbose('找到包含"重要消息"文本的弹窗元素');

      // 获取元素的详细信息
      const elementInfo = await importantMessage.evaluate(el => ({
        tagName: el.tagName,
        className: el.className,
        id: el.id,
        innerHTML: el.innerHTML.substring(0, 200),
        isVisible: el.offsetParent !== null
      })).catch(() => ({ error: '无法获取元素信息' }));

      logVerbose('重要消息弹窗详细信息:', elementInfo);

      // 查找所有可能的关闭按钮
      const allCloseButtons = await importantMessage.$$('button, .next-icon-close, .close, [role="button"]');
      logVerbose(`在弹窗中找到 ${allCloseButtons.length} 个可能的按钮元素`);

      for (let i = 0; i < allCloseButtons.length; i++) {
        const btn = allCloseButtons[i];
        const btnText = await btn.textContent().catch(() => '');
        const btnClass = await btn.getAttribute('class').catch(() => '');
        const btnVisible = await btn.isVisible().catch(() => false);

        logVerbose(`按钮 ${i + 1}: text="${btnText}", class="${btnClass}", visible=${btnVisible}`);

        // 更宽松的条件：包含 close 类名的按钮都尝试，即使不可见
        if (btnClass.includes('close') || btnClass.includes('icon') || btnText.includes('关闭') || btnText.includes('知道') || btnText.includes('确定')) {
          logVerbose(`尝试点击按钮 ${i + 1}: text="${btnText}", class="${btnClass}", visible=${btnVisible}`);

          try {
            const beforeClick = Date.now();

            // 如果按钮不可见，尝试强制显示
            if (!btnVisible && btnClass.includes('close')) {
              logVerbose(`按钮不可见，尝试强制显示并点击...`);
              await page.evaluate((btn) => {
                if (btn) {
                  btn.style.visibility = 'visible';
                  btn.style.display = 'block';
                  btn.style.opacity = '1';
                  btn.style.zIndex = '9999';
                }
              }, btn);
              await page.waitForTimeout(500);
            }

            await btn.click();

            // 等待弹窗消失 - 修复API使用
            logVerbose('等待重要消息弹窗消失...');
            try {
              // 使用正确的方式等待元素消失
              await page.waitForSelector('div:has-text("重要消息")', { state: 'detached', timeout: 3000 });
              logVerbose(`✅ 重要消息弹窗已消失，耗时 ${Date.now() - beforeClick}ms`);

              results.bottomNotificationClosed = true;
              results.totalClosed++;
              ctx.logger.success('已关闭重要消息弹窗（增强方式）');
              logVerbose('重要消息弹窗增强关闭成功');
              return;
            } catch (waitError) {
              logVerbose(`弹窗消失等待失败: ${waitError.message}`);

              // 检查是否真的消失了
              const stillExists = await page.$('div:has-text("重要消息")').then(el => !!el).catch(() => false);
              if (!stillExists) {
                logVerbose('✅ 弹窗已从页面中消失');
                results.bottomNotificationClosed = true;
                results.totalClosed++;
                ctx.logger.success('已关闭重要消息弹窗（验证方式）');
                return;
              }
            }
          } catch (clickError) {
            logVerbose(`点击按钮 ${i + 1} 失败: ${clickError.message}`);
            continue;
          }
        }
      }

      // 如果所有关闭按钮都失败，尝试强制点击弹窗外区域或按ESC键
      logVerbose('所有关闭按钮都失败，尝试备用方案...');
      try {
        // 尝试按ESC键关闭
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);

        const stillExists = await page.$('div:has-text("重要消息")').then(el => !!el).catch(() => false);
        if (!stillExists) {
          logVerbose('✅ ESC键成功关闭弹窗');
          results.bottomNotificationClosed = true;
          results.totalClosed++;
          ctx.logger.success('已通过ESC键关闭重要消息弹窗');
          return;
        }
      } catch (escError) {
        logVerbose(`ESC键关闭失败: ${escError.message}`);
      }
    } else {
      logVerbose('未找到包含"重要消息"文本的元素');
    }

    // 额外检查：查找页面上的所有通知相关元素
    logVerbose('额外检查: 查找所有通知相关元素');
    const allNotifications = await page.$$('.notification, .notify, .alert, .message, .popup');
    logVerbose('找到的通知相关元素数量:', allNotifications.length);

    // 检查是否有任何可能的底部弹窗
    const bottomElements = await page.$$('div[style*="position: fixed"], div[style*="bottom"]');
    logVerbose('找到的固定定位元素数量:', bottomElements.length);

    for (let i = 0; i < Math.min(5, bottomElements.length); i++) {
      const elem = bottomElements[i];
      const isVisible = await elem.isVisible().catch(() => false);
      if (isVisible) {
        const text = await elem.textContent().catch(() => '');
        logVerbose(`底部元素 ${i + 1} 可见，文本前50字符: "${text.substring(0, 50)}"`);
      }
    }

    ctx.logger.info('未发现右下角通知弹窗');

  } catch (error) {
    ctx.logger.info('未发现右下角通知弹窗或关闭失败');
    logVerbose('右下角通知弹窗处理异常:', error.message);
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