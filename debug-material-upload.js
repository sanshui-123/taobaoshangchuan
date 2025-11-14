/**
 * 淘宝素材库文件上传input定位脚本
 * 用于在浏览器控制台中执行，定位文件上传元素
 */

console.log('=== 淘宝素材库文件上传input定位器 ===');

// 方法1：查找主页面中的文件输入框
console.log('\n[方法1] 查找主页面文件输入框:');
const mainInputs = document.querySelectorAll('input[type="file"]');
console.log(`主页面找到 ${mainInputs.length} 个文件输入框:`);
mainInputs.forEach((input, index) => {
  console.log(`  ${index + 1}. ${generateSelector(input)}`, {
    class: input.className,
    id: input.id,
    multiple: input.multiple,
    accept: input.accept,
    style: input.style.cssText.substring(0, 100) + '...',
    parent: input.parentElement?.className
  });
});

// 方法2：查找所有iframe并检查文件输入框
console.log('\n[方法2] 查找iframe内的文件输入框:');
const allFrames = document.querySelectorAll('iframe, frame');
console.log(`找到 ${allFrames.length} 个iframe`);

allFrames.forEach((frame, frameIndex) => {
  try {
    const frameDoc = frame.contentDocument || frame.contentWindow?.document;
    if (!frameDoc) {
      console.log(`Frame ${frameIndex}: 无法访问文档`);
      return;
    }

    const frameInputs = frameDoc.querySelectorAll('input[type="file"]');
    if (frameInputs.length > 0) {
      console.log(`\n  Frame ${frameIndex} (${getFrameDescription(frame)}): 找到 ${frameInputs.length} 个文件输入框:`);

      frameInputs.forEach((input, inputIndex) => {
        console.log(`    ${inputIndex + 1}. ${generateSelector(input)}`, {
          class: input.className,
          id: input.id,
          multiple: input.multiple,
          accept: input.accept,
          style: input.style.cssText.substring(0, 100) + '...',
          parent: input.parentElement?.className,
          parentText: input.parentElement?.innerText?.substring(0, 50)
        });
      });
    } else {
      console.log(`Frame ${frameIndex}: 没有找到文件输入框`);
    }
  } catch (error) {
    console.log(`Frame ${frameIndex}: 跨域无法访问 - ${error.message}`);
  }
});

// 方法3：查找可能的拖拽上传区域
console.log('\n[方法3] 查找拖拽上传区域:');
const uploadAreas = document.querySelectorAll('[class*="upload"], [class*="drag"], [class*="drop"], [class*="import"]');
console.log(`找到 ${uploadAreas.length} 个上传相关区域:`);
uploadAreas.forEach((area, index) => {
  console.log(`  ${index + 1}. ${generateSelector(area)}`, {
    class: area.className,
    text: area.innerText?.substring(0, 100),
    onclick: typeof area.onclick === 'function'
  });

  // 检查区域内的文件输入框
  const areaInputs = area.querySelectorAll('input[type="file"]');
  if (areaInputs.length > 0) {
    console.log(`    → 内部文件输入框: ${areaInputs.length} 个`);
    areaInputs.forEach((input, i) => {
      console.log(`      ${i + 1}. ${generateSelector(input)}`);
    });
  }
});

// 方法4：查找带有点击事件的元素（可能是上传按钮）
console.log('\n[方法4] 查找可能的上传按钮:');
const clickableElements = document.querySelectorAll('button, .btn, [onclick], [class*="button"], [class*="upload"]');
console.log(`找到 ${clickableElements.length} 个可点击元素:`);

clickableElements.forEach((element, index) => {
  const text = element.innerText || element.textContent || '';
  if (text.includes('上传') || text.includes('导入') || text.includes('选择') || text.includes('添加')) {
    console.log(`  ${index + 1}. ${generateSelector(element)} - "${text.trim()}"`, {
      class: element.className,
      onclick: !!element.onclick,
      hasFileInput: element.querySelectorAll('input[type="file"]').length
    });
  }
});

// 方法5：全局搜索特定文本
console.log('\n[方法5] 搜索包含特定文本的元素:');
const searchTerms = ['点击', '拖拽', '批量导入', '上传图片', '选择文件'];
searchTerms.forEach(term => {
  const elements = document.querySelectorAll('*');
  const matches = Array.from(elements).filter(el =>
    (el.innerText || el.textContent || '').includes(term)
  );
  if (matches.length > 0) {
    console.log(`  "${term}": 找到 ${matches.length} 个元素`);
    matches.slice(0, 3).forEach((el, i) => {
      console.log(`    ${i + 1}. ${generateSelector(el)}`);
    });
  }
});

// 工具函数：生成CSS选择器
function generateSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }

  if (element.className) {
    const classes = element.className.split(' ').filter(c => c.trim());
    if (classes.length > 0) {
      return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
    }
  }

  return element.tagName.toLowerCase();
}

// 工具函数：获取iframe描述
function getFrameDescription(frame) {
  if (frame.id) return `id="${frame.id}"`;
  if (frame.className) return `class="${frame.className}"`;
  if (frame.src) return `src="${frame.src.split('/').pop()}"`;
  return 'unnamed';
}

console.log('\n=== 定位完成 ===');
console.log('💡 提示：找到合适的input[type="file"]后，使用以下selector在Playwright中上传:');
console.log('   await uploadFrame.locator("input[type=\\"file\\"]").setInputFiles(["/path/to/file.jpg"]);');