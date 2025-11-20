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

    // 步骤0：选择上架时间（放入仓库）
    ctx.logger.info('\n[步骤0] 选择上架时间 - 放入仓库');

    // 查找"放入仓库"单选按钮
    const warehouseSelectors = [
      'input[type="radio"][name="放入仓库"]',
      'input.next-radio-input[name="放入仓库"]',
      'label:has-text("放入仓库") input[type="radio"]',
      '//label[contains(text(), "放入仓库")]/..//input[@type="radio"]'
    ];

    let warehouseRadio = null;
    for (const selector of warehouseSelectors) {
      if (selector.startsWith('//')) {
        // XPath selector
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          warehouseRadio = elements[0];
          ctx.logger.info(`找到"放入仓库"选项 (XPath)`);
          break;
        }
      } else {
        warehouseRadio = await page.$(selector);
        if (warehouseRadio) {
          ctx.logger.info(`找到"放入仓库"选项: ${selector}`);
          break;
        }
      }
    }

    // 如果没找到，尝试通过文本查找
    if (!warehouseRadio) {
      // 尝试通过getByText查找并点击
      try {
        const warehouseOption = page.getByText('放入仓库', { exact: true });
        await warehouseOption.click();
        ctx.logger.info('✅ 通过文本定位选择了"放入仓库"');
      } catch (e) {
        // 如果还是找不到，尝试点击包含文本的父元素
        try {
          await page.locator('text=放入仓库').click();
          ctx.logger.info('✅ 通过locator选择了"放入仓库"');
        } catch (e2) {
          ctx.logger.warn('未找到"放入仓库"选项，继续执行...');
        }
      }
    } else {
      // 检查是否已经选中
      const isChecked = await warehouseRadio.isChecked();
      if (!isChecked) {
        await warehouseRadio.click();
        ctx.logger.info('✅ 已选择"放入仓库"');
      } else {
        ctx.logger.info('✅ "放入仓库"已经被选中');
      }
    }

    await page.waitForTimeout(1000);

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
      'button:has-text("提交宝贝信息")',  // 优先查找"提交宝贝信息"按钮
      'button.next-btn.next-btn-primary.next-large:has-text("提交宝贝信息")',
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

    // 步骤3：等待页面导航（使用Promise.race确保导航完成）
    ctx.logger.info('\n[步骤3] 等待页面导航');

    // 使用Promise.race等待页面导航，即使出现"context destroyed"也继续执行
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
        page.waitForLoadState('domcontentloaded')
      ]);
      ctx.logger.info('✅ 页面导航完成');
    } catch (navError) {
      // "Execution context was destroyed" 是正常现象，说明页面已跳转
      if (navError.message.includes('context was destroyed') ||
          navError.message.includes('navigation') ||
          navError.message.includes('Timeout')) {
        ctx.logger.info('页面已导航（检测到上下文变化或超时，这是正常的）');
      } else {
        ctx.logger.warn(`导航等待异常: ${navError.message}`);
      }
    }

    // 步骤4：检查提交结果（仅基于URL判断）
    ctx.logger.info('\n[步骤4] 检查提交结果');

    let submitResult = null;

    try {
      // 获取当前URL
      const currentUrl = page.url();
      ctx.logger.info(`当前页面URL: ${currentUrl}`);

      // 只要URL包含success或result，就认定提交成功
      if (currentUrl.includes('success') ||
          currentUrl.includes('result') ||
          currentUrl.includes('publish/success')) {

        ctx.logger.success('✅ 检测到成功页面URL，商品提交成功！');

        submitResult = {
          status: 'success',
          message: '商品提交成功，页面已跳转',
          productId: null  // 稍后获取
        };

        // 🔒 设置防重试标志：提交成功后，阻止阶段B重试
        ctx.disablePhaseBRetry = true;
        ctx.logger.info('🔒 已设置防重试标志，后续错误不会触发阶段B重试');

        // 🔒 立即保存成功状态到缓存，确保catch块能正确检测
        taskCache.submitResults = {
          status: 'success',
          message: '商品提交成功，页面已跳转',
          submitTime: new Date().toISOString()
        };
        saveTaskCache(productId, taskCache);
        ctx.logger.info('💾 成功状态已保存到缓存');

      } else {
        // URL不包含成功标识，记录但不抛错
        ctx.logger.warn(`⚠️ 页面URL未包含成功标识: ${currentUrl}`);
        submitResult = {
          status: 'unknown',
          message: `页面跳转到: ${currentUrl}，请手动检查`
        };
      }
    } catch (urlError) {
      // 获取URL失败也不抛错，记录失败原因
      ctx.logger.error(`获取页面URL失败: ${urlError.message}`);
      submitResult = {
        status: 'unknown',
        message: `无法获取页面URL: ${urlError.message}`
      };
    }

    // 步骤5：获取商品ID（如果提交成功）
    let taobaoProductId = null;
    if (submitResult.status === 'success') {
      ctx.logger.info('\n[步骤5] 获取商品ID');

      // 等待页面稳定
      try {
        await page.waitForTimeout(3000);
      } catch (waitError) {
        ctx.logger.warn(`等待页面稳定失败: ${waitError.message}`);
      }

      // 尝试从页面获取商品ID（使用try/catch，失败不影响流程）
      try {
        taobaoProductId = await page.evaluate(() => {
          // 从URL中提取商品ID（最可靠的方式）
          const urlMatch = window.location.href.match(/primaryId=(\d+)/);
          if (urlMatch) {
            return urlMatch[1];
          }

          // 备选方案：从页面元素获取
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

          return null;
        });

        if (taobaoProductId) {
          ctx.logger.success(`✅ 获取到商品ID: ${taobaoProductId}`);
        } else {
          ctx.logger.warn('⚠️ 未能从页面获取商品ID（不影响提交结果）');
        }
      } catch (evalError) {
        // 获取商品ID失败不影响整体流程
        ctx.logger.warn(`⚠️ 获取商品ID时出错: ${evalError.message}（不影响提交结果）`);
      }
    }

    // 步骤6：更新飞书状态为"已上传到淘宝"（移除截图步骤，直接更新状态）
    ctx.logger.info('\n[步骤6] 更新飞书状态');

    // 从 ctx 或 taskCache 中获取飞书记录ID
    const feishuRecordId = ctx.feishuRecordId || taskCache.feishuRecordId;

    if (feishuRecordId) {
      const doneValue = process.env.FEISHU_STATUS_DONE_VALUE || '已上传到淘宝';
      const errorValue = process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败';

      const updateFields = {
        [process.env.FEISHU_STATUS_FIELD || '上传状态']: submitResult.status === 'success' ? doneValue : errorValue
      };

      if (taobaoProductId) {
        updateFields[process.env.FEISHU_URL_FIELD || '商品链接'] = `https://item.taobao.com/item.htm?id=${taobaoProductId}`;
      }

      try {
        await feishuClient.updateRecord(feishuRecordId, updateFields);
        ctx.logger.success(`✅ 飞书状态已更新为"${doneValue}"`);
      } catch (updateError) {
        ctx.logger.error(`更新飞书状态失败: ${updateError.message}`);
      }
    } else {
      ctx.logger.warn('未找到飞书记录ID，跳过状态更新');
    }

    // 更新缓存
    taskCache.submitResults = {
      status: submitResult.status,
      message: submitResult.message,
      submitTime: new Date().toISOString()
      // taobaoProductId, taobaoUrl, screenshot 暂时不需要
    };

    // 标记步骤12（提交商品）为完成
    if (submitResult.status === 'success') {
      taskCache.stepStatus = taskCache.stepStatus || {};
      taskCache.stepStatus[12] = 'done';
    }

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n=== 商品提交完成 ===');
    ctx.logger.info(`提交状态: ${submitResult.status === 'success' ? '✅ 成功' : '⚠️ 未知'}`);
    ctx.logger.info(`提交信息: ${submitResult.message}`);

    // 只有明确失败时才抛错，成功或未知状态都不抛错
    // 这样避免了因为后续步骤失败（如获取商品ID失败）而触发重试
    if (submitResult.status === 'failed') {
      throw new Error(`商品提交失败: ${submitResult.message}`);
    } else if (submitResult.status === 'unknown') {
      ctx.logger.warn('⚠️ 提交结果未知，建议手动检查淘宝后台');
      // 不抛错，避免触发重试
    }

  } catch (error) {
    // 检查是否已经有submitResult，如果已经判定成功，则不再抛错
    const taskCache = loadTaskCache(ctx.productId);
    const hasSucceeded = taskCache?.submitResults?.status === 'success';

    if (hasSucceeded) {
      // 如果已经判定提交成功，即使后续步骤失败也不抛错
      ctx.logger.warn(`⚠️ 商品已提交成功，但后续步骤出错: ${error.message}`);
      ctx.logger.info('✅ 商品提交成功，忽略后续错误，避免重复提交');
      return; // 直接返回，不抛错
    }

    // 如果还没判定成功，说明是提交过程中的错误，需要抛出
    ctx.logger.error(`商品提交过程出错: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_STATUS_FIELD || '上传状态']: '发布失败',
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