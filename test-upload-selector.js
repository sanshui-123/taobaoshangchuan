/**
 * 测试上传框选择器
 * 在浏览器控制台中运行此代码，或使用 Playwright 连接到浏览器测试
 */

const uploadBoxSelectors = [
  // 优先：精确的class选择器
  '.sell-component-info-wrapper-component-child div.placeholder',
  'div.placeholder',
  '[data-testid="upload-placeholder"]',
  '.upload-pic-box.placeholder',

  // 次选：通过结构和文本查找
  '.sell-field-mainImagesGroup .upload-pic-box:first-child',
  '.upload-pic-box:first-child',
  '[class*="mainImages"] .upload-item:first-child',
  '[class*="mainImagesGroup"] div:first-child',

  // 备选：通过文本内容查找（需要在Playwright中测试）
  'div:has-text("上传图片")',
  'button:has-text("上传图片")',
  '[class*="upload"]:has-text("上传图片")',

  // 最后：通过父容器查找第一个子元素
  '.white-bg-image .upload-box:first-child',
  '#struct-mainImagesGroup div[class*="upload"]:first-child',

  // 兜底：图片上传icon
  'svg[class*="upload"]',
  'i[class*="upload"]'
];

console.log('=== 测试上传框选择器 ===\n');

uploadBoxSelectors.forEach((selector, index) => {
  try {
    // 跳过 Playwright 特有的选择器（:has-text）
    if (selector.includes(':has-text(')) {
      console.log(`${index + 1}. ${selector} - [跳过，需要在Playwright中测试]`);
      return;
    }

    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`✅ ${index + 1}. ${selector} - 找到 ${elements.length} 个元素`);
      console.log('   第一个元素:', elements[0]);
      console.log('   元素class:', elements[0].className);
      console.log('   元素内容:', elements[0].textContent.substring(0, 50));
      console.log('');
    } else {
      console.log(`❌ ${index + 1}. ${selector} - 未找到元素`);
    }
  } catch (e) {
    console.log(`⚠️  ${index + 1}. ${selector} - 错误: ${e.message}`);
  }
});

console.log('\n=== 测试完成 ===');
console.log('请复制成功的选择器，更新到 Step5 代码中');
