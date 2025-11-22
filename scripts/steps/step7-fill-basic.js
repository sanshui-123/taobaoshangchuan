const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');

/**
 * 步骤8：填写商品编码和基础信息
 * 1. 销售信息 → 商家编码
 * 2. 基础信息 → 货号
 * 3. 基础信息 → 适用性别（根据标题识别性别，选择"男"或"女"）
 */

const step7 = async (ctx) => {
  ctx.logger.info('开始填写商品编码和基础信息（商家编码+货号+适用性别）');

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

    ctx.logger.info(`商品ID: ${productId}`);

    // ============================================
    // 步骤1：切换到"销售信息"tab
    // ============================================
    ctx.logger.info('\n[步骤1] 切换到"销售信息"tab');

    const salesTabSelectors = [
      'li.next-menu-item:has-text("销售信息")',
      'li.next-nav-item:has-text("销售信息")',
      '.next-menu-item:has-text("销售信息")',
      '[role="option"]:has-text("销售信息")'
    ];

    let salesTab = null;
    for (const selector of salesTabSelectors) {
      try {
        salesTab = await page.$(selector);
        if (salesTab) {
          ctx.logger.info(`  找到销售信息tab: ${selector}`);
          break;
        }
      } catch (e) {
        // 继续尝试
      }
    }

    if (!salesTab) {
      throw new Error('未找到"销售信息"tab，无法切换');
    }

    // 点击切换到销售信息
    await salesTab.click();
    ctx.logger.success('✅ 已切换到"销售信息"tab');
    await page.waitForTimeout(300);

    // ============================================
    // 步骤2：填写"商家编码"（销售信息页签）
    // ============================================
    ctx.logger.info('\n[步骤2] 填写商家编码（销售信息页签）');

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
    // 步骤3：切换回"基础信息"tab
    // ============================================
    ctx.logger.info('\n[步骤3] 切换回"基础信息"tab');

    const basicTabSelectors = [
      'li.next-menu-item:has-text("基础信息")',
      'li.next-nav-item:has-text("基础信息")',
      '.next-menu-item:has-text("基础信息")',
      '[role="option"]:has-text("基础信息")'
    ];

    let basicTab = null;
    for (const selector of basicTabSelectors) {
      try {
        basicTab = await page.$(selector);
        if (basicTab) {
          ctx.logger.info(`  找到基础信息tab: ${selector}`);
          break;
        }
      } catch (e) {
        // 继续尝试
      }
    }

    if (!basicTab) {
      throw new Error('未找到"基础信息"tab，无法切换');
    }

    // 点击切换到基础信息
    await basicTab.click();
    ctx.logger.success('✅ 已切换到"基础信息"tab');
    await page.waitForTimeout(300);

    // ============================================
    // 步骤4：填写"货号"（基础信息页签）
    // ============================================
    ctx.logger.info('\n[步骤4] 填写货号（基础信息页签）');

    // 使用语义定位：通过文本关联到输入框（最佳实践）
    // 不限定必须是label标签，可以是span/div等任何包含"货号"文本的元素
    ctx.logger.info('  使用语义定位: text=货号 + following input');

    let skuInput;

    // 方法1：通过文本定位（适用于span/div/label等）
    try {
      skuInput = page.getByText('货号', { exact: false })
        .locator('xpath=following::input[@type="text" or not(@type)]')
        .first();

      ctx.logger.info('  尝试方法1: getByText + following input');
      await skuInput.waitFor({ state: 'attached', timeout: 3000 });
      ctx.logger.success('  ✅ 方法1成功');
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

    // 滚动到视口（货号字段可能在页面下方）
    ctx.logger.info('  滚动到货号字段...');
    await skuInput.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // 等待可见和可编辑
    ctx.logger.info('  等待货号输入框可见...');
    await skuInput.waitFor({ state: 'visible', timeout: 8000 });

    const skuEditable = await skuInput.isEditable();
    ctx.logger.info(`  货号输入框可编辑状态: ${skuEditable}`);

    if (!skuEditable) {
      throw new Error('❌ 货号输入框不可编辑');
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
    // 步骤5：填写"适用性别"（基础信息页签）
    // ============================================
    ctx.logger.info('\n[步骤5] 填写适用性别（基础信息页签）');

    // 从缓存优先读取性别（飞书字段）
    const taskCache = loadTaskCache(productId);
    let targetGender = normalizeGender(
      taskCache?.productData?.gender ||
      taskCache?.productData?.targetAudience
    );

    // 如果缓存中没有，尝试从标题中识别
    if (!targetGender) {
      const title = taskCache?.productData?.titleCN || taskCache?.productData?.title || '';
      ctx.logger.info(`  从标题智能识别性别: ${title}`);

      if (title.includes('男士') || title.includes('男款') || title.includes('男子') || title.includes('MEN')) {
        targetGender = '男';
      } else if (title.includes('女士') || title.includes('女款') || title.includes('女子') || title.includes('WOMEN')) {
        targetGender = '女';
      } else {
        ctx.logger.info('  ⚠️ 无法从标题识别性别，默认为"男"');
        targetGender = '男';  // 默认为男
      }
    }

    ctx.logger.info(`  目标性别: ${targetGender}`);

    // 定位适用性别字段（使用ID定位 - 最稳定）
    ctx.logger.info('  定位适用性别字段...');

    const genderField = page.locator('#sell-field-p-573325695');
    const genderInput = genderField.locator('span.next-select-values');

    // 滚动到视口
    await genderInput.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // 点击触发下拉面板
    ctx.logger.info('  点击适用性别选择框...');
    await genderInput.click({ force: true });
    await page.waitForTimeout(600);

    // 等待下拉面板出现
    ctx.logger.info('  等待下拉面板出现...');
    const dropdownPanel = page.locator('div.sell-o-select-options');
    await dropdownPanel.waitFor({ state: 'visible', timeout: 5000 });
    ctx.logger.success('  ✅ 下拉面板已展开');

    // 选择目标性别选项（使用精确匹配，避免"男"匹配到"男女通用"）
    ctx.logger.info(`  选择性别: ${targetGender}`);
    const option = dropdownPanel.getByText(targetGender, { exact: true });
    await option.click();
    await page.waitForTimeout(800);

    // 验证选择结果
    const selectedValue = await genderInput.textContent();
    ctx.logger.info(`  适用性别选择框值: ${selectedValue}`);

    if (selectedValue && selectedValue.includes(targetGender)) {
      ctx.logger.success(`✅ 适用性别验证成功: ${selectedValue}`);
    } else {
      ctx.logger.warn(`⚠️ 适用性别可能未正确选择: 期望"${targetGender}"，实际"${selectedValue}"`);
    }

    // ============================================
    // 步骤6：更新缓存
    // ============================================
    ctx.logger.info('\n[步骤6] 更新缓存');

    const taskCacheFinal = loadTaskCache(productId);
    if (taskCacheFinal) {
      taskCacheFinal.merchantCode = merchantCodeValue;
      taskCacheFinal.skuCode = skuValue;
      taskCacheFinal.gender = targetGender;
      saveTaskCache(productId, taskCacheFinal);
      ctx.logger.success('商品编码和基础信息已保存到缓存');
    }

    ctx.logger.info('\n=== 商品编码和基础信息填写完成 ===');
    ctx.logger.info(`商家编码: ${merchantCodeValue}`);
    ctx.logger.info(`货号: ${skuValue}`);
    ctx.logger.info(`适用性别: ${targetGender}`);

    clearInterval(heartbeat);

  } catch (error) {
    clearInterval(heartbeat);
    ctx.logger.error(`基本信息填写失败: ${error.message}`);

    throw error;
  }
};

/**
 * 规范化性别值，返回 '男' / '女'，未知返回空字符串
 */
function normalizeGender(value) {
  if (!value) return '';
  const text = Array.isArray(value) ? (value[0] || '') : String(value);
  const lower = text.toLowerCase();
  if (text.includes('女') || lower.includes('women') || lower.includes('lady') || lower.includes('female')) {
    return '女';
  }
  if (text.includes('男') || lower.includes('men') || lower.includes('male')) {
    return '男';
  }
  return '';
}

module.exports = { step7 };
