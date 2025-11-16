const { chromium } = require('playwright');

async function finalFolderCreation() {
  const productId = 'C25291153';

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔧';
    console.log(`${timestamp} FinalFolder: ${prefix} ${message}`);
  };

  try {
    log(`开始最终文件夹创建流程，目标ID: ${productId}`);
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
      log('未找到素材库页面');
      return;
    }

    log('已连接到素材库页面');

    // 清理弹窗
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
    });

    await page.waitForTimeout(1000);

    log('打开新建文件夹弹窗...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const button of buttons) {
        const text = button.textContent || '';
        if (text.includes('新建文件夹')) {
          button.click();
        }
      }
    });

    await page.waitForTimeout(3000);

    // 步骤1：点击上级文件夹选择器
    log('=== 步骤1：打开上级文件夹下拉列表 ===');

    await page.evaluate(() => {
      // 使用我们分析出的准确选择器
      const selector = document.querySelector('span.next-select-trigger.next-select-single');
      if (selector && selector.textContent.includes('全部图片')) {
        console.log('找到上级文件夹选择器，点击打开下拉列表');
        selector.click();
        return true;
      }
      return false;
    });

    await page.waitForTimeout(2000); // 等待下拉列表展开

    // 步骤2：查找并点击2026选项
    log('=== 步骤2：查找并选择2026 ===');

    const optionFound = await page.evaluate(() => {
      console.log('开始查找2026选项...');

      // 方法1：查找下拉菜单中的所有选项
      const dropdowns = document.querySelectorAll('.next-select-menu, .next-overlay-wrapper, .next-select-dropdown');
      console.log(`找到${dropdowns.length}个下拉菜单`);

      for (const dropdown of dropdowns) {
        if (dropdown.offsetWidth > 0 && dropdown.offsetHeight > 0) {
          console.log('检查可见的下拉菜单...');

          // 在下拉菜单中查找2026选项
          const options = dropdown.querySelectorAll('li, div, [role="option"], .next-tree-node, .next-select-menu-item');
          console.log(`下拉菜单中有${options.length}个选项`);

          for (let i = 0; i < options.length; i++) {
            const option = options[i];
            const text = option.textContent || '';
            console.log(`选项${i}: "${text}"`);

            if (text.includes('2026')) {
              console.log(`找到2026选项，点击: ${option.tagName}.${option.className}`);
              option.click();
              return true;
            }
          }
        }
      }

      // 方法2：在整个页面中查找2026相关的可点击元素
      console.log('方法1失败，尝试方法2：在整个页面中查找2026元素');
      const allElements = document.querySelectorAll('*');
      for (const element of allElements) {
        const text = element.textContent || '';
        const className = element.className || '';

        // 查找包含2026的可点击元素，且具有下拉菜单的特征
        if (text.includes('2026') &&
            (className.includes('tree') || className.includes('select') || className.includes('menu')) &&
            element.offsetWidth > 0 && element.offsetHeight > 0) {

          console.log(`找到2026相关元素: ${element.tagName}.${className}`);
          // 查找其父元素中的可点击项
          const clickableItems = element.querySelectorAll('li, div[role="option"], .next-tree-node');
          for (const item of clickableItems) {
            if (item.textContent && item.textContent.includes('2026')) {
              console.log(`点击2026项目: ${item.tagName}.${item.className}`);
              item.click();
              return true;
            }
          }
        }
      }

      console.log('未找到任何2026选项');
      return false;
    });

    if (optionFound) {
      log('✅ 成功选择2026选项');
    } else {
      log('❌ 无法找到2026选项');
      throw new Error('无法找到2026选项作为上级文件夹');
    }

    await page.waitForTimeout(2000); // 等待选择生效

    // 步骤3：验证上级文件夹设置
    log('=== 步骤3：验证上级文件夹设置 ===');

    const parentVerified = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const text = dialog.textContent;
          console.log(`弹窗文本: ${text}`);

          // 检查是否包含2026
          if (text.includes('2026')) {
            console.log('✅ 确认上级文件夹包含2026');
            return true;
          } else {
            console.log('❌ 上级文件夹不包含2026');
            return false;
          }
        }
      }
      return false;
    });

    if (!parentVerified) {
      log('❌ 上级文件夹设置验证失败');
      throw new Error('上级文件夹必须设置为2026');
    }

    log('✅ 上级文件夹设置验证成功');

    // 步骤4：输入文件夹名称
    log('=== 步骤4：输入文件夹名称 ===');

    const inputSuccess = await page.evaluate((folderName) => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          // 查找输入框（根据我们的分析，是第二个输入框）
          const inputs = dialog.querySelectorAll('input');
          console.log(`找到${inputs.length}个输入框`);

          // 查找文件夹名称输入框（不是搜索框）
          for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const placeholder = input.placeholder || '';
            const value = input.value || '';

            console.log(`输入框${i}: placeholder="${placeholder}" value="${value}" width=${input.offsetWidth}`);

            // 跳过搜索框（通常很小或无内容），找到主输入框
            if (input.offsetWidth > 50 && !placeholder.includes('搜索')) {
              console.log(`使用输入框${i}输入文件夹名称`);
              input.focus();
              input.select();
              input.value = folderName;

              // 触发事件
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));

              // 验证
              if (input.value === folderName) {
                console.log(`✅ 输入成功: ${folderName}`);
                return true;
              }
            }
          }
        }
      }
      return false;
    }, productId);

    if (!inputSuccess) {
      throw new Error(`无法输入文件夹名称: ${productId}`);
    }

    log(`✅ 成功输入文件夹名称: ${productId}`);

    // 步骤5：点击确定按钮并关闭弹窗
    log('=== 步骤5：点击确定按钮 ===');

    await page.evaluate(() => {
      const buttons = document.querySelectorAll('.next-dialog button');
      for (const button of buttons) {
        const text = button.textContent || '';
        if (text.includes('确定') || text.includes('创建')) {
          console.log('点击确定按钮');
          button.click();
          break;
        }
      }
    });

    await page.keyboard.press('Enter');
    log('按回车确认');

    // 等待弹窗关闭
    log('等待弹窗关闭...');
    let dialogClosed = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      const stillOpen = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.next-dialog');
        return Array.from(dialogs).some(dialog =>
          dialog.textContent && dialog.textContent.includes('新建文件夹')
        );
      });

      if (!stillOpen) {
        dialogClosed = true;
        log('✅ 弹窗已关闭');
        break;
      }
    }

    if (!dialogClosed) {
      log('⚠️ 弹窗未自动关闭，强制关闭');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }

    // 步骤6：验证文件夹创建成功
    log('=== 步骤6：验证文件夹创建成功 ===');

    await page.reload();
    await page.waitForTimeout(5000);

    // 展开2026节点
    await page.evaluate(() => {
      const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
        .find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
        console.log('点击2026节点展开');
      }
    });

    await page.waitForTimeout(2000);

    // 检查文件夹是否存在
    const folderExists = await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      console.log(`检查${targetId}文件夹是否存在...`);

      for (const node of nodes) {
        const text = node.textContent || '';
        if (text.includes(targetId)) {
          console.log(`找到目标文件夹: ${text}`);
          return true;
        }
      }
      return false;
    }, productId);

    if (folderExists) {
      log(`🎉 文件夹创建成功！${productId}文件夹已创建在2026节点下`);

      // 导航到文件夹
      await page.evaluate((targetId) => {
        const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
        const targetNode = nodes.find(el => el.textContent && el.textContent.includes(targetId));
        if (targetNode) {
          targetNode.click();
          console.log(`点击${targetId}文件夹`);
        }
      }, productId);

      await page.waitForTimeout(3000);

      // 检查面包屑
      const breadcrumb = await page.evaluate(() => {
        const breadcrumb = document.querySelector('.next-breadcrumb');
        return breadcrumb ? breadcrumb.textContent.trim() : '';
      });

      log(`最终面包屑: ${breadcrumb}`);

      if (breadcrumb.includes('2026') && breadcrumb.includes(productId)) {
        log(`🎉 面包屑验证成功！文件夹创建和导航都正确`);

        // 截图保存
        await page.screenshot({
          path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/${productId}-final-creation-success.png`,
          fullPage: true
        });

        log(`📸 截图已保存: ${productId}-final-creation-success.png`);
        log(`✅ 最终文件夹创建完全成功！C25291153文件夹已创建，可以开始上传步骤了`);

        await browser.close();
        return true;
      } else {
        log(`❌ 面包屑验证失败: ${breadcrumb}`);
        throw new Error(`面包屑验证失败: ${breadcrumb}`);
      }
    } else {
      throw new Error(`${productId}文件夹创建失败`);
    }

  } catch (error) {
    log(`最终文件夹创建失败: ${error.message}`, 'error');
    process.exit(1);
  }
}

finalFolderCreation();