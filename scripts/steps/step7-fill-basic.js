const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');

/**
 * 步骤7：填写商品编码和基础信息
 * 1. 销售信息 → 商家编码
 * 2. 基础信息 → 货号
 */

const step7 = async (ctx) => {
  ctx.logger.info('开始填写商品编码和基础信息（商家编码+货号）');

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
    const taskCache = loadTaskCache(productId);
    const brandKey = ((taskCache?.productData?.brand) || '').trim().toLowerCase();
    const isMoveSportBrand = brandKey.includes('movesport');
    const isMasterBunnyBrand = brandKey.includes('master') && brandKey.includes('bunny');

    ctx.logger.info(`商品ID: ${productId}`);

    // ============================================
    // 步骤1：填写"商家编码"（直接定位，不切换tab）
    // ============================================
    ctx.logger.info('\n[步骤1] 填写商家编码');

    // 使用精确定位：优先使用ID选择器（最稳定）
    ctx.logger.info('  定位商家编码输入框...');

    let merchantCodeInput;

    // 方法1：使用ID选择器（最稳定，优先使用）
    try {
      merchantCodeInput = page.locator('#sell-field-outerId input').first();
      ctx.logger.info('  尝试方法1: #sell-field-outerId input (ID选择器)');
      await merchantCodeInput.waitFor({ state: 'attached', timeout: 5000 });
      ctx.logger.success('  ✅ 方法1成功');
    } catch (e) {
      ctx.logger.info(`  方法1失败: ${e.message}`);

      // 方法2：使用包含文本的div定位（fallback）
      try {
        merchantCodeInput = page.locator('div:has-text("商家编码") .next-input input').first();
        ctx.logger.info('  尝试方法2: div:has-text("商家编码") .next-input input');
        await merchantCodeInput.waitFor({ state: 'attached', timeout: 3000 });
        ctx.logger.success('  ✅ 方法2成功');
      } catch (e2) {
        throw new Error(`❌ 无法定位商家编码输入框: ${e.message} | ${e2.message}`);
      }
    }

    // 滚动到视口
    ctx.logger.info('  滚动到商家编码字段...');
    await merchantCodeInput.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // 等待可见和可编辑
    ctx.logger.info('  等待商家编码输入框可见...');
    await merchantCodeInput.waitFor({ state: 'visible', timeout: 8000 });

    const merchantCodeEditable = await merchantCodeInput.isEditable();
    ctx.logger.info(`  商家编码输入框可编辑状态: ${merchantCodeEditable}`);

    if (!merchantCodeEditable) {
      throw new Error('❌ 商家编码输入框不可编辑');
    }

    // 填写商家编码（fill方法会自动清空旧值）
    ctx.logger.info(`  ⚙️ [销售信息] 商家编码 → ${productId}`);
    await merchantCodeInput.click();  // 先点击获得焦点
    await page.waitForTimeout(150);
    await merchantCodeInput.fill(productId);  // fill会自动清空并填入
    await page.waitForTimeout(200);  // 等待值生效

    // 验证填写结果
    const merchantCodeValue = await merchantCodeInput.inputValue();
    if (merchantCodeValue === productId) {
      ctx.logger.success(`✅ 商家编码验证成功: ${merchantCodeValue}`);
    } else {
      throw new Error(`❌ 商家编码填写失败: 期望"${productId}"，实际"${merchantCodeValue}"`);
    }

    // ============================================
    // 步骤2：填写"货号"（直接定位，不切换tab）
    // ============================================
    ctx.logger.info('\n[步骤2] 填写货号');

    // 预处理：检查并展开"展开补充更多信息"（高尔夫服装模板可能隐藏货号字段）
    try {
      const expandButtonSelectors = [
        'span.btn-text:has-text("展开补充更多信息")',
        'button:has-text("展开补充更多信息")',
        'a:has-text("展开补充更多信息")',
        '.next-btn:has-text("展开补充更多信息")',
        '[class*="expand"]:has-text("展开补充更多信息")',
        'span:has-text("展开补充更多信息")'
      ];

      let expandButton = null;
      for (const selector of expandButtonSelectors) {
        const btn = page.locator(selector).first();
        const isVisible = await btn.isVisible({ timeout: 500 }).catch(() => false);
        if (isVisible) {
          expandButton = btn;
          ctx.logger.info(`  🔍 检测到"展开补充更多信息"按钮: ${selector}`);
          break;
        }
      }

      if (expandButton) {
        ctx.logger.info('  📂 点击"展开补充更多信息"以显示隐藏字段...');
        await expandButton.click({ force: true });
        await page.waitForTimeout(800); // 等待展开动画完成
        ctx.logger.success('  ✅ 已展开补充信息区域');
      } else {
        ctx.logger.info('  ℹ️ 未检测到需要展开的按钮，直接查找货号字段');
      }
    } catch (expandError) {
      ctx.logger.warn(`  ⚠️ 展开操作失败（继续尝试定位货号）: ${expandError.message}`);
    }

    // 使用语义定位：通过文本关联到输入框（最佳实践）
    // 不限定必须是label标签，可以是span/div等任何包含"货号"文本的元素
    ctx.logger.info('  使用语义定位: text=货号 + following input');

    let skuInput;
    // 特例：高尔夫类目在不同模板下，货号字段可能出现在「类目属性」区域（sell-field-p-*），而不是常规的基础信息输入框
    const categoryPath = await page.locator('.path-name').first().textContent().catch(() => '');
    const isGolfBallCategory = (categoryPath && (categoryPath.includes('高尔夫球服') || categoryPath.includes('高尔夫服装'))) || isMoveSportBrand || isMasterBunnyBrand;
    const isGolfTopCategory = !!(categoryPath && categoryPath.includes('高尔夫上装'));

    // 方法1：通过文本定位（适用于span/div/label等）
    try {
      if (isGolfTopCategory) {
        ctx.logger.info(`  检测到类目包含“高尔夫上装”，货号字段在类目属性区域（${categoryPath.trim()}）`);

        // 只在 sell-field-p-* 内定位包含“货号”的字段，避免误写到「店铺中分类」等 next-select 输入框
        const skuField = page
          .locator('[id^="sell-field-p-"]')
          .filter({ hasText: '货号' })
          .first();

        skuInput = skuField.locator('input, textarea').first();
        await skuInput.waitFor({ state: 'attached', timeout: 3000 });
        ctx.logger.success('  ✅ 类目属性货号（高尔夫上装）定位成功');
      } else if (isGolfBallCategory) {
        ctx.logger.info('  检测到类目包含高尔夫球服，尝试类目属性区域的货号输入框');
        skuInput = page.locator('[id^="sell-field-p-"] input, [id^="sell-field-p-"] textarea').first();
        await skuInput.waitFor({ state: 'attached', timeout: 3000 });
        ctx.logger.success('  ✅ 类目属性货号定位成功');
      } else {
        skuInput = page.getByText('货号', { exact: false })
          .locator('xpath=following::input[@type="text" or not(@type)]')
          .first();

        ctx.logger.info('  尝试方法1: getByText + following input');
        await skuInput.waitFor({ state: 'attached', timeout: 3000 });
        ctx.logger.success('  ✅ 方法1成功');
      }

    } catch (e) {
      ctx.logger.info(`  方法1失败: ${e.message}`);

      // 方法2：使用更通用的选择器（fallback）
      try {
        // 在包含"货号"文本的div中找input
        skuInput = page.locator('div:has-text("货号") .next-input input').first();
        ctx.logger.info('  尝试方法2: div:has-text("货号") .next-input input');
        await skuInput.waitFor({ state: 'attached', timeout: 3000 });
        ctx.logger.success('  ✅ 方法2成功');
      } catch (e2) {
        throw new Error(`❌ 无法定位货号输入框: ${e.message} | ${e2.message}`);
      }
    }

    // 🛡️ 防呆：避免误命中“店铺中分类”等 next-select 搜索输入框（会导致把货号写到错误位置）
    try {
      const skuMeta = await skuInput.evaluate((el) => {
        const field = el.closest('[id^="sell-field-"]');
        return {
          closestFieldId: field ? field.id : '',
          name: el.getAttribute('name') || '',
          placeholder: el.getAttribute('placeholder') || ''
        };
      });

      if (skuMeta.closestFieldId === 'sell-field-shopcat') {
        ctx.logger.warn('  ⚠️ 货号定位误命中“店铺中分类”，尝试重新定位到真正的货号字段...');

        // 先清理“店铺中分类”输入框中残留文本，避免影响后续
        try {
          const shopcatInput = page.locator('#sell-field-shopcat input').first();
          if (await shopcatInput.count()) {
            await shopcatInput.fill('');
          }
          await page.keyboard.press('Escape').catch(() => {});
        } catch (clearErr) {
          ctx.logger.warn(`  ⚠️ 清理“店铺中分类”残留文本失败（忽略）: ${clearErr.message}`);
        }

        // 优先：高尔夫上装类目固定字段（已观察到：sell-field-p-13021751）
        const golfTopSkuInput = page.locator('#sell-field-p-13021751 input, #sell-field-p-13021751 textarea').first();
        const golfTopExists = await golfTopSkuInput.count().catch(() => 0);
        if (golfTopExists) {
          skuInput = golfTopSkuInput;
          ctx.logger.success('  ✅ 已切换为高尔夫上装类目货号输入框（sell-field-p-13021751）');
        } else {
          // 兜底：在 sell-field 容器内查找包含“货号”的字段，避免跟随 xpath=following 误命中弹层
          const skuFieldContainer = page
            .locator('[id^="sell-field-"]')
            .filter({ hasText: '货号' })
            .first();
          const skuInput2 = skuFieldContainer.locator('input, textarea').first();
          await skuInput2.waitFor({ state: 'attached', timeout: 3000 });
          skuInput = skuInput2;
          ctx.logger.success('  ✅ 已通过 sell-field 容器重新定位货号输入框');
        }
      }
    } catch (e) {
      ctx.logger.warn(`  ⚠️ 货号定位校验失败（忽略）: ${e.message}`);
    }

    // 滚动到视口（货号字段可能在页面下方）
    ctx.logger.info('  滚动到货号字段...');
    await skuInput.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // 等待可见和可编辑
    ctx.logger.info('  等待货号输入框可见...');
    await skuInput.waitFor({ state: 'visible', timeout: 8000 });

    let skuEditable = await skuInput.isEditable();
    ctx.logger.info(`  货号输入框可编辑状态: ${skuEditable}`);

    // 如果不可编辑，尝试移除只读并直接写值
    if (!skuEditable) {
      ctx.logger.warn('  ⚠️ 货号输入框不可编辑，尝试移除只读属性并直接写值');
      try {
        // 注意：page.evaluate 内不能使用 Playwright 选择器（如 :has-text），这里只对已定位到的输入框做处理
        await skuInput.evaluate((el, value) => {
          if (!el) return;
          el.removeAttribute('readonly');
          el.removeAttribute('disabled');
          el.removeAttribute('aria-readonly');
          el.removeAttribute('aria-disabled');
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        }, productId);
      } catch (e) {
        ctx.logger.warn(`  ⚠️ 移除只读失败: ${e.message}`);
      }
      // 重新检测可编辑性
      skuEditable = await skuInput.isEditable().catch(() => false);
    }

    if (!skuEditable) {
      // 仍不可编辑时，尝试直接验证已有值是否等于商品ID
      const existingValue = await skuInput.inputValue().catch(() => '');
      if (existingValue === productId) {
        ctx.logger.info('  ℹ️ 货号已存在且匹配，跳过填写');
        return;
      }
      throw new Error('❌ 货号输入框不可编辑且无法设置值');
    }

    // 填写货号（fill方法会自动清空旧值）
    ctx.logger.info(`  ⚙️ [基础信息] 货号 → ${productId}`);
    await skuInput.click();  // 先点击获得焦点
    await page.waitForTimeout(150);
    await skuInput.fill(productId);  // fill会自动清空并填入
    await page.waitForTimeout(200);  // 等待值生效

    // 验证填写结果
    const skuValue = await skuInput.inputValue();
    if (skuValue === productId) {
      ctx.logger.success(`✅ 货号验证成功: ${skuValue}`);
    } else {
      throw new Error(`❌ 货号填写失败: 期望"${productId}"，实际"${skuValue}"`);
    }

    // 额外验证：检查字符计数是否正确（货号字段旁边有"X/128"的计数）
    try {
      const charCount = await page.locator('label:has-text("货号")')
        .locator('xpath=following-sibling::*//*[contains(text(), "/128")]')
        .first()
        .textContent();
      ctx.logger.info(`  字符计数: ${charCount}`);
    } catch (e) {
      // 字符计数验证失败不影响主流程
      ctx.logger.info('  无法读取字符计数（可能页面结构不同）');
    }

    // ============================================
    // 步骤3：更新缓存
    // ============================================
    ctx.logger.info('\n[步骤3] 更新缓存');

    const taskCacheFinal = loadTaskCache(productId);
    if (taskCacheFinal) {
      taskCacheFinal.merchantCode = merchantCodeValue;
      taskCacheFinal.skuCode = skuValue;
      saveTaskCache(productId, taskCacheFinal);
      ctx.logger.success('商品编码和基础信息已保存到缓存');
    }

    ctx.logger.info('\n=== 商品编码和基础信息填写完成 ===');
    ctx.logger.info(`商家编码: ${merchantCodeValue}`);
    ctx.logger.info(`货号: ${skuValue}`);

    clearInterval(heartbeat);

  } catch (error) {
    clearInterval(heartbeat);
    ctx.logger.error(`基本信息填写失败: ${error.message}`);

    throw error;
  }
};

module.exports = { step7 };
