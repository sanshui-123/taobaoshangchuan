/**
 * Step5: 填写淘宝商品标题和选择服装分类
 * 可独立运行测试：node scripts/steps/step5-fill-title-category.js --product=C25233183
 */

const { determine_clothing_type } = require('../utils/classify-clothing');
const { loadTaskCache } = require('../utils/cache');
const browserManager = require('../utils/browser-manager');
const { createStepLogger } = require('../utils/logger');

/**
 * 映射细分类型到淘宝类目
 * @param {string} detailedType - 细分类型
 * @returns {string} 淘宝类目
 */
function mapToTaobaoCategory(detailedType) {
  const categoryMapping = {
    'Polo衫': 'POLO',
    'T恤': 'T恤',
    '短袖': '短袖',
    '长袖上衣': '长袖',
    '毛衣': '长袖',
    '衬衫': '长袖',
    '卫衣': '卫衣',
    '夹克': '外套',
    '风衣': '外套',
    '羽绒服': '外套',
    '雨衣': '外套',
    '马甲': '马甲',
    '背心上衣': '背心',
    '打底衣': '紧身衣裤',
    '运动上衣': '训练服',
    '短裤': '短裤',
    '长裤': '长裤',
    '雨裤': '长裤',
    '裙子': '短裙',
    '袜子': '袜子',
    '高筒袜': '袜子',
    '长袜': '袜子',
    '短袜': '袜子',
    '腰带': '腰带',
    '手套': '其他',
    '鸭舌帽': '其他',
    '帽子': '其他',
    '毛巾': '其他',
    '围巾': '其他',
    '护臂套': '其他',
    '高尔夫鞋': '其他',
    '钉鞋': '其他',
    '软钉鞋': '其他',
    '无钉鞋': '其他',
    '鞋类': '其他',
    '上衣': '其他',
    '下装': '其他',
    '配件': '其他',
  };

  return categoryMapping[detailedType] || '其他';
}

/**
 * 填写淘宝商品标题和选择服装分类
 * @param {Page} page - Playwright页面对象
 * @param {Object} productData - 从飞书获取的商品数据
 * @param {string} productData.title - 商品标题
 * @param {string} [productData.productName] - 产品名称（用于分类判断）
 * @param {string} [productData.description] - 描述
 * @param {string} [productData.category] - 类别
 * @param {string} [productData.productUrl] - 产品URL
 * @param {Object} [logger] - 日志记录器
 */
