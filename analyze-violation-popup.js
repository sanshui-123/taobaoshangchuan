const { chromium } = require('playwright');

async function analyzeViolationPopup() {
  console.log('🔍 分析违规管控弹窗触发原因...');

  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    console.log('📸 拍摄当前违规弹窗状态...');
    await page.screenshot({
      path: 'violation-popup-analysis.png',
      fullPage: false,
      type: 'png'
    });

    // 检查违规管控弹窗
    const violationElements = await page.$$('div:has-text("违规"), div:has-text("管控"), div:has-text("中心")');
    console.log('违规相关元素数量:', violationElements.length);

    for (let i = 0; i < violationElements.length; i++) {
      const elem = violationElements[i];
      const isVisible = await elem.isVisible().catch(() => false);
      const textContent = await elem.textContent().catch(() => '');
      const boundingBox = await elem.boundingBox().catch(() => null);

      console.log(`违规元素 ${i+1}:`);
      console.log(`  可见: ${isVisible}`);
      console.log(`  位置: ${JSON.stringify(boundingBox)}`);
      console.log(`  内容: ${textContent.substring(0, 100)}`);

      if (isVisible) {
        // 获取元素的详细属性
        const elemInfo = await elem.evaluate(el => ({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          innerHTML: el.innerHTML.substring(0, 200),
          onclick: el.onclick ? el.onclick.toString() : null,
          style: {
            position: el.style.position,
            zIndex: el.style.zIndex,
            backgroundColor: el.style.backgroundColor
          }
        }));
        console.log(`  元素信息:`, elemInfo);
      }
    }

    // 检查所有可能的误点击区域
    console.log('🔍 检查页面上的可点击元素...');

    // 检查重要消息弹窗中可能的误点击
    const importantMessagePopup = await page.$('div:has-text("重要消息")');
    if (importantMessagePopup) {
      console.log('🎯 分析重要消息弹窗内的可点击元素...');

      const clickableElements = await importantMessagePopup.$$('button, a, [role="button"], .next-btn');
      console.log(`重要消息弹窗内找到 ${clickableElements.length} 个可点击元素`);

      for (let i = 0; i < clickableElements.length; i++) {
        const elem = clickableElements[i];
        const text = await elem.textContent().catch(() => '');
        const className = await elem.getAttribute('class').catch(() => '');
        const isVisible = await elem.isVisible().catch(() => false);

        console.log(`  元素${i+1}: text="${text}", class="${className}", visible=${isVisible}`);

        // 检查是否是关闭按钮之外的按钮
        if (text && !text.includes('关闭') && !text.includes('×') && !className.includes('close')) {
          console.log(`    ⚠️  这可能是误点击的按钮！`);
        }
      }
    }

    // 分析页面事件的监听器
    console.log('🔍 分析可能导致违规弹窗的页面元素...');

    // 查找可能触发违规检查的元素
    const suspiciousElements = await page.$$('button:has-text("查看详情"), button:has-text("去处理"), button:has-text("立即处理"), a:has-text("详情")');
    console.log('可疑元素数量:', suspiciousElements.length);

    for (let i = 0; i < suspiciousElements.length; i++) {
      const elem = suspiciousElements[i];
      const text = await elem.textContent().catch(() => '');
      const isVisible = await elem.isVisible().catch(() => false);
      const boundingBox = await elem.boundingBox().catch(() => null);

      if (isVisible) {
        console.log(`可疑元素${i+1}: text="${text}", position=${JSON.stringify(boundingBox)}`);
      }
    }

    console.log('✅ 分析完成');

  } catch (error) {
    console.error('❌ 分析失败:', error.message);
  }
}

analyzeViolationPopup();