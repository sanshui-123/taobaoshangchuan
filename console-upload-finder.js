// 淘宝素材库文件上传input快速定位器 - 复制到浏览器控制台运行
(function() {
  console.log('🔍 开始定位文件上传input...');

  // 查找主页面文件输入框
  const mainInputs = document.querySelectorAll('input[type="file"]');
  console.log(`主页面文件输入框: ${mainInputs.length} 个`);

  // 检查所有iframe
  const frames = document.querySelectorAll('iframe, frame');
  console.log(`检查 ${frames.length} 个iframe...`);

  let foundInFrame = false;
  frames.forEach((frame, i) => {
    try {
      const frameInputs = frame.contentDocument?.querySelectorAll('input[type="file"]') || [];
      if (frameInputs.length > 0) {
        console.log(`✅ Frame ${i} 找到 ${frameInputs.length} 个文件输入框:`);
        frameInputs.forEach((input, j) => {
          console.log(`  Frame ${i}-${j}: ${generateSelector(input)}`);
          console.log(`    类名: ${input.className}`);
          console.log(`    ID: ${input.id}`);
          console.log(`    多文件: ${input.multiple}`);
        });
        foundInFrame = true;
      }
    } catch(e) {
      // 跨域iframe，忽略
    }
  });

  // 查找拖拽区域
  const dragAreas = document.querySelectorAll('[class*="upload"], [class*="drag"], [class*="drop"]');
  console.log(`上传相关区域: ${dragAreas.length} 个`);

  // 查找上传按钮
  const uploadButtons = Array.from(document.querySelectorAll('button, .btn, [onclick]')).filter(
    el => (el.innerText || '').includes('上传') || (el.innerText || '').includes('导入')
  );
  console.log(`上传按钮: ${uploadButtons.length} 个`);

  function generateSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.className) return `${el.tagName.toLowerCase()}.${el.className.split(' ').join('.')}`;
    return el.tagName.toLowerCase();
  }

  console.log('🔍 定位完成！');
  console.log('📝 找到合适的input后，使用: frame.locator("input[type=file]").setInputFiles(["文件路径"])');
})();