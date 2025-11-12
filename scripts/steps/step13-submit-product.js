const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤13：提交商品
 * 执行最终提交，处理验证和结果获取
 */
const step13 = async (ctx) => {
  ctx.logger.info('开始提交商品');

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

    // 加载缓存获取任务信息
    const taskCache = loadTaskCache(productId);
    if (!taskCache) {
      throw new Error('未找到任务缓存');
    }

    // 步骤1：提交前验证
    ctx.logger.info('\n[步骤1] 提交前验证');

    // 检查所有必填项是否完成
    const requiredSteps = [6, 7, 8, 9, 10, 12]; // 品牌、货号、颜色、尺码、价格、详情
    const incompleteSteps = requiredSteps.filter(step => {
      const cache = loadTaskCache(productId);
      return cache.stepStatus[step] !== 'done';
    });

    if (incompleteSteps.length > 0) {
      ctx.logger.warn(`以下步骤未完成: ${incompleteSteps.join(', ')}`);
      ctx.logger.warn('建议先完成所有必填步骤再提交');
    }

    // 检查页面是否有错误提示
    const errorMessages = await page.$$('.error-message, .field-error, .validation-error');
    const pageErrors = [];

    for (const error of errorMessages) {
      const errorText = await error.textContent();
      if (errorText && errorText.trim()) {
        pageErrors.push(errorText.trim());
      }
    }

    if (pageErrors.length > 0) {
      ctx.logger.error('发现页面错误:');
      pageErrors.forEach(error => ctx.logger.error(`  - ${error}`));
      throw new Error(`页面存在${pageErrors.length}个错误，请修正后重试`);
    }

    ctx.logger.success('✅ 页面验证通过');

    // 步骤2：执行提交
    ctx.logger.info('\n[步骤2] 执行商品提交');

    // 查找提交按钮
    const submitSelectors = [
      'button:has-text("立即发布")',
      'button:has-text("发布商品")',
      'button:has-text("提交")',
      '.submit-btn',
      '.publish-btn',
      'button[type="submit"]',
      '.btn-publish'
    ];

    let submitButton = null;
    for (const selector of submitSelectors) {
      submitButton = await page.$(selector);
      if (submitButton) {
        ctx.logger.info(`找到提交按钮: ${selector}`);
        break;
      }
    }

    if (!submitButton) {
      throw new Error('未找到提交按钮，可能页面还未完全加载');
    }

    // 检查按钮是否可用
    const isDisabled = await submitButton.isDisabled();
    if (isDisabled) {
      throw new Error('提交按钮不可用，可能还有必填项未完成');
    }

    // 滚动到按钮位置
    await submitButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    // 点击提交按钮
    ctx.logger.info('点击提交按钮...');
    await submitButton.click();

    // 步骤3：处理提交确认
    ctx.logger.info('\n[步骤3] 处理提交确认');

    // 等待可能的确认弹窗
    await page.waitForTimeout(2000);

    // 查找确认弹窗
    const confirmDialog = await page.$('.confirm-dialog, .modal, .popup');
    if (confirmDialog) {
      ctx.logger.info('检测到确认弹窗');

      // 查找确认按钮
      const confirmButton = await page.$('button:has-text("确定"), button:has-text("确认"), .confirm-btn');
      if (confirmButton) {
        await confirmButton.click();
        ctx.logger.info('✅ 已确认提交');
        await page.waitForTimeout(2000);
      }
    }

    // 步骤4：等待提交结果
    ctx.logger.info('\n[步骤4] 等待提交结果');

    // 等待页面跳转或结果提示
    let submitResult = null;
    let maxWait = 30; // 最多等待30秒

    for (let i = 0; i < maxWait; i++) {
      // 检查是否有成功提示
      const successMessage = await page.$('.success-message, .toast-success, [class*="success"]');
      if (successMessage) {
        const messageText = await successMessage.textContent();
        if (messageText && messageText.includes('成功')) {
          submitResult = {
            status: 'success',
            message: messageText.trim()
          };
          break;
        }
      }

      // 检查是否有失败提示
      const errorMessage = await page.$('.error-message, .toast-error, [class*="error"]');
      if (errorMessage) {
        const messageText = await errorMessage.textContent();
        if (messageText && (messageText.includes('失败') || messageText.includes('错误'))) {
          submitResult = {
            status: 'failed',
            message: messageText.trim()
          };
          break;
        }
      }

      // 检查页面URL是否跳转
      const currentUrl = page.url();
      if (currentUrl.includes('success') || currentUrl.includes('result')) {
        submitResult = {
          status: 'success',
          message: '页面已跳转到结果页'
        };
        break;
      }

      await page.waitForTimeout(1000);
    }

    if (!submitResult) {
      submitResult = {
        status: 'unknown',
        message: '提交结果未知，请手动检查'
      };
    }

    // 步骤5：获取商品ID（如果提交成功）
    let taobaoProductId = null;
    if (submitResult.status === 'success') {
      ctx.logger.info('\n[步骤5] 获取商品ID');

      // 尝试从页面获取商品ID
      taobaoProductId = await page.evaluate(() => {
        // 常见的商品ID显示位置
        const selectors = [
          '[data-product-id]',
          '.product-id',
          '.item-id',
          '[data-item-id]'
        ];

        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            return element.textContent || element.getAttribute('data-product-id') || element.getAttribute('data-item-id');
          }
        }

        // 从URL中提取
        const urlMatch = window.location.href.match(/item\.htm\?id=(\d+)/);
        if (urlMatch) {
          return urlMatch[1];
        }

        return null;
      });

      if (taobaoProductId) {
        ctx.logger.success(`✅ 获取到商品ID: ${taobaoProductId}`);
      } else {
        ctx.logger.warn('未能获取商品ID');
      }
    }

    // 步骤6：保存提交截图
    ctx.logger.info('\n[步骤6] 保存提交截图');
    const screenshotDir = path.resolve(process.cwd(), 'screenshots');

    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const screenshotPath = path.join(
      screenshotDir,
      `${productId}_step13_submit.png`
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });
    ctx.logger.info(`截图已保存: ${screenshotPath}`);

    // 步骤7：更新飞书状态
    ctx.logger.info('\n[步骤7] 更新飞书状态');

    if (ctx.feishuRecordId) {
      const updateFields = {
        [process.env.FEISHU_STATUS_FIELD || 'status']: submitResult.status === 'success' ? '已发布' : '发布失败',
        [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: submitResult.message
      };

      if (taobaoProductId) {
        updateFields[process.env.FEISHU_URL_FIELD || 'taobao_url'] = `https://item.taobao.com/item.htm?id=${taobaoProductId}`;
        updateFields[process.env.FEISHU_PRODUCT_ID_FIELD || 'product_id'] = taobaoProductId;
      }

      await feishuClient.updateRecord(ctx.feishuRecordId, updateFields);
      ctx.logger.info('✅ 飞书状态已更新');
    }

    // 更新缓存
    taskCache.submitResults = {
      status: submitResult.status,
      message: submitResult.message,
      taobaoProductId: taobaoProductId,
      taobaoUrl: taobaoProductId ? `https://item.taobao.com/item.htm?id=${taobaoProductId}` : null,
      submitTime: new Date().toISOString(),
      screenshot: screenshotPath
    };

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n=== 商品提交完成 ===');
    ctx.logger.info(`提交状态: ${submitResult.status === 'success' ? '✅ 成功' : '❌ 失败'}`);
    ctx.logger.info(`提交信息: ${submitResult.message}`);

    if (taobaoProductId) {
      ctx.logger.info(`淘宝商品ID: ${taobaoProductId}`);
      ctx.logger.info(`商品链接: https://item.taobao.com/item.htm?id=${taobaoProductId}`);
    }

    if (submitResult.status !== 'success') {
      throw new Error(`商品提交失败: ${submitResult.message}`);
    }

  } catch (error) {
    ctx.logger.error(`商品提交失败: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_STATUS_FIELD || 'status']: '发布失败',
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `步骤13失败: ${error.message}`
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

module.exports = { step13 };