async function fillTitleAndCategory(page, productData, logger = console) {
  logger.info('\n========== 填写商品标题和分类 ==========');

  try {
    // ==================== 第一部分：填写商品标题 ====================
    logger.info('\n[步骤1] 填写商品标题');
    logger.info(`  标题内容: ${productData.title}`);

    // 1.1 定位标题输入框
    const titleInput = page.getByRole('textbox', {
      name: '最多允许输入30个汉字（60字符）'
    });

    // 1.2 点击输入框获得焦点
    await titleInput.click();
    await page.waitForTimeout(300);

    // 1.3 清空并填入标题
    await titleInput.clear();
    await titleInput.fill(productData.title);
    await page.waitForTimeout(500);

    logger.info('  ✅ 标题填写完成');

    // ==================== 第二部分：判断服装分类 ====================
    logger.info('\n[步骤2] 分析服装分类');

    // 优先使用飞书品类字段，缺失或不匹配时退回标题推断
    const candidateCategories = [];
    if (productData.category && String(productData.category).trim()) {
      const primary = String(productData.category).trim();
      candidateCategories.push(primary);
      logger.info(`  使用飞书品类字段: ${primary}`);
    }

    const detailedType = determine_clothing_type(productData);
    const fallbackCategory = mapToTaobaoCategory(detailedType);
    if (!candidateCategories.includes(fallbackCategory)) {
      candidateCategories.push(fallbackCategory);
      logger.info(`  备用类目（按标题推断）: ${fallbackCategory}`);
    }

    if (candidateCategories.length === 0) {
      candidateCategories.push('其他');
      logger.info('  未获取到品类，使用默认类目: 其他');
    }

    // ==================== 第三部分：选择服装分类 ====================
    logger.info('\n[步骤3] 选择服装分类');

    // 依次尝试候选类目，命中即止
    let categorySelected = false;
    for (const taobaoCategory of candidateCategories) {
      logger.info(`\n  尝试选择分类: ${taobaoCategory}`);

      // 3.1 点击分类下拉框（当前显示的分类值）
      logger.info('  3.1 点击下拉框');
      await page.locator('span').filter({
        hasText: /POLO|T恤|其他|卫衣|场训服|外套|套装|比赛服|短袖|短裙|短裤|紧身衣裤|背心|腰带|袜子|训练服|连衣裙|长袖|长裤|马甲/
      }).nth(2).click();

      // 3.2 等待下拉框完全展开
      await page.waitForTimeout(800);
      logger.info('  3.2 下拉框已展开');

      // 3.3 确保搜索框可见（尝试多个选择器）
      let searchInput;
      try {
        await page.waitForSelector('.options-search > .next-input > input', {
          state: 'visible',
          timeout: 5000
        });
        searchInput = page.locator('.options-search > .next-input > input');
      } catch (error) {
        // 尝试备用选择器
        await page.waitForSelector('.next-select input', {
          state: 'visible',
          timeout: 5000
        });
        searchInput = page.locator('.next-select input');
      }

      // 3.4 点击搜索框
      logger.info(`  3.3 在搜索框输入: ${taobaoCategory}`);
      await searchInput.click();
      await page.waitForTimeout(300);

      // 3.5 清空搜索框
      await page.locator('.next-input.next-focus > input').clear();
      await page.waitForTimeout(200);

      // 3.6 填入淘宝分类
      await page.locator('.next-input.next-focus > input').fill(taobaoCategory);
      await page.waitForTimeout(500);

      // 3.7 等待搜索结果加载
      logger.info('  3.4 等待搜索结果');
      await page.waitForTimeout(800);

      // 3.8 点击匹配的分类选项（title 或文本）
      logger.info(`  3.5 选择分类: ${taobaoCategory}`);
      try {
        const optionByTitle = page.getByTitle(taobaoCategory).first();
        if (await optionByTitle.count()) {
          await optionByTitle.click();
        } else {
          await page.getByText(taobaoCategory, { exact: false }).first().click();
        }
        await page.waitForTimeout(500);
        logger.info('  ✅ 分类选择完成');
        categorySelected = true;
        break;
      } catch (err) {
        logger.warn(`  ⚠️ 分类 "${taobaoCategory}" 选择失败: ${err.message}`);
        // 下一个候选
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
      }
    }

    if (!categorySelected) {
      logger.warn(`  ⚠️ 未能匹配候选分类 (${candidateCategories.join(', ')})，尝试选择下拉第一项作为兜底`);

      // 兜底：打开下拉，选择第一项
      await page.locator('span').filter({
        hasText: /POLO|T恤|其他|卫衣|场训服|外套|套装|比赛服|短袖|短裙|短裤|紧身衣裤|背心|腰带|袜子|训练服|连衣裙|长袖|长裤|马甲/
      }).nth(2).click();
      await page.waitForTimeout(500);

      const options = page.locator('.next-menu-item, li[role="option"]');
      const optionCount = await options.count().catch(() => 0);
      if (optionCount > 0) {
        const firstOption = options.first();
        const text = await firstOption.textContent().catch(() => '');
        await firstOption.click({ timeout: 3000 });
        await page.waitForTimeout(400);
        logger.warn(`  ⚠️ 未命中候选，已选下拉第一项: ${text?.trim() || '未知'}`);
        categorySelected = true;
      } else {
        logger.warn('  ⚠️ 下拉没有可选项，保持当前值继续');
      }
    }

    logger.info('\n========== 标题和分类填写完成 ==========\n');

  } catch (error) {
    logger.error('\n❌ 填写失败:', error.message);
    throw error;
  }
}

