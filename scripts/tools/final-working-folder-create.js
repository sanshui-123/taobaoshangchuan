const { chromium } = require('playwright');
const { closeMaterialCenterPopups } = require('../utils/advert-handler');

async function finalWorkingFolderCreate() {
  const productId = 'C25291153';

  function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔧';
    console.log(`${timestamp} FinalCreate: ${prefix} ${message}`);
  }

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
    log(`开始最终工作版文件夹创建，目标ID: ${productId}`);

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
    const dialogVisible = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          return true;
        }
      }
      return false;
    });

    if (!dialogVisible) {
      throw new Error('弹窗未打开');
    }

    log('弹窗已打开');

    // 步骤3：点击上级文件夹选择器
    log('点击上级文件夹选择器...');
    const selectorClicked = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const triggers = dialog.querySelectorAll('span.next-select-trigger');
          for (const trigger of triggers) {
            if (trigger.textContent && trigger.textContent.includes('全部图片')) {
              trigger.click();
              return true;
            }
          }
        }
      }
      return false;
    });

    if (!selectorClicked) {
      throw new Error('无法点击上级文件夹选择器');
    }

    log('已点击上级文件夹选择器');
    await page.waitForTimeout(3000);

    // 步骤4：查找并点击2026节点
    log('查找并点击2026节点...');
    const node2026Clicked = await page.evaluate(() => {
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

      // 优先选择可点击的元素
      const clickableCandidates = candidates.filter(c => c.isClickable);

      if (clickableCandidates.length > 0) {
        const target = clickableCandidates[0];
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
        // 尝试点击父元素
        let parent = target.element;
        for (let i = 0; i < 3; i++) {
          parent = parent.parentElement;
          if (parent && parent.offsetWidth > 0 && parent.offsetHeight > 0) {
            parent.click();
            return {
              success: true,
              clicked: `父元素 of ${target.text}`,
              position: { x: parent.getBoundingClientRect().left + parent.getBoundingClientRect().width / 2, y: parent.getBoundingClientRect().top + parent.getBoundingClientRect().height / 2 }
            };
          }
        }
      }

      return { success: false, candidates: candidates.length };
    });

    if (!node2026Clicked.success) {
      throw new Error(`无法点击2026节点，找到${node2026Clicked.candidates}个候选元素但都无法点击`);
    }

    log(`✅ 已点击2026节点`);
    await page.waitForTimeout(2000);

    // 步骤5：验证上级文件夹显示
    log('验证上级文件夹显示...');
    const parentFolderText = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const triggers = dialog.querySelectorAll('span.next-select-trigger');
          // 返回所有选择器的文本内容进行调试
          const allTriggerTexts = [];
          for (const trigger of triggers) {
            const text = trigger.textContent ? trigger.textContent.trim() : '';
            allTriggerTexts.push(text);
            if (text.includes('2026')) {
              return text;
            }
          }
          console.log('所有选择器文本:', allTriggerTexts);
          return allTriggerTexts.join(' | '); // 返回所有文本用于调试
        }
      }
      return null;
    });

    console.log(`上级文件夹选择器显示内容: "${parentFolderText}"`);

    // 更灵活的验证：检查是否包含2026或者看起来正确设置了
    const has2026 = parentFolderText && parentFolderText.includes('2026');
    const has全部图片 = parentFolderText && parentFolderText.includes('全部图片');

    if (has2026) {
      log(`✅ 上级文件夹已设置为包含2026: ${parentFolderText}`);
    } else if (has全部图片 && !has2026) {
      // 如果仍然显示全部图片，可能需要重新尝试点击2026
      log(`⚠️ 仍显示全部图片，尝试重新点击2026...`);

      // 重新尝试点击2026
      await page.waitForTimeout(1000);
      const retrySuccess = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        for (const element of allElements) {
          const text = element.textContent || '';
          const rect = element.getBoundingClientRect();
          if (text.includes('2026') && rect.width > 0 && rect.height > 0) {
            // 找到一个不同的2026元素并点击
            if (element.tagName === 'LI' || (element.tagName === 'DIV' && element.className.includes('node'))) {
              element.click();
              return true;
            }
          }
        }
        return false;
      });

      if (retrySuccess) {
        await page.waitForTimeout(1500);
        const finalCheck = await page.evaluate(() => {
          const dialogs = document.querySelectorAll('.next-dialog');
          for (const dialog of dialogs) {
            if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
              const triggers = dialog.querySelectorAll('span.next-select-trigger');
              for (const trigger of triggers) {
                const text = trigger.textContent ? trigger.textContent.trim() : '';
                if (text.includes('2026')) {
                  return text;
                }
              }
            }
          }
          return null;
        });

        if (finalCheck && finalCheck.includes('2026')) {
          log(`✅ 重新尝试后成功设置上级文件夹: ${finalCheck}`);
        } else {
          log(`⚠️ 重新尝试后仍显示: ${finalCheck}，但继续执行...`);
        }
      }
    } else {
      log(`⚠️ 上级文件夹显示不明确: "${parentFolderText}"，但继续执行...`);
    }

    // 步骤6：输入文件夹名称
    log('输入文件夹名称...');
    const inputSuccess = await page.evaluate((folderName) => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const inputs = dialog.querySelectorAll('input[type="text"]');
          if (inputs.length > 0) {
            const input = inputs[inputs.length - 1]; // 使用最后一个输入框
            input.focus();
            input.value = folderName;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            // 验证输入
            if (input.value === folderName) {
              return true;
            }
          }
        }
      }
      return false;
    }, productId);

    if (!inputSuccess) {
      throw new Error('文件夹名称输入失败');
    }

    log(`✅ 文件夹名称输入成功: ${productId}`);

    // 步骤7：点击确定按钮
    log('点击确定按钮...');
    const confirmClicked = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.next-dialog');
      for (const dialog of dialogs) {
        if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
          const buttons = dialog.querySelectorAll('button');
          for (const button of buttons) {
            const text = button.textContent || '';
            if (text.includes('确定') || text.includes('创建')) {
              button.click();
              return true;
            }
          }
        }
      }
      return false;
    });

    if (!confirmClicked) {
      throw new Error('无法点击确定按钮');
    }

    await page.keyboard.press('Enter');
    log('已点击确定按钮并按回车');

    // 等待弹窗关闭
    let dialogClosed = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      const stillOpen = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.next-dialog');
        for (const dialog of dialogs) {
          if (dialog.textContent && dialog.textContent.includes('新建文件夹')) {
            return true;
          }
        }
        return false;
      });

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
    const node2026Expanded = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      const node2026 = nodes.find(el => el.textContent && el.textContent.includes('2026'));
      if (node2026) {
        node2026.click();
        return true;
      }
      return false;
    });

    if (!node2026Expanded) {
      throw new Error('无法展开2026节点');
    }

    await page.waitForTimeout(2000);

    // 查找C25291153节点
    const targetNodeFound = await page.evaluate((targetId) => {
      const nodes = Array.from(document.querySelectorAll('li.next-tree-node'));
      const targetNode = nodes.find(el => el.textContent && el.textContent.includes(targetId));
      if (targetNode) {
        targetNode.click();
        return true;
      }
      return false;
    }, productId);

    if (!targetNodeFound) {
      throw new Error('文件夹创建失败，未在树中找到');
    }

    await page.waitForTimeout(3000);

    // 验证面包屑
    const breadcrumb = await page.evaluate(() => {
      const breadcrumb = document.querySelector('.next-breadcrumb');
      return breadcrumb ? breadcrumb.textContent.trim() : '';
    });

    const hasAllParts = breadcrumb.includes('全部图片') &&
                       breadcrumb.includes('2026') &&
                       breadcrumb.includes(productId);

    if (!hasAllParts) {
      throw new Error(`面包屑验证失败: "${breadcrumb}"`);
    }

    log(`🎉 完全成功！面包屑: "${breadcrumb}"`);

    // 保存成功截图
    await page.screenshot({
      path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/${productId}-final-success.png`,
      fullPage: true
    });

    log(`📸 成功截图已保存: ${productId}-final-success.png`);

    await browser.close();
    return true;

  } catch (error) {
    log(`❌ 最终文件夹创建失败: ${error.message}`, 'error');
    throw error;
  }
}

// 执行
finalWorkingFolderCreate()
  .then((success) => {
    if (success) {
      console.log(`🎉 C25291153文件夹创建成功！现在可以执行上传步骤`);
      process.exit(0);
    }
  })
  .catch((error) => {
    console.log(`💥 执行失败: ${error.message}`);
    process.exit(1);
  });