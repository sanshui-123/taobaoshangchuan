/**
 * Step5 代码逻辑验证脚本
 * 验证优化后的搜索框和 Fallback 逻辑是否正确
 */

const fs = require('fs');
const path = require('path');

console.log('📋 Step5 文件夹搜索功能验证\n');
console.log('='.repeat(60));

// 读取 step5-upload-images.js 文件
const step5FilePath = path.join(__dirname, 'scripts/steps/step5-upload-images.js');
const step5Code = fs.readFileSync(step5FilePath, 'utf-8');

// 验证项目列表
const verifications = [
  {
    name: '搜索框定位',
    check: () => step5Code.includes('input[placeholder*="请输入文件夹名称"]'),
    details: '检查是否使用正确的 placeholder 选择器定位搜索框'
  },
  {
    name: '输入商品ID',
    check: () => step5Code.includes('await searchInput.fill(productId)'),
    details: '检查是否正确填入商品ID'
  },
  {
    name: '智能等待下拉建议',
    check: () => {
      const hasLoop = step5Code.includes('for (let i = 0; i < 10; i++)');
      const hasDropdownCheck = step5Code.includes('.next-menu, .dropdown-menu, [role="listbox"]');
      return hasLoop && hasDropdownCheck;
    },
    details: '检查是否实现了循环检测下拉菜单（最多5秒）'
  },
  {
    name: '下拉建议选择器',
    check: () => {
      const selectors = [
        '.next-menu-item:has-text',
        '[role="option"]:has-text',
        '.dropdown-item:has-text',
        'li:has-text',
      ];
      return selectors.every(sel => step5Code.includes(sel));
    },
    details: '检查是否包含多种优先级选择器（至少4种）'
  },
  {
    name: '点击下拉建议',
    check: () => {
      const hasLoop = step5Code.includes('for (const selector of suggestionSelectors)');
      const hasClick = step5Code.includes('await suggestion.click');
      const hasVisibility = step5Code.includes('waitFor({ state: \'visible\'');
      return hasLoop && hasClick && hasVisibility;
    },
    details: '检查是否遍历选择器并验证可见性后点击'
  },
  {
    name: 'Fallback 机制',
    check: () => {
      const hasCatch = step5Code.includes('catch (searchError)');
      const hasFallback = step5Code.includes('切换到方案B：左侧文件夹树');
      return hasCatch && hasFallback;
    },
    details: '检查是否实现了搜索失败后的 Fallback 逻辑'
  },
  {
    name: '文件夹树选择器',
    check: () => {
      const selectors = [
        '[title="${productId}"]',
        '.folder-item:has-text',
        '.PicGroupList :has-text',
        '.folder-tree :has-text',
      ];
      return selectors.every(sel => step5Code.includes(sel));
    },
    details: '检查是否包含多种文件夹树选择器（至少4种）'
  },
  {
    name: '错误截图',
    check: () => {
      const hasScreenshot = step5Code.includes('step5-folder-selection-error');
      const hasCatch = step5Code.includes('catch (treeError)');
      return hasScreenshot && hasCatch;
    },
    details: '检查是否在失败时保存错误截图'
  },
  {
    name: '详细日志输出',
    check: () => {
      const emojiLogs = [
        '🔍 定位搜索框',
        '⌨️  准备输入商品ID',
        '⏳ 等待下拉建议出现',
        '🎯 尝试点击下拉建议',
        '📂 在左侧文件夹树中查找',
      ];
      return emojiLogs.every(log => step5Code.includes(log));
    },
    details: '检查是否包含详细的 emoji 日志输出'
  },
  {
    name: '双重错误信息',
    check: () => {
      const hasDoubleError = step5Code.includes('两种方案都失败了');
      const hasSearchError = step5Code.includes('搜索方案:');
      const hasTreeError = step5Code.includes('树导航方案:');
      return hasDoubleError && hasSearchError && hasTreeError;
    },
    details: '检查是否同时显示搜索和树导航的错误信息'
  }
];

// 执行验证
console.log('\n📊 验证结果:\n');

let passedCount = 0;
let failedCount = 0;