/**
 * Step5 主函数（供 publish.js 调用）
 */
const step5 = async (ctx) => {
  const { productId, logger, page1 } = ctx;

  logger.info('开始填写商品标题和分类');

  try {
    // 从缓存加载商品数据（兼容 ctx.taskCache 或从文件加载）
    let taskCache = ctx.taskCache;
    if (!taskCache || !taskCache.productData) {
      taskCache = loadTaskCache(productId);
    }

    // 验证必要数据
    if (!taskCache || !taskCache.productData) {
      throw new Error('缺少商品数据，请先执行 Step0 获取飞书数据');
    }

    const productData = taskCache.productData;

    // 验证必填字段
    if (!productData.titleCN && !productData.title) {
      throw new Error('缺少商品标题字段');
    }

    // 准备数据（兼容不同字段名）
    const fillData = {
      title: productData.titleCN || productData.title,
      productName: productData.titleJP || productData.productName || '',
      description: productData.descriptionCN || productData.description || '',
      category: productData.category || '',
      productUrl: productData.productUrl || ''
    };

    // 执行填写
    await fillTitleAndCategory(page1, fillData, logger);

    logger.success('商品标题和分类填写完成');

  } catch (error) {
    logger.error(`标题和分类填写失败: ${error.message}`);
    throw error;
  }
};

// ==================== CLI 入口 ====================

/**
 * 独立运行模式
 */
async function runStandalone() {
  const args = process.argv.slice(2);
  const productArg = args.find(arg => arg.startsWith('--product='));
  const verboseArg = args.includes('--verbose');

  if (!productArg) {
    console.error('❌ 错误：缺少 --product 参数');
    console.log('\n使用方法:');
    console.log('  node scripts/steps/step5-fill-title-category.js --product=C25233183 [--verbose]');
    process.exit(1);
  }

  const productId = productArg.split('=')[1];

  console.log(`\n🚀 独立测试模式 - ProductID: ${productId}`);
  console.log('='.repeat(60));

  // 创建日志记录器
  const logger = createStepLogger(productId, '5');

  try {
    // 1. 从缓存读取商品数据
    logger.info('\n[1/3] 从缓存读取商品数据');
    const taskCache = loadTaskCache(productId);

    if (!taskCache.productData) {
      throw new Error('缓存中缺少商品数据，请先执行 Step0 获取飞书数据');
    }

    const productData = taskCache.productData;
    logger.info(`  品牌: ${productData.brand || '未知'}`);
    logger.info(`  标题: ${productData.titleCN || productData.title || '未知'}`);

    if (verboseArg) {
      logger.info(`  完整数据: ${JSON.stringify(productData, null, 2)}`);
    }

    // 2. 获取浏览器页面
    logger.info('\n[2/3] 连接浏览器页面');

    // 使用 browser-manager 提供的接口获取页面
    const page = await browserManager.getMainPage();
    logger.info(`  当前页面: ${page.url()}`);

    // 3. 执行填写操作
    logger.info('\n[3/3] 执行填写操作');

    const fillData = {
      title: productData.titleCN || productData.title,
      productName: productData.titleJP || productData.productName || '',
      description: productData.descriptionCN || productData.description || '',
      category: productData.category || '',
      productUrl: productData.productUrl || ''
    };

    await fillTitleAndCategory(page, fillData, logger);

    console.log('\n✅ 测试完成！');

  } catch (error) {
    logger.error(`\n❌ 测试失败: ${error.message}`);
    if (verboseArg) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// 判断是否为独立运行
if (require.main === module) {
  runStandalone();
}

module.exports = {
  step5,
  fillTitleAndCategory,
  mapToTaobaoCategory
};
