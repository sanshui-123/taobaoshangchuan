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
    ctx.logger.info('\n[步骤4] 等待提交结果和页面跳转');

    // 等待页面跳转或结果提示
    let submitResult = null;
    let maxWait = 30; // 最多等待30秒

    for (let i = 0; i < maxWait; i++) {
      // 首先检查页面URL是否跳转到成功页面
      const currentUrl = page.url();

      // 检查是否跳转到成功页面
      if (currentUrl.includes('success') || currentUrl.includes('result') ||
          currentUrl.includes('publish/success')) {
        ctx.logger.info(`检测到页面跳转: ${currentUrl}`);

        // 等待页面加载完成
        await page.waitForTimeout(2000);

        // 尝试获取成功页面的商品ID
        const productIdOnPage = await page.evaluate(() => {
          // 查找商品ID显示元素
          const idElements = document.querySelectorAll('*');
          for (const el of idElements) {
            const text = el.textContent || '';
            // 匹配商品ID格式（通常是一串数字）
            const match = text.match(/商品ID[：:\s]*(\d{10,})/);
            if (match) {
              return match[1];
            }
          }
          return null;
        });

        if (productIdOnPage) {
          ctx.logger.success(`✅ 商品发布成功！商品ID: ${productIdOnPage}`);
        }

        submitResult = {
          status: 'success',
          message: '商品提交成功，页面已跳转',
          productId: productIdOnPage
        };
        break;
      }

      // 检查页面中是否有"商品提交成功"的文字
      const successText = await page.evaluate(() => {
        const body = document.body ? document.body.innerText : '';
        return body.includes('商品提交成功') || body.includes('发布成功');
      });

      if (successText) {
        submitResult = {
          status: 'success',
          message: '检测到成功提示'
        };
        break;
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

      await page.waitForTimeout(1000);
    }

    if (!submitResult) {
      submitResult = {
        status: 'unknown',
        message: '提交结果未知，请手动检查'
      };
    }

    // 步骤5：处理成功页面（关闭或返回）
    if (submitResult.status === 'success') {
      ctx.logger.info('\n[步骤5] 处理成功页面');

      // 等待几秒让用户看到成功信息
      ctx.logger.info('等待3秒显示成功信息...');
      await page.waitForTimeout(3000);

      // 尝试关闭当前页面或返回到发布页面
      const currentUrl = page.url();

      if (currentUrl.includes('success') || currentUrl.includes('result')) {
        ctx.logger.info('准备关闭成功页面，返回到发布流程...');

        // 方法1：尝试点击"继续发布"按钮（如果存在）
        const continueButton = await page.$('button:has-text("继续发布"), a:has-text("继续发布")');
        if (continueButton) {
          await continueButton.click();
          ctx.logger.info('✅ 点击了"继续发布"按钮');
          await page.waitForTimeout(2000);
        } else {
          // 方法2：导航回发布页面
          const publishUrl = 'https://item.upload.taobao.com/sell/v2/publish.htm';
          ctx.logger.info(`导航回发布页面: ${publishUrl}`);
          await page.goto(publishUrl, { waitUntil: 'domcontentloaded' });
        }

        // 标记可以开始下一个循环
        ctx.readyForNextCycle = true;
        ctx.logger.success('✅ 已准备好开始下一个商品的发布流程');
      }
    }

    // 步骤5-7：获取商品ID、保存截图、更新飞书状态

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

    // 步骤7：更新飞书状态为"已上传"
    ctx.logger.info('\n[步骤7] 更新飞书状态');

    if (ctx.feishuRecordId) {
      const updateFields = {
        [process.env.FEISHU_STATUS_FIELD || '上传状态']: submitResult.status === 'success' ? '已上传' : '发布失败',
        [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: submitResult.message
      };

      if (taobaoProductId) {
        updateFields[process.env.FEISHU_URL_FIELD || '商品链接'] = `https://item.taobao.com/item.htm?id=${taobaoProductId}`;
        updateFields[process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID'] = taobaoProductId;
      }

      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, updateFields);
        ctx.logger.success('✅ 飞书状态已更新为"已上传"');
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

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n=== 商品提交完成 ===');
    ctx.logger.info(`提交状态: ${submitResult.status === 'success' ? '✅ 成功' : '❌ 失败'}`);
    ctx.logger.info(`提交信息: ${submitResult.message}`);

    if (submitResult.status !== 'success') {
      throw new Error(`商品提交失败: ${submitResult.message}`);
    }

  } catch (error) {
    ctx.logger.error(`商品提交失败: ${error.message}`);

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