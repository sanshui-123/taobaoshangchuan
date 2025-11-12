const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤8：填写颜色
 * 动态填写颜色名称，处理输入框遮挡和动态数量
 */
const step8 = async (ctx) => {
  ctx.logger.info('开始填写商品颜色');

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
    if (!taskCache.productData || !taskCache.productData.colors) {
      throw new Error('缓存中没有颜色信息');
    }

    const colors = taskCache.productData.colors;
    const colorCount = colors.length;
    ctx.logger.info(`商品颜色数量: ${colorCount}`);

    // 步骤1：定位颜色配置区域
    ctx.logger.info('\n[步骤1] 定位颜色配置区域');

    // 等待颜色区域加载
    await page.waitForSelector('.color-config-section, .sku-colors, [data-field="color"]', {
      timeout: 10000
    }).catch(() => {
      ctx.logger.warn('未找到颜色配置区域，尝试滚动页面');
      page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    });

    // 查找颜色添加按钮
    const addColorButton = await page.$('button:has-text("添加颜色")');
    if (addColorButton) {
      ctx.logger.info('找到添加颜色按钮');
    }

    // 步骤2：检查当前颜色数量
    ctx.logger.info('\n[步骤2] 检查当前颜色数量');

    const existingColors = await page.$$('[data-sku-type="color"], .color-item, .sku-item');
    const existingCount = existingColors.length;
    ctx.logger.info(`当前已有颜色数量: ${existingCount}`);

    // 步骤3：动态添加/删除颜色项
    ctx.logger.info('\n[步骤3] 调整颜色数量');

    // 如果颜色数量不足，添加新颜色
    while (existingColors.length < colorCount) {
      const addButton = await page.$('button:has-text("添加颜色"), .add-color-btn, .btn-add-sku');
      if (addButton) {
        await addButton.click();
        ctx.logger.info(`添加颜色 ${existingColors.length + 1}/${colorCount}`);
        await page.waitForTimeout(500);
        existingColors.push({}); // 占位
      } else {
        ctx.logger.warn('未找到添加颜色按钮');
        break;
      }
    }

    // 步骤4：填写每个颜色名称
    ctx.logger.info('\n[步骤4] 填写颜色名称');

    const colorResults = [];

    for (let i = 0; i < Math.min(colors.length, colorCount); i++) {
      const color = colors[i];
      const colorName = color.colorName || `颜色${i + 1}`;

      ctx.logger.info(`填写颜色 ${i + 1}: ${colorName}`);

      try {
        // 策略1：通过索引直接定位输入框
        let colorInput = await page.$(`input[data-sku-color-index="${i}"]`);

        if (!colorInput) {
          // 策略2：通过CSS选择器定位
          const selectors = [
            `[data-sku-type="color"] input`,
            `.color-item input`,
            `.sku-color-input`,
            `input[placeholder*="颜色"]`
          ];

          for (const selector of selectors) {
            const inputs = await page.$$(selector);
            if (inputs.length > i) {
              colorInput = inputs[i];
              break;
            }
          }
        }

        if (!colorInput) {
          // 策略3：通过文本定位
          const colorLabel = await page.$(`:has-text("颜色${i + 1}")`);
          if (colorLabel) {
            const parent = colorLabel.locator('..');
            colorInput = await parent.$('input');
          }
        }

        if (colorInput) {
          // 处理可能被遮挡的情况
          await handleOccludedInput(page, colorInput);

          // 填写颜色名称
          await colorInput.click();
          await page.keyboard.press('Control+a');
          await colorInput.fill(colorName);

          // 验证填写结果
          const filledValue = await colorInput.inputValue();
          if (filledValue === colorName) {
            ctx.logger.success(`  ✓ 颜色已填写: ${colorName}`);
            colorResults.push({
              index: i,
              colorName: colorName,
              success: true
            });
          } else {
            ctx.logger.warn(`  ⚠️ 颜色填写不匹配: 期望"${colorName}"，实际"${filledValue}"`);
            colorResults.push({
              index: i,
              colorName: colorName,
              success: false,
              actual: filledValue
            });
          }
        } else {
          ctx.logger.warn(`  ❌ 未找到颜色${i + 1}输入框`);
          colorResults.push({
            index: i,
            colorName: colorName,
            success: false,
            error: '未找到输入框'
          });
        }

        await page.waitForTimeout(300);
      } catch (error) {
        ctx.logger.error(`  ❌ 填写颜色${i + 1}失败: ${error.message}`);
        colorResults.push({
          index: i,
          colorName: colorName,
          success: false,
          error: error.message
        });
      }
    }

    // 更新缓存
    taskCache.colorResults = {
      configuredCount: colorResults.length,
      successCount: colorResults.filter(r => r.success).length,
      colors: colorResults,
      timestamp: new Date().toISOString()
    };

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n=== 颜色配置完成 ===');
    ctx.logger.info(`配置颜色数: ${colorResults.length}/${colors.length}`);
    ctx.logger.info(`成功填写: ${colorResults.filter(r => r.success).length}`);

    if (colorResults.some(r => !r.success)) {
      ctx.logger.warn('失败的颜色:');
      colorResults.filter(r => !r.success).forEach(r => {
        ctx.logger.warn(`  - ${r.colorName}: ${r.error || r.actual}`);
      });
    }

  } catch (error) {
    ctx.logger.error(`颜色配置失败: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `步骤8失败: ${error.message}`
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
 * 处理被遮挡的输入框
 */
async function handleOccludedInput(page, input) {
  try {
    // 检查元素是否可见
    const isVisible = await input.isVisible();
    if (!isVisible) {
      // 尝试滚动到元素位置
      await input.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }

    // 检查是否被其他元素遮挡
    const isOccluded = await page.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      const topElement = document.elementFromPoint(center.x, center.y);
      return topElement !== element && !element.contains(topElement);
    }, input);

    if (isOccluded) {
      // 尝试点击页面其他位置以关闭可能的弹窗
      await page.click('body', { position: { x: 0, y: 0 } });
      await page.waitForTimeout(500);

      // 再次尝试滚动
      await input.scrollIntoViewIfNeeded();

      // 如果仍然遮挡，使用JavaScript直接设置值
      const isStillOccluded = await page.evaluate((element, value) => {
        const rect = element.getBoundingClientRect();
        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
        const topElement = document.elementFromPoint(center.x, center.y);

        if (topElement !== element && !element.contains(topElement)) {
          // 强制设置值
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, input, await input.inputValue());
    }
  } catch (error) {
    // 如果处理失败，继续执行
    ctx.logger.warn(`处理遮挡元素时出错: ${error.message}`);
  }
}

module.exports = { step8 };