/**
 * 调试脚本：查找素材库面板中的搜索框
 * 用于确定正确的 selector
 */

const { chromium } = require('playwright');

async function findSearchBox() {
  console.log('🔍 开始查找搜索框...\n');

  try {
    // 连接到现有浏览器
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const contexts = browser.contexts();
    const context = contexts[0];
    const pages = context.pages();
    const page = pages.find(p => p.url().includes('upload.taobao.com')) || pages[0];

    console.log(`📄 当前页面: ${page.url()}\n`);

    // 查找所有输入框
    console.log('📋 查找所有输入框...\n');

    // 方式1：在主页面查找
    console.log('1️⃣ 在主页面中查找：');
    const inputsInPage = await page.locator('input').all();
    console.log(`   找到 ${inputsInPage.length} 个输入框\n`);

    for (let i = 0; i < Math.min(inputsInPage.length, 10); i++) {
      try {
        const placeholder = await inputsInPage[i].getAttribute('placeholder');
        const id = await inputsInPage[i].getAttribute('id');
        const className = await inputsInPage[i].getAttribute('class');
        const name = await inputsInPage[i].getAttribute('name');

        console.log(`   输入框 ${i + 1}:`);
        if (placeholder) console.log(`     placeholder: "${placeholder}"`);
        if (id) console.log(`     id: "${id}"`);
        if (className) console.log(`     class: "${className}"`);
        if (name) console.log(`     name: "${name}"`);
        console.log('');
      } catch (e) {
        // 跳过无法访问的输入框
      }
    }

    // 方式2：在所有 iframe 中查找
    const iframeCount = await page.locator('iframe').count();
    console.log(`\n2️⃣ 检测到 ${iframeCount} 个 iframe\n`);

    for (let i = 0; i < iframeCount; i++) {
      console.log(`   检查 iframe ${i + 1}:`);
      try {
        const frame = page.frameLocator('iframe').nth(i);
        const inputsInFrame = await frame.locator('input').all();
        console.log(`     找到 ${inputsInFrame.length} 个输入框`);

        // 查找包含"文件夹"关键词的输入框
        for (let j = 0; j < Math.min(inputsInFrame.length, 5); j++) {
          try {
            const placeholder = await inputsInFrame[j].getAttribute('placeholder');
            if (placeholder && placeholder.includes('文件夹')) {
              console.log(`\n     ✅ 找到目标输入框！`);
              console.log(`       iframe: ${i + 1}`);
              console.log(`       placeholder: "${placeholder}"`);

              const id = await inputsInFrame[j].getAttribute('id');
              const className = await inputsInFrame[j].getAttribute('class');
              const name = await inputsInFrame[j].getAttribute('name');

              if (id) console.log(`       id: "${id}"`);
              if (className) console.log(`       class: "${className}"`);
              if (name) console.log(`       name: "${name}"`);

              console.log(`\n     📝 建议的 selector:`);
              console.log(`       input[placeholder="${placeholder}"]`);
              if (id) console.log(`       #${id}`);
              if (className) {
                const firstClass = className.split(' ')[0];
                console.log(`       input.${firstClass}`);
              }
            }
          } catch (e) {
            // 跳过
          }
        }
        console.log('');
      } catch (e) {
        console.log(`     无法访问此 iframe\n`);
      }
    }

    // 特定查找：包含"文件夹"的输入框
    console.log('\n3️⃣ 专门查找包含"文件夹"的输入框：\n');

    // 在主页面
    try {
      const folderInputs = await page.locator('input[placeholder*="文件夹"]').all();
      if (folderInputs.length > 0) {
        console.log(`   ✅ 在主页面找到 ${folderInputs.length} 个匹配的输入框`);
        for (let i = 0; i < folderInputs.length; i++) {
          const placeholder = await folderInputs[i].getAttribute('placeholder');
          console.log(`     ${i + 1}. placeholder: "${placeholder}"`);
        }
      } else {
        console.log('   ❌ 主页面中未找到');
      }
    } catch (e) {
      console.log('   ❌ 主页面查找失败');
    }

    // 在第一个 iframe
    if (iframeCount > 0) {
      try {
        const frame = page.frameLocator('iframe').first();
        const folderInputs = await frame.locator('input[placeholder*="文件夹"]').all();
        if (folderInputs.length > 0) {
          console.log(`\n   ✅ 在第一个 iframe 找到 ${folderInputs.length} 个匹配的输入框`);
          for (let i = 0; i < folderInputs.length; i++) {
            const placeholder = await folderInputs[i].getAttribute('placeholder');
            console.log(`     ${i + 1}. placeholder: "${placeholder}"`);
          }
        } else {
          console.log('\n   ❌ 第一个 iframe 中未找到');
        }
      } catch (e) {
        console.log('\n   ❌ iframe 查找失败:', e.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 调试完成');
    console.log('='.repeat(60));

    await browser.close();

  } catch (error) {
    console.error('\n❌ 调试失败:', error.message);
    process.exit(1);
  }
}

// 运行调试
findSearchBox().catch(error => {
  console.error('执行失败:', error);
  process.exit(1);
});
