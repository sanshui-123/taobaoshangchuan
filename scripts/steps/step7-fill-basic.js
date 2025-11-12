const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤7：填写货号和性别
 * 填写商品货号和选择适用性别
 */
const step7 = async (ctx) => {
  ctx.logger.info('开始填写货号和性别信息');

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

    // 步骤1：填写货号
    ctx.logger.info('\n[步骤1] 填写商品货号');
    ctx.logger.info(`商品ID: ${productId}`);

    // 货号选择器
    const skuSelectors = [
      '#sell-field-skuOuterId input',
      '[data-field="skuOuterId"] input',
      'input[placeholder*="货号"]',
      'input[name="skuOuterId"]',
      '.sku-field input'
    ];

    let skuInput = null;
    for (const selector of skuSelectors) {
      try {
        skuInput = await page.$(selector);
        if (skuInput) {
          ctx.logger.success(`✅ 找到货号输入框: ${selector}`);
          break;
        }
      } catch (e) {
        // 继续尝试
      }
    }

    if (skuInput) {
      // 清空并填写货号
      await skuInput.click(); // 聚焦
      await page.keyboard.press('Control+a'); // 全选
      await skuInput.fill(productId);
      ctx.logger.success(`✅ 货号已填写: ${productId}`);
      await page.waitForTimeout(500);
    } else {
      ctx.logger.warn('未找到货号输入框，货号填写跳过');
    }

    // 步骤2：选择性别
    ctx.logger.info('\n[步骤2] 选择适用性别');

    // 加载缓存获取商品信息
    const taskCache = loadTaskCache(productId);
    let gender = '男'; // 默认男

    // 从缓存中获取性别信息（如果有）
    if (taskCache.productData && taskCache.productData.gender) {
      gender = taskCache.productData.gender;
    } else {
      // 根据品牌或标题判断性别（简单逻辑）
      const title = taskCache.productData?.titleCN || '';
      const brand = taskCache.productData?.brand || '';
      const text = (title + brand).toLowerCase();

      if (text.includes('女') || text.includes('lady') || text.includes('woman') || text.includes('female')) {
        gender = '女';
      }
    }

    ctx.logger.info(`适用性别: ${gender}`);

    // 性别选择器
    const genderSelectors = [
      `input[type="radio"][value="${gender}"]`,
      `input[name="gender"][value="${gender}"]`,
      `.gender-radio:has-text("${gender}") input`,
      `[data-field="gender"] input[value="${gender}"]`,
      `label:has-text("${gender}") input`
    ];

    let genderSelected = false;

    // 策略1：直接通过radio按钮选择
    for (const selector of genderSelectors) {
      try {
        const genderRadio = await page.$(selector);
        if (genderRadio) {
          await genderRadio.check();
          genderSelected = true;
          ctx.logger.success(`✅ 性别已选择: ${gender}`);
          break;
        }
      } catch (e) {
        // 继续尝试
      }
    }

    // 策略2：通过标签点击
    if (!genderSelected) {
      const labelSelectors = [
        `label:has-text("${gender}")`,
        `.radio-label:has-text("${gender}")`,
        `div:has-text("${gender}") input[type="radio"]`
      ];

      for (const selector of labelSelectors) {
        try {
          const label = await page.$(selector);
          if (label) {
            await label.click();
            genderSelected = true;
            ctx.logger.success(`✅ 通过标签选择性别: ${gender}`);
            break;
          }
        } catch (e) {
          // 继续尝试
        }
      }
    }

    // 策略3：通过下拉框选择（如果有的话）
    if (!genderSelected) {
      try {
        const genderSelect = await page.$('.gender-select, [data-field="gender"] select');
        if (genderSelect) {
          await genderSelect.selectOption({ label: gender });
          genderSelected = true;
          ctx.logger.success(`✅ 通过下拉框选择性别: ${gender}`);
        }
      } catch (e) {
        // 继续尝试
      }
    }

    if (!genderSelected) {
      ctx.logger.warn('未找到性别选择选项，性别选择跳过');
    }

    // 步骤3：验证填写结果
    ctx.logger.info('\n[步骤3] 验证填写结果');

    // 验证货号
    let skuVerified = false;
    if (skuInput) {
      const skuValue = await skuInput.inputValue();
      if (skuValue === productId) {
        ctx.logger.success(`✅ 货号验证成功: ${skuValue}`);
        skuVerified = true;
      } else {
        ctx.logger.warn(`⚠️ 货号验证失败: 期望${productId}，实际${skuValue}`);
      }
    }

    // 验证性别
    let genderVerified = false;
    if (genderSelected) {
      try {
        const selectedRadio = await page.$(`input[type="radio"][value="${gender}"]:checked`);
        if (selectedRadio) {
          ctx.logger.success(`✅ 性别验证成功: ${gender}`);
          genderVerified = true;
        }
      } catch (e) {
        ctx.logger.warn('性别验证失败');
      }
    }

    // 步骤4：截图保存
    ctx.logger.info('\n[步骤4] 保存截图');
    const screenshotDir = process.env.TAOBAO_SCREENSHOT_DIR ||
      path.resolve(process.cwd(), 'screenshots');

    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const screenshotPath = path.join(
      screenshotDir,
      `${ctx.productId}_step7_basic.png`
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });
    ctx.logger.info(`截图已保存: ${screenshotPath}`);

    // 更新缓存
    taskCache.fillResults = {
      sku: {
        filled: skuVerified,
        value: productId,
        timestamp: new Date().toISOString()
      },
      gender: {
        filled: genderSelected,
        value: gender,
        verified: genderVerified,
        timestamp: new Date().toISOString()
      }
    };

    taskCache.stepStatus[7] = 'done';
    saveTaskCache(ctx.productId, taskCache);
    updateStepStatus(ctx.productId, 7, 'done');

    // 输出总结
    ctx.logger.success('\n=== 基本信息填写完成 ===');
    ctx.logger.info(`货号: ${skuVerified ? '✅' : '❌'} ${productId}`);
    ctx.logger.info(`性别: ${genderSelected ? '✅' : '❌'} ${gender}`);

  } catch (error) {
    ctx.logger.error(`基本信息填写失败: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `步骤7失败: ${error.message}`
        });
      } catch (updateError) {
        ctx.logger.error(`更新飞书错误日志失败: ${updateError.message}`);
      }
    }

    // 保存错误截图
    if (ctx.page1) {
      try {
        const errorScreenshot = path.join(
          path.resolve(process.cwd(), 'screenshots'),
          `${ctx.productId}_step7_error.png`
        );
        await ctx.page1.screenshot({ path: errorScreenshot, fullPage: true });
        ctx.logger.info(`错误截图: ${errorScreenshot}`);
      } catch (e) {
        // 忽略截图错误
      }
    }

    updateStepStatus(ctx.productId, 7, 'failed');
    throw error;

  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');
  }
};

module.exports = { step7 };