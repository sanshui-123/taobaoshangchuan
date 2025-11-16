const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function uploadSingleFilesToC25291153() {
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

    console.log('=== 逐个上传文件到C25291153 ===');

    // 确认在C25291153文件夹
    const breadcrumb = await page.$('.next-breadcrumb');
    if (breadcrumb) {
      const breadcrumbText = await breadcrumb.textContent();
      console.log(`当前面包屑: ${breadcrumbText.trim()}`);

      if (!breadcrumbText.includes('C25291153')) {
        console.log('不在C25291153文件夹，先导航过去');
        // 导航逻辑...
      }
    }

    console.log('✅ 确认在C25291153文件夹');

    // 获取文件列表
    const productId = 'C25291153';
    const imagePath = `/Users/sanshui/Desktop/tbzhuaqu/assets/${productId}`;
    const files = fs.readdirSync(imagePath).filter(f => f.startsWith('color_') && f.endsWith('.jpg'));

    console.log(`找到 ${files.length} 个图片文件`);

    // 逐个上传文件
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`\n--- 上传第 ${i + 1}/${files.length} 个文件: ${file} ---`);

      try {
        // 清理现有弹窗
        await page.evaluate(() => {
          const dialogs = document.querySelectorAll('.next-dialog');
          dialogs.forEach(dialog => {
            const style = window.getComputedStyle(dialog);
            if (style.display !== 'none') {
              dialog.style.display = 'none';
            }
          });
        });

        // 点击上传文件按钮
        console.log('点击上传文件按钮...');
        const uploadClicked = await page.evaluate(() => {
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

        if (!uploadClicked) {
          console.log('❌ 无法点击上传文件按钮');
          break;
        }

        // 等待上传对话框
        console.log('等待上传对话框...');
        await page.waitForTimeout(2000);

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
          // 单文件上传
          await fileInput.setInputFiles(path.join(imagePath, file));
          console.log(`✅ 文件 ${file} 已选择`);

          // 等待上传完成
          console.log('等待5秒让单个文件上传完成...');
          await page.waitForTimeout(5000);

          console.log(`✅ 文件 ${file} 上传完成`);

        } else {
          console.log(`❌ 未找到文件输入框，跳过文件 ${file}`);
        }

      } catch (error) {
        console.log(`❌ 上传文件 ${file} 失败: ${error.message}`);
        continue;
      }
    }

    console.log('\n=== 所有文件上传完成 ===');

    // 刷新页面验证
    console.log('刷新页面验证上传结果...');
    await page.reload();
    await page.waitForTimeout(5000);

    // 重新导航到C25291153
    console.log('重新导航到C25291153验证...');
    await page.evaluate(() => {
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

    const finalBreadcrumb = await page.$('.next-breadcrumb');
    const finalBreadcrumbText = await finalBreadcrumb.textContent();

    console.log(`最终面包屑: ${finalBreadcrumbText.trim()}`);
    console.log(`最终文件数量: ${finalFileCount}`);

    // 检查是否有color_*.jpg文件
    const hasColorFiles = await page.evaluate(() => {
      const content = document.querySelector('.PicturesShow_PicturesShow_main');
      return content ? content.textContent.includes('color_') && content.textContent.includes('.jpg') : false;
    });

    console.log(`包含color_*.jpg文件: ${hasColorFiles ? '是' : '否'}`);

    // 截图
    await page.screenshot({
      path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/c25291153-color-files-result.png`,
      fullPage: true
    });

    console.log('✅ 截图已保存: c25291153-color-files-result.png');

    await browser.close();
  } catch (error) {
    console.error('逐个上传失败:', error.message);
  }
}

uploadSingleFilesToC25291153();