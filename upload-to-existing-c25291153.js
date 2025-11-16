const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function uploadToExistingC25291153() {
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

    console.log('=== 上传文件到已存在的C25291153文件夹 ===');

    // 步骤1：确认当前在C25291153文件夹
    const breadcrumb = await page.$('.next-breadcrumb');
    if (breadcrumb) {
      const breadcrumbText = await breadcrumb.textContent();
      console.log(`当前面包屑: ${breadcrumbText.trim()}`);

      if (!breadcrumbText.includes('C25291153')) {
        console.log('❌ 不在C25291153文件夹，先导航过去');

        // 导航到C25291153
        await page.evaluate(() => {
          const node = Array.from(document.querySelectorAll('li.next-tree-node'))
            .find(el => el.textContent && el.textContent.includes('C25291153'));
          if (node) {
            node.click();
            return true;
          }
          return false;
        });

        await page.waitForTimeout(2000);

        // 再次检查面包屑
        const updatedBreadcrumb = await page.$('.next-breadcrumb');
        const updatedText = await updatedBreadcrumb.textContent();
        console.log(`导航后面包屑: ${updatedText.trim()}`);

        if (!updatedText.includes('C25291153')) {
          console.log('❌ 无法导航到C25291153文件夹');
          return;
        }
      }
    }

    console.log('✅ 确认在C25291153文件夹');

    // 步骤2：清理任何搜索面板
    console.log('清理搜索面板...');
    await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if (el.textContent && el.textContent.includes('如何设置电子发票')) {
          el.style.display = 'none';
        }
      }
    });

    // 步骤3：点击上传文件按钮
    console.log('点击上传文件按钮...');
    const uploadButton = await page.$('button:has-text("上传文件")');
    if (uploadButton) {
      await uploadButton.click();
      console.log('✅ 点击了上传文件按钮');
    } else {
      console.log('❌ 未找到上传文件按钮');
      return;
    }

    // 步骤4：等待上传对话框并选择文件
    await page.waitForTimeout(2000);
    console.log('查找文件输入框...');

    const fileInput = await page.evaluateHandle(() => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        const dialog = input.closest('.next-dialog');
        if (dialog && dialog.textContent.includes('上传素材')) {
          return input;
        }
      }
      return null;
    });

    if (fileInput) {
      const productId = 'C25291153';
      const imagePath = `/Users/sanshui/Desktop/tbzhuaqu/assets/${productId}`;
      const files = fs.readdirSync(imagePath).filter(f => f.startsWith('color_') && f.endsWith('.jpg'));

      console.log(`找到 ${files.length} 个图片文件`);

      if (files.length > 0) {
        // 上传前3个文件进行测试
        const testFiles = files.slice(0, 3);
        console.log(`上传测试文件: ${testFiles.join(', ')}`);

        await fileInput.setInputFiles(testFiles.map(f => path.join(imagePath, f)));
        console.log('✅ 文件已选择，等待上传完成');

        // 等待上传完成
        await page.waitForTimeout(5000);

        // 验证上传结果
        const fileCount = await page.evaluate(() => {
          const fileElements = document.querySelectorAll('.PicturesShow_PicturesShow_main-document, [class*="document"]');
          return fileElements.length;
        });

        console.log(`上传完成，检测到 ${fileCount} 个文件元素`);

        if (fileCount > 0) {
          console.log('🎉 C25291153文件上传成功！');
        } else {
          console.log('⚠️ 未检测到上传的文件，可能需要更长时间处理');
        }
      } else {
        console.log('❌ 未找到color_*.jpg文件');
      }
    } else {
      console.log('❌ 未找到文件输入框');
    }

    await browser.close();
  } catch (error) {
    console.error('上传失败:', error.message);
  }
}

uploadToExistingC25291153();