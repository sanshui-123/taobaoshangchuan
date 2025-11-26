/**
 * Step 6: 选择品牌
 *
 * 功能：
 * 1. 直接在品牌输入框输入品牌名称（不使用下拉列表）
 * 2. 验证品牌是否填入成功
 * 3. 缓存选择的品牌信息
 */

const path = require('path');
const fs = require('fs');
const { loadTaskCache, saveTaskCache } = require('../utils/cache');

class BrandSelector {
  /**
   * 直接输入品牌名称
   * @param {*} page - Playwright page对象
   * @param {string} brand - 品牌名称
   * @param {*} ctx - 上下文对象（包含logger等）
   */
  async selectBrand(page, brand, ctx) {
    // 步骤1：定位品牌输入框
    ctx.logger.info('\n[步骤1] 定位品牌输入框');

    // 等待页面加载完成
    ctx.logger.info('  等待页面加载完成...');
    await page.waitForTimeout(1000);

    ctx.logger.info('  尝试定位品牌输入框...');

    // 使用更稳定的选择器，基于role和placeholder
    const inputSelectors = [
      // 基于 role 和 name
      'input[role="combobox"][name="请输入"]',
      // 基于 placeholder
      'input[placeholder="请输入"]',
      // 基于品牌字段
      '#sell-field-brand input',
      '[data-field="brand"] input',
      // 基于父容器文本
      'div:has-text("品牌") input',
      // 通用 combobox
      'input[role="combobox"]'
    ];

    let brandInput = null;
    let matchedSelector = null;

    for (let i = 0; i < inputSelectors.length; i++) {
      const selector = inputSelectors[i];
      ctx.logger.info(`  [${i + 1}/${inputSelectors.length}] 尝试: ${selector}`);

      try {
        const element = await page.waitForSelector(selector, { timeout: 2000, state: 'attached' }).catch(() => null);
        if (element) {
          // 检查元素是否可见
          const isVisible = await element.isVisible();
          ctx.logger.info(`    找到元素，可见性: ${isVisible}`);

          if (isVisible) {
            brandInput = element;
            matchedSelector = selector;
            ctx.logger.success(`✅ 找到品牌输入框: ${selector}`);
            break;
          }
        }
      } catch (e) {
        // 继续尝试下一个选择器
      }
    }

    if (!brandInput) {
      throw new Error('未找到品牌输入框');
    }

    // 步骤2：直接输入品牌名称
    ctx.logger.info(`\n[步骤2] 直接输入品牌: ${brand}`);

    // 点击输入框获取焦点
    await brandInput.click();
    await page.waitForTimeout(300);

    // 清空现有内容
    await brandInput.fill('');
    await page.waitForTimeout(200);

    // 填入品牌名称
    await brandInput.fill(brand);
    ctx.logger.success(`✅ 已输入品牌名称: ${brand}`);

    // 等待页面接收输入
    await page.waitForTimeout(500);

    // 尝试按回车确认
    try {
      await brandInput.press('Enter');
      ctx.logger.info('  已按回车确认');
      await page.waitForTimeout(500);
    } catch (e) {
      ctx.logger.info('  回车确认跳过');
    }

    // 步骤3：验证品牌是否已填入
    ctx.logger.info('\n[步骤3] 验证品牌输入');

    try {
      // 方法1：检查输入框的值
      const inputValue = await brandInput.inputValue();
      if (inputValue === brand) {
        ctx.logger.success(`✅ 品牌输入成功（输入框值）: ${inputValue}`);
      } else if (inputValue) {
        ctx.logger.warn(`⚠️  输入框值与目标品牌不完全一致: "${inputValue}" vs "${brand}"`);
      }

      // 方法2：检查已选择的品牌标签
      const selectedBrand = await page.$('#sell-field-brand .next-select-selection-item');
      if (selectedBrand) {
        const text = await selectedBrand.textContent();
        ctx.logger.success(`✅ 品牌标签显示: ${text}`);
      }
    } catch (e) {
      ctx.logger.warn(`验证品牌时出错: ${e.message}`);
    }
  }

  /**
   * 截图保存
   */
  async takeScreenshot(page, productId, screenshotDir, ctx) {
    try {
      fs.mkdirSync(screenshotDir, { recursive: true });
      const screenshotPath = path.join(screenshotDir, `${productId}_step6_brand_selected.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      ctx.logger.success(`截图已保存: ${screenshotPath}`);
      return screenshotPath;
    } catch (error) {
      ctx.logger.warn(`截图保存失败: ${error.message}`);
      return null;
    }
  }
}

/**
 * Step6主函数：选择品牌
 */
const step6 = async (ctx) => {
  const { productId, config, logger } = ctx;

  logger.info('开始选择商品品牌');

  // 按要求跳过品牌填写，不再操作品牌字段
  logger.info('按要求跳过品牌填写（不再查找/输入品牌字段）');
  return;
}

module.exports = { step6 };
