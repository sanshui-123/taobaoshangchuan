const { chromium } = require('playwright');

async function strictFolderCreationOnly() {
  const productId = 'C25291153';

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '📋';
    console.log(`${timestamp} StrictFolder: ${prefix} ${message}`);
  };

  const throwOnError = (message) => {
    log(`FATAL: ${message}`, 'error');
    process.exit(1);
  };

  try {
    log(`开始严格文件夹创建验证，目标ID: ${productId}`);
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

    if (!page) throwOnError('未找到素材库页面');
    log('已连接到素材库页面');

    // 步骤1：清理所有弹窗
    log('清理所有干扰弹窗');
    await page.evaluate(() => {
      // 强制关闭所有弹窗
      for (let i = 0; i < 10; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }

      // 隐藏所有搜索面板
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if (el.textContent && el.textContent.includes('如何设置电子发票')) {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
        }
      }
    });

    await page.waitForTimeout(2000);

    // 步骤2：检查C25291153是否已存在
    log(`步骤1：检查${productId}文件夹是否已存在`);
    const folderExists = await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      return nodes.some(el => el.textContent && el.textContent.includes(targetId));
    }, productId);

    if (folderExists) {
      log(`✅ ${productId}文件夹已存在，跳过创建`);
    } else {
      log(`⚠️ ${productId}文件夹不存在，开始创建流程`);
    }

    // 步骤3：如果文件夹不存在，创建文件夹
    if (!folderExists) {
      log(`步骤2：开始创建${productId}文件夹`);

      // 确保2026节点展开
      log('确保2026节点已展开');
      await page.evaluate(() => {
        const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
          .find(el => el.textContent && el.textContent.includes('2026'));
        if (node2026) {
          node2026.click();
        }
      });

      await page.waitForTimeout(2000);

      // 点击新建文件夹按钮
      log('点击新建文件夹按钮');
      const newFolderClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const button of buttons) {
          const text = button.textContent || '';
          if (text.includes('新建文件夹')) {
            button.click();
            return true;
          }
        }
        return false;
      });

      if (!newFolderClicked) throwOnError('无法点击新建文件夹按钮');

      await page.waitForTimeout(3000);

      // 等待新建文件夹弹窗出现
      const dialogAppeared = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.next-dialog');
        return Array.from(dialogs).some(dialog =>
          dialog.textContent && dialog.textContent.includes('新建文件夹')
        );
      });

      if (!dialogAppeared) throwOnError('新建文件夹弹窗未出现');

      log('检测到新建文件夹弹窗');

      // 在弹窗中输入文件夹名称
      log(`在弹窗中输入文件夹名称: ${productId}`);

      // 方法1：找到输入框并输入
      const inputSuccess = await page.evaluate((folderName) => {
        const inputs = document.querySelectorAll('.next-dialog input');
        for (const input of inputs) {
          try {
            input.click();
            input.value = '';
            input.focus();

            // 使用多种方式输入文本
            input.value = folderName;
            input.dispatchEvent(new Event('input', { bubbles: true }));

            // 验证输入是否成功
            if (input.value === folderName) {
              return true;
            }

            // 如果value属性验证失败，尝试输入
            for (const char of folderName) {
              input.dispatchEvent(new KeyboardEvent('keydown', { key: char }));
              input.dispatchEvent(new KeyboardEvent('keypress', { key: char }));
              input.dispatchEvent(new KeyboardEvent('input', { key: char }));
            }

            return input.value === folderName;
          } catch (e) {
            continue;
          }
        }
        return false;
      }, productId);

      if (!inputSuccess) throwOnError(`无法在弹窗中输入文件夹名称: ${productId}`);

      log(`✅ 成功输入文件夹名称: ${productId}`);

      // 点击确定按钮
      const confirmClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('.next-dialog button'));
        for (const button of buttons) {
          const text = button.textContent || '';
          if (text.includes('确定') || text.includes('创建')) {
            button.click();
            return true;
          }
        }
        return false;
      });

      if (!confirmClicked) throwOnError('无法点击确定按钮');

      // 按回车确认
      await page.keyboard.press('Enter');

      // 等待弹窗关闭
      log('等待弹窗关闭...');
      let dialogClosed = false;
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(500);
        const stillOpen = await page.evaluate(() => {
          const dialogs = document.querySelectorAll('.next-dialog');
          return Array.from(dialogs).some(dialog =>
            dialog.textContent && dialog.textContent.includes('新建文件夹')
          );
        });

        if (!stillOpen) {
          dialogClosed = true;
          break;
        }
      }

      if (!dialogClosed) {
        log('弹窗未自动关闭，强制关闭');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }

      log('✅ 文件夹创建流程完成');
    }

    // 步骤4：等待页面更新并验证文件夹创建成功
    log('步骤3：验证文件夹创建成功');
    await page.waitForTimeout(3000);

    // 刷新页面确保新文件夹显示
    log('刷新页面确保新文件夹显示');
    await page.reload();
    await page.waitForTimeout(5000);

    // 展开2026
    log('刷新后展开2026节点');
    await page.evaluate(() => {
      const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
        .find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
      }
    });

    await page.waitForTimeout(2000);

    // 验证文件夹现在存在
    const finalFolderExists = await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      return nodes.some(el => el.textContent && el.textContent.includes(targetId));
    }, productId);

    if (!finalFolderExists) {
      throwOnError(`${productId}文件夹创建失败，刷新后仍未找到`);
    }

    log(`✅ ${productId}文件夹创建成功并可见`);

    // 步骤5：严格导航验证 - 必须看到面包屑包含/C25291153
    log('步骤4：严格导航验证');
    let navigationSuccess = false;
    const maxNavAttempts = 5;

    for (let attempt = 1; attempt <= maxNavAttempts; attempt++) {
      log(`导航尝试 ${attempt}/${maxNavAttempts}: 点击${productId}节点`);

      // 点击目标节点
      const nodeClicked = await page.evaluate((targetId) => {
        const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
        const targetNode = nodes.find(el => el.textContent && el.textContent.includes(targetId));
        if (targetNode) {
          targetNode.click();
          return true;
        }
        return false;
      }, productId);

      if (!nodeClicked) {
        log(`❌ 第${attempt}次：未找到${productId}节点`);
        continue;
      }

      log(`✅ 第${attempt}次：成功点击${productId}节点`);

      // 等待面包屑更新
      await page.waitForTimeout(3000);

      // 严格检查面包屑
      const currentBreadcrumb = await page.evaluate(() => {
        const breadcrumb = document.querySelector('.next-breadcrumb');
        return breadcrumb ? breadcrumb.textContent.trim() : '';
      });

      log(`第${attempt}次：当前面包屑 - ${currentBreadcrumb}`);

      // 严格验证：必须包含"全部图片 / 2026 / ${productId}"
      const expectedBreadcrumb = `全部图片 / 2026 / ${productId}`;
      if (currentBreadcrumb === expectedBreadcrumb || currentBreadcrumb.includes(expectedBreadcrumb)) {
        log(`🎉 第${attempt}次：面包屑严格验证成功！`, 'success');
        log(`✅ 严格验证通过：${currentBreadcrumb}`);
        navigationSuccess = true;
        break;
      } else {
        log(`❌ 第${attempt}次：面包屑严格验证失败`);
        log(`   期望: ${expectedBreadcrumb}`);
        log(`   实际: ${currentBreadcrumb}`);

        if (attempt === maxNavAttempts) {
          throwOnError(`经过${maxNavAttempts}次尝试，面包屑严格验证失败`);
        }

        // 继续下一次尝试前重新展开2026
        log('重新展开2026节点重试');
        await page.evaluate(() => {
          const node2026 = Array.from(document.querySelectorAll('li.next-tree-node'))
            .find(el => el.textContent && el.textContent.includes('2026'));
          if (node2026) {
            node2026.click();
          }
        });
        await page.waitForTimeout(1000);
      }
    }

    if (!navigationSuccess) {
      throwOnError(`${productId}文件夹导航验证失败`);
    }

    // 最终截图验证
    log('📸 最终截图验证成功状态');
    await page.screenshot({
      path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/${productId}-folder-creation-success.png`,
      fullPage: true
    });

    log(`🎉 严格文件夹创建和导航验证完全成功！`, 'success');
    log(`✅ 目标面包屑: 全部图片 / 2026 / ${productId}`);
    log(`✅ 可以开始后续上传步骤`);
    log(`📸 截图已保存: ${productId}-folder-creation-success.png`);

    await browser.close();
  } catch (error) {
    log(`严格验证失败: ${error.message}`, 'error');
    process.exit(1);
  }
}

strictFolderCreationOnly();