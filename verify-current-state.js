const { chromium } = require('playwright');

async function verifyCurrentState() {
  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();

    let page = null;
    for (const context of contexts) {
      const pages = context.pages();
      for (const p of pages) {
        if (p.url().includes('taobao.com') && p.url().includes('material-center')) {
          page = p;
          break;
        }
      }
      if (page) break;
    }

    if (!page) {
      console.log('未找到素材库页面');
      return;
    }

    console.log('=== 验证当前页面状态 ===');

    // 检查面包屑
    const breadcrumb = await page.$('.next-breadcrumb');
    if (breadcrumb) {
      const breadcrumbText = await breadcrumb.textContent();
      console.log(`📍 当前面包屑: ${breadcrumbText.trim()}`);

      if (breadcrumbText.includes('C25291153')) {
        console.log('✅ 面包屑正确：在C25291153文件夹');
      } else {
        console.log('❌ 面包屑错误：不在C25291153文件夹');
      }
    }

    // 检查搜索面板状态
    const visiblePanels = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      let visible = 0;
      for (const el of elements) {
        if (el.textContent && el.textContent.includes('如何设置电子发票')) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            visible++;
          }
        }
      }
      return visible;
    });

    console.log(`🔍 搜索面板状态: ${visiblePanels} 个可见元素`);
    if (visiblePanels === 0) {
      console.log('✅ 搜索面板已清理');
    } else {
      console.log('❌ 仍有搜索面板可见');
    }

    // 检查右侧内容区域
    const contentArea = await page.$('.PicturesShow_PicturesShow_main');
    if (contentArea) {
      const contentText = await contentArea.textContent();

      // 检查是否有"暂无图片"
      if (contentText.includes('暂无图片')) {
        console.log('📁 文件夹状态: 暂无图片');
      } else {
        console.log('📁 文件夹状态: 有内容');

        // 检查是否有color_*.jpg文件
        const hasColorFiles = contentText.includes('color_') && contentText.includes('.jpg');
        console.log(`   包含color_*.jpg文件: ${hasColorFiles ? '是' : '否'}`);

        // 提取一些内容预览
        const preview = contentText.trim().substring(0, 200);
        console.log(`   内容预览: ${preview}...`);
      }
    }

    // 检查文件数量和列表
    const fileCount = await page.evaluate(() => {
      const fileElements = document.querySelectorAll('.PicturesShow_PicturesShow_main-document, [class*="document"]');
      return fileElements.length;
    });

    console.log(`📊 文件数量: ${fileCount} 个文件元素`);

    if (fileCount > 0) {
      console.log('🎉 C25291153测试可能已成功！');
    } else {
      console.log('⚠️ 未检测到文件，可能需要检查上传状态');
    }

    await browser.close();
  } catch (error) {
    console.error('验证失败:', error.message);
  }
}

verifyCurrentState();