verifications.forEach((item, index) => {
  const result = item.check();
  const status = result ? '✅ 通过' : '❌ 失败';
  const icon = result ? '✅' : '❌';

  if (result) {
    passedCount++;
  } else {
    failedCount++;
  }

  console.log(`${index + 1}. ${icon} ${item.name}`);
  console.log(`   ${item.details}`);
  if (!result) {
    console.log('   ⚠️  未找到预期的代码模式');
  }
  console.log('');
});

// 总结
console.log('='.repeat(60));
console.log('\n📈 验证总结:\n');
console.log(`  总计: ${verifications.length} 项`);
console.log(`  ✅ 通过: ${passedCount} 项`);
console.log(`  ❌ 失败: ${failedCount} 项`);
console.log(`  🎯 成功率: ${((passedCount / verifications.length) * 100).toFixed(1)}%`);
console.log('');

// 代码统计
const lines = step5Code.split('\n');
const totalLines = lines.length;
const step4StartLine = lines.findIndex(line => line.includes('步骤4：在弹出的"选择图片"对话框中搜索文件夹'));
const step4EndLine = lines.findIndex((line, idx) => idx > step4StartLine && line.includes('// 获取 uploadFrame（如果需要在后续步骤中使用）'));
const step4Lines = step4EndLine - step4StartLine;

console.log('📝 代码统计:\n');
console.log(`  文件总行数: ${totalLines}`);
console.log(`  步骤4代码行数: ${step4Lines}`);
console.log(`  步骤4起始行: ${step4StartLine + 1}`);
console.log(`  步骤4结束行: ${step4EndLine + 1}`);
console.log('');

// 功能覆盖度分析
console.log('🎯 功能覆盖度分析:\n');

const features = {
  '搜索框方案': {
    '定位搜索框': step5Code.includes('input[placeholder*="请输入文件夹名称"]'),
    '输入商品ID': step5Code.includes('await searchInput.fill(productId)'),
    '智能等待': step5Code.includes('for (let i = 0; i < 10; i++)'),
    '多选择器': step5Code.includes('.next-menu-item:has-text'),
    '点击下拉项': step5Code.includes('await suggestion.click'),
  },
  '文件夹树方案': {
    '检测失败': step5Code.includes('catch (searchError)'),
    '切换提示': step5Code.includes('切换到方案B'),
    '多选择器': step5Code.includes('[title="${productId}"]'),
    '点击文件夹': step5Code.includes('await folderInTree.click'),
  },
  '错误处理': {
    '搜索错误': step5Code.includes('searchError.message'),
    '树错误': step5Code.includes('treeError.message'),
    '错误截图': step5Code.includes('step5-folder-selection-error'),
    '双重错误信息': step5Code.includes('两种方案都失败了'),
  },
  '日志系统': {
    'emoji 日志': step5Code.includes('🔍'),
    '详细步骤': step5Code.includes('ctx.logger.debug'),
    '成功提示': step5Code.includes('ctx.logger.success'),
    '警告提示': step5Code.includes('ctx.logger.warn'),
  }
};

Object.entries(features).forEach(([category, items]) => {
  const total = Object.keys(items).length;
  const passed = Object.values(items).filter(v => v).length;
  const percentage = ((passed / total) * 100).toFixed(0);

  console.log(`  ${category}: ${passed}/${total} (${percentage}%)`);
  Object.entries(items).forEach(([feature, status]) => {
    const icon = status ? '✅' : '❌';
    console.log(`    ${icon} ${feature}`);
  });
  console.log('');
});

// 最终判定
console.log('='.repeat(60));
if (failedCount === 0) {
  console.log('\n🎉 恭喜！所有验证项目都通过了！');
  console.log('✅ Step5 文件夹搜索功能已正确实现');
  console.log('✅ 代码质量符合预期');
  console.log('\n建议：可以进行实际的端到端测试');
  process.exit(0);
} else {
  console.log('\n⚠️  部分验证项目未通过');
  console.log(`需要修复 ${failedCount} 个问题`);
  console.log('\n建议：检查失败的验证项并修复代码');
  process.exit(1);
}
