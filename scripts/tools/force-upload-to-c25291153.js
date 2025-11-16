const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function forceUploadToC25291153() {
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

    console.log('=== 强制上传到C25291153 ===');

    // 确认在C25291153文件夹
    const breadcrumb = await page.$('.next-breadcrumb');
    if (breadcrumb) {
      const breadcrumbText = await breadcrumb.textContent();
      console.log(`当前面包屑: ${breadcrumbText.trim()}`);

      if (!breadcrumbText.includes('C25291153')) {
        console.log('不在C25291153文件夹，先导航过去');

        await page.evaluate(() => {
          // 先展开2026
          const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
            .find(el => el.textContent && el.textContent.includes('2026'));
          if (node2026) {
            node2026.click();
          }
        });

        await page.waitForTimeout(1000);

        // 点击C25291153
        await page.evaluate(() => {
          const nodeC25291153 = Array.from(document.querySelectorAll('li.next-tree-node'))
            .find(el => el.textContent && el.textContent.includes('C25291153'));
          if (nodeC25291153) {
            nodeC25291153.click();
          }
        });

        await page.waitForTimeout(2000);

        // 再次验证面包屑
        const newBreadcrumb = await page.$('.next-breadcrumb');
        const newText = await newBreadcrumb.textContent();
        console.log(`导航后面包屑: ${newText.trim()}`);

        if (!newText.includes('C25291153')) {
          console.log('❌ 无法导航到C25291153文件夹');
          return;
        }
      }
    }

    console.log('✅ 确认在C25291153文件夹');

    // 强制点击上传文件按钮 - 使用多种方法
    console.log('强制寻找并点击上传文件按钮...');

    let uploadClicked = false;

    // 方法1：标准选择器
    const standardSelectors = [
      'button:has-text("上传文件")',
      'button:has-text("上传")',
      '[class*="upload"]',
      '[class*="Upload"]'
    ];

    for (const selector of standardSelectors) {
      try {
        const buttons = await page.$$(selector);
        for (const button of buttons) {
          try {
            const isVisible = await button.isVisible();
            if (isVisible) {
              await button.click();
              console.log(`✅ 方法1成功：使用选择器 ${selector}`);
              uploadClicked = true;
              break;
            }
          } catch (e) {
            continue;
          }
        }
        if (uploadClicked) break;
      } catch (e) {
        continue;
      }
    }

    // 方法2：JavaScript强制点击
    if (!uploadClicked) {
      console.log('方法1失败，尝试JavaScript强制点击...');
      uploadClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const button of buttons) {
          const text = button.textContent || '';
          if (text.includes('上传文件') || text.includes('上传')) {
            button.click();
            return true;
          }
        }
        return false;
      });

      if (uploadClicked) {
        console.log('✅ 方法2成功：JavaScript强制点击');
      }
    }

    // 方法3：键盘导航
    if (!uploadClicked) {
      console.log('方法2失败，尝试键盘导航...');

      // 尝试Tab键导航到上传按钮
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');

      await page.waitForTimeout(1000);

      // 检查是否有上传对话框出现
      const hasDialog = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.next-dialog');
        return Array.from(dialogs).some(dialog =>
          dialog.textContent && dialog.textContent.includes('上传素材')
        );
      });

      if (hasDialog) {
        console.log('✅ 方法3成功：键盘导航打开上传对话框');
        uploadClicked = true;
      }
    }

    // 方法4：模拟鼠标坐标点击
    if (!uploadClicked) {
      console.log('方法3失败，尝试模拟鼠标坐标点击...');

      // 获取页面布局信息
      const layout = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button'));
        const uploadButtons = [];

        for (const element of elements) {
          const text = element.textContent || '';
          const rect = element.getBoundingClientRect();

          if (text.includes('上传文件') || text.includes('上传')) {
            uploadButtons.push({
              text: text.trim(),
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              width: rect.width,
              height: rect.height,
              visible: rect.width > 0 && rect.height > 0
            });
          }
        }

        return uploadButtons;
      });

      console.log(`找到 ${layout.length} 个上传按钮:`, layout);

      for (const buttonInfo of layout) {
        if (buttonInfo.visible) {
          await page.mouse.click(buttonInfo.x, buttonInfo.y);
          console.log(`✅ 方法4成功：鼠标坐标点击 ${buttonInfo.text}`);
          uploadClicked = true;
          break;
        }
      }
    }

    if (!uploadClicked) {
      console.log('❌ 所有方法都失败，无法点击上传按钮');
      return;
    }

    // 等待上传对话框
    console.log('等待上传对话框...');
    await page.waitForTimeout(3000);

    // 检查上传对话框
    const hasUploadDialog = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      return Array.from(dialogs).some(dialog =>
        dialog.textContent && dialog.textContent.includes('上传素材')
      );
    });

    if (!hasUploadDialog) {
      console.log('❌ 未检测到上传对话框');
      return;
    }

    console.log('✅ 上传对话框已打开');

    // 查找文件输入框
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
        const uploadFiles = files.slice(0, 3); // 上传前3个文件
        console.log(`上传文件: ${uploadFiles.join(', ')}`);

        await fileInput.setInputFiles(uploadFiles.map(f => path.join(imagePath, f)));
        console.log('✅ 文件已选择，等待上传完成');

        // 等待上传完成
        console.log('等待10秒让上传完成...');
        await page.waitForTimeout(10000);

        // 验证上传结果
        const fileCount = await page.evaluate(() => {
          const fileElements = document.querySelectorAll('.PicturesShow_PicturesShow_main-document, [class*="document"]');
          return fileElements.length;
        });

        console.log(`上传完成，检测到 ${fileCount} 个文件元素`);

        // 刷新页面验证
        console.log('刷新页面验证...');
        await page.reload();
        await page.waitForTimeout(5000);

        // 重新导航到C25291153
        console.log('重新导航到C25291153验证...');

        await page.evaluate(() => {
          // 展开2026
          const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
            .find(el => el.textContent && el.textContent.includes('2026'));
          if (node2026) {
            node2026.click();
          }
        });

        await page.waitForTimeout(1000);

        await page.evaluate(() => {
          const nodeC25291153 = Array.from(document.querySelectorAll('li.next-tree-node'))
            .find(el => el.textContent && el.textContent.includes('C25291153'));
          if (nodeC25291153) {
            nodeC25291153.click();
          }
        });

        await page.waitForTimeout(3000);

        // 最终验证
        const finalFileCount = await page.evaluate(() => {
          const fileElements = document.querySelectorAll('.PicturesShow_PicturesShow_main-document, [class*="document"]');
          return fileElements.length;
        });

        console.log(`最终验证：检测到 ${finalFileCount} 个文件元素`);

        // 截图
        await page.screenshot({
          path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/c25291153-final-result.png`,
          fullPage: true
        });

        console.log('✅ 上传完成，截图已保存: c25291153-final-result.png');

      } else {
        console.log('❌ 未找到color_*.jpg文件');
      }
    } else {
      console.log('❌ 未找到文件输入框');
    }

    await browser.close();
  } catch (error) {
    console.error('强制上传失败:', error.message);
  }
}

forceUploadToC25291153();