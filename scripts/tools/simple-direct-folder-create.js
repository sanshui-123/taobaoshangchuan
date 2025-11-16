const { chromium } = require('playwright');
const { closeMaterialCenterPopups } = require('../utils/advert-handler');

async function simpleDirectFolderCreate() {
  const productId = 'C25291153';

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔧';
    console.log(`${timestamp} SimpleCreate: ${prefix} ${message}`);
  };

  const takeErrorScreenshot = async (page, stepName) => {
    try {
      const screenshotPath = `/Users/sanshui/Desktop/.claude/claude-code-chat-images/error-${stepName}-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      log(`📸 错误截图已保存: ${screenshotPath}`, 'error');
      return screenshotPath;
    } catch (screenshotError) {
      log(`截图失败: ${screenshotError.message}`, 'error');
      return null;
    }
  };

  try {
    log(`开始简单直接文件夹创建，目标ID: ${productId}`);

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
      throw new Error('未找到素材库页面');
    }

    log('已连接到素材库页面');

    // 步骤1：移除搜索面板
    log('移除搜索面板...');
    await closeMaterialCenterPopups(page, {
      forceRemoveSearchPanel: true,
      keepSearchPanelAlive: true
    });
    await page.waitForTimeout(2000);

    // 步骤2：打开新建文件夹弹窗
    log('打开新建文件夹弹窗...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const button of buttons) {
        const text = button.textContent || '';
        if (text.includes('新建文件夹')) {
          button.click();
          break;
        }
      }
    });

    await page.waitForTimeout(3000);

    // 验证弹窗
    const dialogVisible = await page.locator('.next-dialog:has-text("新建文件夹")').isVisible();
    if (!dialogVisible) {
      throw new Error('弹窗未打开');
    }

    log('弹窗已打开');

    // 步骤3：使用多种方法尝试点击上级文件夹选择器
    log('尝试点击上级文件夹选择器...');
    let selectorClicked = false;

    try {
      // 方法1：使用精确的locator
      await page.locator('.next-dialog:has-text("新建文件夹") span.next-select-trigger:has-text("全部图片")').first().click();
      selectorClicked = true;
      log('方法1成功');
    } catch (error1) {
      log(`方法1失败: ${error1.message}`);

      try {
        // 方法2：使用evaluate直接点击
        await page.evaluate(() => {
          const dialog = document.querySelector('.next-dialog:has-text("新建文件夹")');
          if (dialog) {
            const triggers = dialog.querySelectorAll('span.next-select-trigger');
            for (const trigger of triggers) {
              if (trigger.textContent && trigger.textContent.includes('全部图片')) {
                trigger.click();
                return true;
              }
            }
          }
          return false;
        });
        selectorClicked = true;
        log('方法2成功');
      } catch (error2) {
        log(`方法2失败: ${error2.message}`);

        try {
          // 方法3：使用鼠标坐标点击
          const triggerElement = await page.evaluate(() => {
            const dialog = document.querySelector('.next-dialog:has-text("新建文件夹")');
            if (dialog) {
              const triggers = dialog.querySelectorAll('span.next-select-trigger');
              for (const trigger of triggers) {
                if (trigger.textContent && trigger.textContent.includes('全部图片')) {
                  const rect = trigger.getBoundingClientRect();
                  return {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                    width: rect.width,
                    height: rect.height
                  };
                }
              }
            }
            return null;
          });

          if (triggerElement) {
            await page.mouse.click(triggerElement.x, triggerElement.y);
            selectorClicked = true;
            log('方法3成功');
          }
        } catch (error3) {
          log(`方法3失败: ${error3.message}`);
        }
      }
    }

    if (!selectorClicked) {
      throw new Error('无法点击上级文件夹选择器');
    }

    await page.waitForTimeout(3000);

    // 步骤4：使用文本搜索和坐标点击2026
    log('查找并点击2026节点...');

    const node2026Clicked = await page.evaluate(() => {
      console.log('开始搜索2026节点...');

      // 搜索所有可见的包含2026的元素
      const allElements = document.querySelectorAll('*');
      const candidates = [];

      for (const element of allElements) {
        const text = element.textContent || '';
        const rect = element.getBoundingClientRect();

        if (text.includes('2026') && rect.width > 0 && rect.height > 0) {
          candidates.push({
            element: element,
            text: text.trim(),
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            width: rect.width,
            height: rect.height,
            className: element.className || '',
            tagName: element.tagName,
            isClickable: element.tagName === 'LI' || element.tagName === 'DIV' || element.tagName === 'BUTTON' || element.className.includes('node') || element.className.includes('item')
          });
        }
      }

      console.log(`找到${candidates.length}个包含2026的可见元素:`);
      candidates.forEach((candidate, i) => {
        console.log(`  候选${i}: ${candidate.tagName}.${candidate.className} 位置(${Math.round(candidate.x)}, ${Math.round(candidate.y)}) 可点击:${candidate.isClickable} 文本:"${candidate.text}"`);
      });

      // 优先选择可点击的元素
      const clickableCandidates = candidates.filter(c => c.isClickable);
      console.log(`可点击的候选元素: ${clickableCandidates.length}个`);

      if (clickableCandidates.length > 0) {
        // 选择第一个可点击的元素
        const target = clickableCandidates[0];
        console.log(`选择目标: ${target.tagName}.${target.className} 位置(${target.x}, ${target.y})`);

        // 点击元素
        target.element.click();
        return {
          success: true,
          clicked: target.text,
          position: { x: target.x, y: target.y }
        };
      }

      // 如果没有可点击的元素，尝试点击任何包含2026的元素
      if (candidates.length > 0) {
        const target = candidates[0];
        console.log(`使用非可点击候选元素: ${target.tagName}.${target.className}`);

        // 尝试点击父元素
        let parent = target.element;
        for (let i = 0; i < 3; i++) {
          parent = parent.parentElement;
          if (parent && parent.offsetWidth > 0 && parent.offsetHeight > 0) {
            const parentRect = parent.getBoundingClientRect();
            parent.click();
            return {
              success: true,
              clicked: `父元素 of ${target.text}`,
              position: { x: parentRect.left + parentRect.width / 2, y: parentRect.top + parentRect.height / 2 }
            };
          }
        }
      }

      return { success: false, candidates: candidates.length };
    });

    if (!node2026Clicked.success) {
      throw new Error(`无法点击2026节点，找到${node2026Clicked.candidates}个候选元素但都无法点击`);
    }

    log(`✅ 已点击2026节点: ${node2026Clicked.clicked}`);
    await page.waitForTimeout(2000);

    // 步骤5：验证上级文件夹显示
    log('验证上级文件夹显示...');
    const parentFolderText = await page.evaluate(() => {
      const dialog = document.querySelector('.next-dialog:has-text("新建文件夹")');
      if (dialog) {
        const triggers = dialog.querySelectorAll('span.next-select-trigger');
        for (const trigger of triggers) {
          if (trigger.textContent && trigger.textContent.includes('2026')) {
            return trigger.textContent.trim();
          }
        }
      }
      return null;
    });

    if (!parentFolderText || !parentFolderText.includes('2026')) {
      throw new Error(`上级文件夹未显示2026，当前显示: "${parentFolderText}"`);
    }

    log(`✅ 上级文件夹已设置为: ${parentFolderText}`);

    // 步骤6：输入文件夹名称
    log('输入文件夹名称...');
    await page.evaluate((folderName) => {
      const dialog = document.querySelector('.next-dialog:has-text("新建文件夹")');
      if (dialog) {
        const inputs = dialog.querySelectorAll('input[type="text"]');
        if (inputs.length > 0) {
          const input = inputs[inputs.length - 1]; // 使用最后一个输入框
          input.focus();
          input.value = folderName;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, productId);

    await page.waitForTimeout(1000);

    // 验证输入
    const inputVerified = await page.evaluate((folderName) => {
      const dialog = document.querySelector('.next-dialog:has-text("新建文件夹")');
      if (dialog) {
        const inputs = dialog.querySelectorAll('input[type="text"]');
        if (inputs.length > 0) {
          const input = inputs[inputs.length - 1];
          return input.value === folderName;
        }
      }
      return false;
    }, productId);

    if (!inputVerified) {
      throw new Error('文件夹名称输入验证失败');
    }

    log(`✅ 文件夹名称输入成功: ${productId}`);

    // 步骤7：点击确定按钮
    log('点击确定按钮...');
    await page.evaluate(() => {
      const dialog = document.querySelector('.next-dialog:has-text("新建文件夹")');
      if (dialog) {
        const buttons = dialog.querySelectorAll('button');
        for (const button of buttons) {
          const text = button.textContent || '';
          if (text.includes('确定') || text.includes('创建')) {
            button.click();
            break;
          }
        }
      }
    });

    await page.keyboard.press('Enter');

    // 等待弹窗关闭
    let dialogClosed = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      const stillOpen = await page.locator('.next-dialog:has-text("新建文件夹")').isVisible();
      if (!stillOpen) {
        dialogClosed = true;
        break;
      }
    }

    if (!dialogClosed) {
      throw new Error('弹窗未在预期时间内关闭');
    }

    log('✅ 弹窗已关闭');

    // 步骤8：验证创建结果
    log('验证文件夹创建结果...');
    await page.reload();
    await page.waitForTimeout(5000);

    // 展开并点击2026节点
    await page.locator('li.next-tree-node:has-text("2026")').click();
    await page.waitForTimeout(2000);

    // 查找C25291153节点
    const targetNodeCount = await page.locator('li.next-tree-node:has-text("' + productId + '")').count();
    if (targetNodeCount === 0) {
      throw new Error('文件夹创建失败，未在树中找到');
    }

    await page.locator('li.next-tree-node:has-text("' + productId + '")').first().click();
    await page.waitForTimeout(3000);

    // 验证面包屑
    const breadcrumb = await page.locator('.next-breadcrumb').textContent();
    if (!breadcrumb.includes('全部图片') || !breadcrumb.includes('2026') || !breadcrumb.includes(productId)) {
      throw new Error(`面包屑验证失败: "${breadcrumb}"`);
    }

    log(`🎉 完全成功！面包屑: "${breadcrumb}"`);

    // 保存成功截图
    await page.screenshot({
      path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/${productId}-simple-success.png`,
      fullPage: true
    });

    await browser.close();
    return true;

  } catch (error) {
    log(`❌ 简单直接文件夹创建失败: ${error.message}`, 'error');
    throw error;
  }
}

// 执行
simpleDirectFolderCreate()
  .then((success) => {
    if (success) {
      log(`🎉 C25291153文件夹创建成功！`);
      process.exit(0);
    }
  })
  .catch((error) => {
    log(`💥 执行失败: ${error.message}`, 'error');
    process.exit(1);
  });