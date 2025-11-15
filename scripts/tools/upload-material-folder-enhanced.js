#!/usr/bin/env node

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 导入广告清理函数
const { closeMaterialCenterPopups } = require('../utils/advert-handler');

// 日志函数
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = {
    info: '📋',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  }[type] || '📋';

  console.log(`${timestamp} Step5: ${prefix} ${message}`);
}

function logVerbose(message) {
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--verbose')) {
    log(message, 'info');
  }
}

async function main() {
  const productId = process.argv.find(arg => arg.startsWith('--product='))?.split('=')[1];

  if (!productId) {
    log('请使用 --product=商品ID 格式指定商品ID', 'error');
    process.exit(1);
  }

  log('开始Step5：素材库上传流程');
  log(`商品ID: ${productId}`);

  // 连接到现有的Chrome实例
  let browser;
  let page;

  try {
    log('连接到Chrome (CDP 9222)...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();

    // 查找淘宝素材库页面，而不是DevTools页面
    let targetPage = null;
    for (const context of contexts) {
      const pages = context.pages();
      for (const p of pages) {
        const url = p.url();
        if (url && url.includes('taobao.com') && url.includes('material-center')) {
          targetPage = p;
          break;
        }
      }
      if (targetPage) break;
    }

    if (!targetPage) {
      // 如果没有找到素材库页面，尝试使用第一个页面
      page = contexts[0].pages()[0];
      log('⚠️ 未找到素材库页面，使用当前活动页面', 'warning');
    } else {
      page = targetPage;
      log('✅ 找到素材库页面', 'success');
    }

    if (!page) {
      throw new Error('未找到活动页面');
    }

    log('Chrome连接成功');
    logVerbose(`当前页面URL ${page.url()}`);

    // 创建截图目录
    const screenshotDir = path.join(__dirname, '../../screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    // 步骤1: 关闭广告弹窗
    log('步骤1: 关闭广告弹窗并启动搜索面板持续防护...');
    try {
      await closeMaterialCenterPopups(page, {
        forceRemoveSearchPanel: true,
        keepSearchPanelAlive: true
      });
      log('广告处理完成');
    } catch (adError) {
      log(`广告处理出现异常: ${adError.message}`, 'warning');
    }

    // 步骤2: 导航到素材库页面
    log('步骤2: 导航到素材库页面...');
    const materialUrl = 'https://myseller.taobao.com/home.htm/material-center/mine-material/sucai-tu';
    if (page.url() !== materialUrl) {
      await page.goto(materialUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    }

    // 步骤3: 验证本地图片文件夹
    log('步骤3: 验证本地图片文件夹...');
    const productFolder = path.join(__dirname, `../../assets/${productId}`);

    if (!fs.existsSync(productFolder)) {
      throw new Error(`商品文件夹不存在: ${productFolder}`);
    }

    const imageFiles = fs.readdirSync(productFolder)
      .filter(file => file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.png'))
      .filter(file => file.startsWith('color_'))
      .sort();

    if (imageFiles.length === 0) {
      throw new Error(`在 ${productFolder} 中未找到color_开头的图片文件`);
    }

    logVerbose(`找到 ${imageFiles.length} 个图片文件`);
    logVerbose(imageFiles.map(f => f.replace(/^color_\d+_(\d+)\.(jpg|png)$/i, 'color_$1.$2')).join(', '));
    log(`本地验证通过: 找到 ${imageFiles.length} 个图片文件`, 'success');

    // 步骤4: 点击左侧2026文件夹
    log('步骤4: 点击左侧2026文件夹...');

    try {
      // 检查是否已有新建文件夹弹窗，如果有则直接使用
      logVerbose('检查是否已有新建文件夹弹窗...');
      try {
        const existingDialog = await page.$('.next-dialog:has-text("新建文件夹")');
        if (existingDialog) {
          log('✅ 检测到现有新建文件夹弹窗，直接使用', 'success');

          // 在现有弹窗中输入文件夹名称
          const dialogInputSelectors = [
            '.next-dialog input',
            '.next-dialog input[type="text"]',
            '.next-dialog .next-input',
            '.next-dialog .next-input-inner'
          ];

          let inputFound = false;
          for (const selector of dialogInputSelectors) {
            try {
              const dialogInput = await page.$(`.next-dialog:has-text("新建文件夹") ${selector}`);
              if (dialogInput) {
                logVerbose('在现有弹窗中找到输入框，准备输入商品ID');
                await dialogInput.click({ force: true });
                await page.waitForTimeout(500);
                await dialogInput.fill('');
                await dialogInput.type(productId, { delay: 50 });
                log(`✅ 在现有弹窗中输入文件夹名称: ${productId}`, 'success');
                inputFound = true;
                break;
              }
            } catch (inputError) {
              logVerbose(`现有弹窗输入框选择器 ${selector} 失败: ${inputError.message}`);
            }
          }

          // 如果标准选择器失败，尝试键盘操作
          if (!inputFound) {
            logVerbose('使用键盘操作在现有弹窗中输入...');
            await page.keyboard.press('Tab');
            await page.waitForTimeout(200);
            await page.keyboard.press('Tab');
            await page.waitForTimeout(200);
            await page.keyboard.press('Control+a');
            await page.waitForTimeout(100);
            await page.keyboard.type(productId, { delay: 50 });
            log(`✅ 使用键盘在现有弹窗中输入文件夹名称: ${productId}`, 'success');
            inputFound = true;
          }

          // 点击确定按钮
          if (inputFound) {
            const confirmSelectors = [
              '.next-dialog:has-text("新建文件夹") button:has-text("确定")',
              '.next-dialog .next-btn-primary:has-text("确定")',
              '.next-dialog button.btn-primary:has-text("确定")'
            ];

            for (const selector of confirmSelectors) {
              try {
                const confirmButton = await page.$(selector);
                if (confirmButton && await confirmButton.isVisible()) {
                  await confirmButton.click();
                  log('✅ 点击了现有弹窗的确定按钮', 'success');
                  await page.waitForTimeout(2000);
                  break;
                }
              } catch (confirmError) {
                logVerbose(`确定按钮选择器 ${selector} 失败: ${confirmError.message}`);
              }
            }
          }

          // 等待弹窗关闭
          try {
            await page.waitForSelector('.next-dialog:has-text("新建文件夹")', {
              state: 'hidden',
              timeout: 3000
            });
            log('✅ 现有弹窗已关闭', 'success');
          } catch (hideError) {
            logVerbose(`等待弹窗关闭超时，可能已关闭: ${hideError.message}`);
          }
        }
      } catch (existingDialogError) {
        logVerbose(`检查现有弹窗失败: ${existingDialogError.message}`);
      }

      // 强制清理广告和搜索面板
      logVerbose('进入2026前重新清理搜索面板并启动持续防护...');
      await closeMaterialCenterPopups(page, {
        forceRemoveSearchPanel: true,
        keepSearchPanelAlive: true
      });

      // 查找并点击2026文件夹
      const folderSelectors = [
        'li.next-tree-node:has-text("2026")',
        '.next-tree-node[title="2026"]',
        'div.next-tree-node-inner:has-text("2026")'
      ];

      let folderClicked = false;
      for (const selector of folderSelectors) {
        try {
          logVerbose(`尝试选择器: ${selector}`);
          const folder = page.locator(selector).first();

          if (await folder.isVisible({ timeout: 3000 })) {
            await folder.click();
            await page.waitForTimeout(1500);
            log('成功点击2026文件夹', 'success');
            folderClicked = true;
            break;
          }
        } catch (e) {
          logVerbose(`选择器 ${selector} 失败: ${e.message}`);
        }
      }

      if (!folderClicked) {
        throw new Error('无法找到或点击2026文件夹');
      }

    } catch (folderError) {
      log(`步骤4失败: ${folderError.message}`, 'error');
      throw folderError;
    }

    // 步骤5: 创建新商品文件夹
    log('步骤5: 创建新商品文件夹...');

    try {
      // 强制清理广告
      logVerbose('创建文件夹前重新清理搜索面板...');
      await closeMaterialCenterPopups(page, {
        forceRemoveSearchPanel: true,
        keepSearchPanelAlive: true
      });

      // 查找新建文件夹按钮
      logVerbose('查找新建文件夹按钮...');
      const newFolderButtonSelectors = [
        'button:has-text("新建文件夹")',
        '.next-btn:has-text("新建文件夹")',
        '[class*="btn"]:has-text("新建文件夹")'
      ];

      let buttonFound = false;
      for (const selector of newFolderButtonSelectors) {
        try {
          const button = page.locator(selector).first();
          if (await button.isVisible({ timeout: 2000 })) {
            logVerbose(`找到新建文件夹按钮: ${selector}`);
            buttonFound = true;

            // 使用强制点击，避免遮挡元素干扰
            logVerbose('使用强制点击新建文件夹按钮，避免遮挡元素干扰...');
            await button.click({ force: true });
            log('点击了新建文件夹按钮', 'success');
            break;
          }
        } catch (e) {
          logVerbose(`按钮选择器 ${selector} 失败: ${e.message}`);
        }
      }

      if (!buttonFound) {
        throw new Error('无法找到新建文件夹按钮');
      }

      // 等待弹窗出现
      log('等待新建文件夹弹窗出现...');
      try {
        await page.waitForSelector('.next-dialog:has-text("新建文件夹")', {
          timeout: 5000
        });
        log('✅ 弹窗已出现: .next-dialog:has-text("新建文件夹")', 'success');
      } catch (dialogError) {
        log(`⚠️ 弹窗选择器失败，尝试备用方案: ${dialogError.message}`, 'warning');

        // 备用方案：检查是否有其他弹窗
        const anyDialog = await page.$$('.next-dialog').then(dialogs => dialogs.length > 0);
        if (!anyDialog) {
          throw new Error('弹窗未出现，可能被拦截或页面状态异常');
        }
        log('✅ 检测到弹窗出现（备用方案）', 'success');
      }

      // 在弹窗内输入文件夹名称
      log('🎯 限定操作范围在弹窗内，避免误操作其他输入框');
      logVerbose('等待弹窗内输入框...');

      // 等待并查找弹窗内的输入框
      const dialogInputSelectors = [
        '.next-dialog input',
        '.next-dialog input[type="text"]',
        '.next-dialog .next-input',
        '.next-dialog .next-input-inner'
      ];

      let inputFound = false;
      for (const selector of dialogInputSelectors) {
        try {
          // 在弹窗内查找输入框
          const dialogInput = await page.$(`.next-dialog:has-text("新建文件夹") ${selector}`);
          if (dialogInput) {
            logVerbose('在弹窗内找到文件夹名称输入框，准备输入商品ID');

            // 获取输入框详细信息
            const inputType = await dialogInput.getAttribute('type');
            const inputPlaceholder = await dialogInput.getAttribute('placeholder');
            logVerbose(`输入框类型: ${inputType}, placeholder: ${inputPlaceholder}`);

            // 强制点击输入框，确保获得焦点
            log('📍 强制点击弹窗内文件夹名称输入框，确保焦点正确');
            await dialogInput.click({ force: true });
            await page.waitForTimeout(500);

            // 先清空输入框，然后输入商品ID
            await dialogInput.fill('');
            await dialogInput.type(productId, { delay: 50 });
            log(`✅ 在弹窗内输入文件夹名称: ${productId}`, 'success');
            inputFound = true;
            break;
          }
        } catch (inputError) {
          logVerbose(`弹窗内输入框选择器 ${selector} 失败: ${inputError.message}`);
        }
      }

      // 如果输入框检测失败，使用更多备用方案寻找输入框
      if (!inputFound) {
        log('⚠️ 在弹窗内未找到标准输入框，尝试更多备用方案...', 'warning');

        // 备用方案1：尝试直接在弹窗中输入，不限定特定选择器
        try {
          logVerbose('备用方案1：直接在弹窗内输入...');

          // 查找所有可能的输入元素，包括contenteditable元素
          const allInputs = await page.$$('.next-dialog input, .next-dialog .next-input, .next-dialog [type="text"], .next-dialog [contenteditable="true"], .next-dialog textarea');

          if (allInputs.length > 0) {
            logVerbose(`找到 ${allInputs.length} 个可能的输入元素，尝试第一个`);
            const firstInput = allInputs[0];

            await firstInput.click({ force: true });
            await page.waitForTimeout(300);

            // 根据元素类型选择不同的输入方法
            const tagName = await firstInput.evaluate(el => el.tagName.toLowerCase());
            const isContentEditable = await firstInput.evaluate(el => el.contentEditable === 'true');

            if (tagName === 'input' || tagName === 'textarea') {
              await firstInput.fill('');
              await firstInput.type(productId, { delay: 50 });
            } else if (isContentEditable) {
              // 对于contenteditable元素
              await firstInput.evaluate(el => el.textContent = '');
              await firstInput.type(productId, { delay: 50 });
            } else {
              // 尝试使用fill方法
              await firstInput.fill('');
              await firstInput.type(productId, { delay: 50 });
            }

            log(`✅ 使用备用方案输入文件夹名称: ${productId}`, 'success');
            inputFound = true;
          } else {
            logVerbose('备用方案1：未找到任何输入元素');
          }
        } catch (backup1Error) {
          logVerbose(`备用方案1失败: ${backup1Error.message}`);
        }

        // 备用方案2：使用键盘操作输入
        if (!inputFound) {
          try {
            logVerbose('备用方案2：使用键盘操作输入...');

            // 尝试使用Tab键切换到输入框
            await page.keyboard.press('Tab');
            await page.waitForTimeout(200);
            await page.keyboard.press('Tab');
            await page.waitForTimeout(200);

            // 清空并输入
            await page.keyboard.press('Control+a');
            await page.waitForTimeout(100);
            await page.keyboard.type(productId, { delay: 50 });

            log(`✅ 使用键盘操作输入文件夹名称: ${productId}`, 'success');
            inputFound = true;
          } catch (backup2Error) {
            logVerbose(`备用方案2失败: ${backup2Error.message}`);
          }
        }

        // 备用方案3：使用更精确的选择器
        if (!inputFound) {
          try {
            logVerbose('备用方案3：使用更精确的选择器...');

            const preciseSelectors = [
              '.next-dialog-body input',
              '.next-dialog-content input',
              '.next-dialog input:focus',
              '.next-dialog .next-input-wrapper input'
            ];

            for (const selector of preciseSelectors) {
              try {
                const input = await page.$(selector);
                if (input && await input.isVisible()) {
                  await input.click({ force: true });
                  await page.waitForTimeout(300);
                  await input.fill('');
                  await input.type(productId, { delay: 50 });
                  log(`✅ 使用精确选择器输入文件夹名称: ${productId}`, 'success');
                  inputFound = true;
                  break;
                }
              } catch (selectorError) {
                logVerbose(`选择器 ${selector} 失败: ${selectorError.message}`);
              }
            }
          } catch (backup3Error) {
            logVerbose(`备用方案3失败: ${backup3Error.message}`);
          }
        }
      }

      // 如果所有输入方案都失败，才使用用户指示的备用方案
      if (!inputFound) {
        log('⚠️ 所有输入方案都失败，使用用户指示的备用方案...', 'warning');

        try {
          // 查找弹窗中的所有按钮
          const dialogButtons = await page.$$('.next-dialog button, .next-dialog .next-btn');

          if (dialogButtons.length > 0) {
            logVerbose(`在弹窗中找到 ${dialogButtons.length} 个按钮`);

            // 尝试点击"确定"按钮或类似按钮
            for (const button of dialogButtons) {
              const buttonText = await button.textContent();
              logVerbose(`按钮文本: "${buttonText}"`);

              if (buttonText && (buttonText.includes('确定') || buttonText.includes('创建') || buttonText.includes('OK'))) {
                log(`✅ 找到目标按钮: ${buttonText}，点击`, 'success');
                await button.click();
                await page.waitForTimeout(2000);
                inputFound = true;
                break;
              }
            }

            // 如果没找到确定按钮，点击第一个按钮
            if (!inputFound && dialogButtons.length > 0) {
              log('⚠️ 未找到确定按钮，点击第一个按钮...', 'warning');
              await dialogButtons[0].click();
              await page.waitForTimeout(2000);
              inputFound = true;
            }
          } else {
            throw new Error('弹窗中未找到任何按钮');
          }
        } catch (manualButtonError) {
          throw new Error(`用户指示的备用方案也失败: ${manualButtonError.message}`);
        }
      }

      // 如果找到了输入框并成功输入，需要点击确定按钮
      // 如果使用了备用方案（直接点击按钮），可能已经处理了确定流程
      if (inputFound) {
        // 检查是否还需要点击确定按钮
        const stillHasDialog = await page.$$('.next-dialog').then(dialogs =>
          dialogs.some(dialog => {
            const text = dialog.textContent || '';
            return typeof text === 'string' && text.includes('新建文件夹');
          })
        );

        if (stillHasDialog) {
          log('🔘 弹窗仍然存在，需要点击确定按钮...');

          const dialogConfirmSelectors = [
            '.next-dialog:has-text("新建文件夹") button:has-text("确定")',
            '.next-dialog .next-btn-primary:has-text("确定")',
            '.next-dialog button.btn-primary:has-text("确定")',
            '.next-dialog button[type="primary"]'
          ];

          let confirmButtonFound = false;
          for (const selector of dialogConfirmSelectors) {
            try {
              const confirmButton = await page.$(selector);
              if (confirmButton && await confirmButton.isVisible()) {
                log('✅ 在弹窗内找到确定按钮', 'success');
                log('🎯 点击弹窗内确定按钮...');
                await confirmButton.click();
                log('✅ 已点击弹窗内确定按钮', 'success');
                confirmButtonFound = true;
                break;
              }
            } catch (confirmError) {
              logVerbose(`弹窗内确定按钮选择器 ${selector} 失败: ${confirmError.message}`);
            }
          }

          if (!confirmButtonFound) {
            log('⚠️ 未找到标准确定按钮，尝试点击第一个按钮...', 'warning');
            // 备用方案：点击弹窗中的第一个按钮
            const allButtons = await page.$$('.next-dialog button, .next-dialog .next-btn');
            if (allButtons.length > 0) {
              const firstButton = allButtons[allButtons.length - 1]; // 通常确定按钮是最后一个
              await firstButton.click();
              log('✅ 点击了弹窗中的备用按钮', 'success');
            }
          }

          // 等待弹窗消失
          log('⏳ 等待弹窗消失...');
          try {
            await page.waitForSelector('.next-dialog:has-text("新建文件夹")', {
              state: 'hidden',
              timeout: 3000
            });
            log('✅ 弹窗已自动消失', 'success');
          } catch (hideError) {
            log('⚠️ 弹窗未自动消失，尝试按ESC键强制关闭...', 'warning');
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            log('✅ 已强制关闭弹窗', 'success');
          }
        }
      } else {
        // 如果输入框检测失败，但备用方案成功，我们已经处理了确定流程
        log('✅ 使用备用方案成功处理了文件夹创建流程', 'success');
      }

      // 检查是否出现"新建文件夹失败"的toast提示
      log('步骤5.5: 检测新建文件夹结果...');
      await page.waitForTimeout(1000);

      try {
        const failToast = await page.$('text*=新建文件夹失败, text*=创建失败, text*=已存在');
        if (failToast) {
          log('⚠️ 检测到创建失败提示，文件夹可能已存在', 'warning');
        }
      } catch (toastError) {
        logVerbose('未检测到失败提示');
      }

    } catch (createError) {
      log(`步骤5失败: ${createError.message}`, 'error');
      throw createError;
    }

    // 步骤6: 强化版本 - 使用左侧树形目录进入目标文件夹，严格验证
    log('步骤6: 使用左侧树形目录进入目标文件夹...');

    try {
      logVerbose('使用左侧树形节点点击方式进入文件夹...');

      // 确保左侧2026节点已展开
      logVerbose('确保左侧2026节点已展开...');
      const folder2026 = page.locator('li.next-tree-node:has-text("2026")').first();
      if (await folder2026.isVisible()) {
        await folder2026.click();
        await page.waitForTimeout(1000);
        log('✅ 已点击左侧2026节点确保展开', 'success');
      }

      // 在左侧树形目录中找到目标文件夹节点选择器
      logVerbose(`在左侧树形目录中查找目标文件夹: ${productId}`);
      const targetTreeNodeSelectors = [
        `div.next-tree-node-inner:has-text("${productId}")`,
        `li.next-tree-node:has-text("${productId}")`,
        `.next-tree-node:has-text("${productId}")`,
        `div[class*="tree-node"]:has-text("${productId}")`,
        `div[class*="tree"]:has-text("${productId}")`
      ];

      // 循环点击和验证，直到真正进入目标文件夹
      let enteredTargetFolder = false;
      let maxEntryRetries = 10;
      let entryRetryCount = 0;

      while (!enteredTargetFolder && entryRetryCount < maxEntryRetries) {
        entryRetryCount++;
        log(`🔄 第 ${entryRetryCount} 次尝试进入目标文件夹...`);

        try {
          // 查找并点击左侧树形节点
          let clickSuccess = false;
          for (const selector of targetTreeNodeSelectors) {
            try {
              logVerbose(`尝试选择器: ${selector}`);
              const targetTreeNode = page.locator(selector).first();

              if (await targetTreeNode.isVisible({ timeout: 3000 })) {
                logVerbose(`找到可见的左侧树形节点: ${selector}`);

                // 尝试滚动到节点位置
                try {
                  await targetTreeNode.scrollIntoViewIfNeeded();
                  await page.waitForTimeout(500);
                } catch (scrollError) {
                  logVerbose(`滚动到节点失败，继续点击: ${scrollError.message}`);
                }

                // 单击进入文件夹（在树形目录中单击即可）
                await targetTreeNode.click();
                await page.waitForTimeout(2000);

                log(`✅ 已单击左侧树形节点: ${productId}`, 'success');
                clickSuccess = true;
                break;
              }
            } catch (e) {
              logVerbose(`选择器 ${selector} 未找到左侧树形节点: ${e.message}`);
            }
          }

          if (!clickSuccess) {
            throw new Error(`所有左侧树形节点选择器都未找到目标文件夹: ${productId}`);
          }

          // 点击后等待页面加载
          await page.waitForTimeout(3000);

          // 严格验证面包屑是否包含目标文件夹
          logVerbose('检查面包屑是否包含目标文件夹...');
          const breadcrumbCheck = await page.evaluate((targetProductId) => {
            // 查找所有可能包含面包屑路径的元素
            const breadcrumbSelectors = [
              '.breadcrumb',
              '.path-nav',
              '.nav-path',
              '.folder-header',
              '.page-header',
              '.current-path',
              '.location-path',
              '[class*="breadcrumb"]',
              '[class*="path"]'
            ];

            for (const selector of breadcrumbSelectors) {
              const elements = document.querySelectorAll(selector);
              for (const element of elements) {
                const text = element.innerText || element.textContent;
                if (text) {
                  // 检查是否包含目标文件夹ID
                  if (text.includes(targetProductId) && text.includes('全部图片')) {
                    return {
                      found: true,
                      text: text.trim(),
                      includesTarget: true
                    };
                  }
                }
              }
            }

            // 备用方案：检查页面整个文本
            const bodyText = document.body.innerText;
            const hasTargetInBreadcrumb = bodyText.includes(`全部图片`) &&
                                       bodyText.includes(`/${targetProductId}`) &&
                                       bodyText.includes(targetProductId);

            return {
              found: hasTargetInBreadcrumb,
              text: hasTargetInBreadcrumb ? '页面文本中找到目标路径' : '',
              includesTarget: hasTargetInBreadcrumb
            };
          }, productId);

          if (breadcrumbCheck.found && breadcrumbCheck.includesTarget) {
            log(`✅ 面包屑验证成功: ${breadcrumbCheck.text}`, 'success');
            enteredTargetFolder = true;

            // 额外验证：检查是否不再显示2026根目录的内容
            const stillIn2026 = await page.evaluate(() => {
              const bodyText = document.body.innerText;
              return bodyText.includes('全部图片/2026') && !bodyText.includes('全部图片/2026/C');
            });

            if (!stillIn2026) {
              log('✅ 确认已离开2026根目录，进入目标文件夹', 'success');
              break;
            } else {
              log('⚠️ 面包屑有目标文件夹但内容仍在2026，重试', 'warning');
              enteredTargetFolder = false;
            }
          } else {
            log(`⚠️ 面包屑验证失败，未找到目标文件夹，重试`, 'warning');
            enteredTargetFolder = false;
          }

        } catch (e) {
          log(`⚠️ 第 ${entryRetryCount} 次进入尝试失败: ${e.message}`, 'warning');
          enteredTargetFolder = false;
        }

        // 如果还没成功，等待一下再重试
        if (!enteredTargetFolder && entryRetryCount < maxEntryRetries) {
          await page.waitForTimeout(2000);
        }
      }

      if (!enteredTargetFolder) {
        throw new Error(`经过 ${maxEntryRetries} 次尝试仍无法进入目标文件夹: ${productId}`);
      }

      log(`✅ 成功进入目标文件夹: ${productId}`, 'success');

      // 截图记录成功进入文件夹
      try {
        const screenshot = await page.screenshot({
          path: screenshotDir + '/step6-entered-target-folder.png',
          fullPage: false
        });
        logVerbose('进入目标文件夹截图已保存: step6-entered-target-folder.png');
      } catch (screenshotError) {
        log(`⚠️ 进入文件夹截图失败，继续执行: ${screenshotError.message}`, 'warning');
      }

    } catch (error) {
      log(`❌ 左侧树形目录进入失败: ${error.message}`, 'error');
      throw error;
    }

    // 步骤7: 刷新页面并再次验证 - 确保路径保持在目标文件夹
    log('步骤7: 刷新页面并再次验证路径...');

    try {
      // 刷新页面
      log('刷新页面以验证路径持久性...');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      // 再次清理可能出现的弹窗
      await closeMaterialCenterPopups(page, {
        forceRemoveSearchPanel: true,
        keepSearchPanelAlive: true
      });

      // 验证刷新后是否仍在目标文件夹
      logVerbose('验证刷新后是否仍在目标文件夹...');
      const afterRefreshCheck = await page.evaluate((targetProductId) => {
        const bodyText = document.body.innerText;

        // 检查面包屑是否包含目标文件夹
        const breadcrumbSelectors = [
          '.breadcrumb',
          '.path-nav',
          '.nav-path',
          '.folder-header',
          '.page-header',
          '.current-path',
          '.location-path',
          '[class*="breadcrumb"]',
          '[class*="path"]'
        ];

        for (const selector of breadcrumbSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const text = element.innerText || element.textContent;
            if (text && text.includes(targetProductId) && text.includes('全部图片')) {
              return {
                stillInTarget: true,
                breadcrumb: text.trim()
              };
            }
          }
        }

        // 备用检查
        const hasTargetPath = bodyText.includes(`全部图片`) &&
                             bodyText.includes(`/${targetProductId}`) &&
                             bodyText.includes(targetProductId);

        return {
          stillInTarget: hasTargetPath,
          breadcrumb: hasTargetPath ? '页面文本中找到目标路径' : ''
        };
      }, productId);

      if (afterRefreshCheck.stillInTarget) {
        log(`✅ 刷新后路径验证成功: ${afterRefreshCheck.breadcrumb}`, 'success');

        // 截图记录刷新后的状态
        try {
          const screenshot = await page.screenshot({
            path: screenshotDir + '/step7-refresh-confirmed.png',
            fullPage: false
          });
          logVerbose('刷新后验证截图已保存: step7-refresh-confirmed.png');
        } catch (screenshotError) {
          log(`⚠️ 刷新后截图失败，继续执行: ${screenshotError.message}`, 'warning');
        }

      } else {
        throw new Error('刷新后路径丢失，未能在目标文件夹中');
      }

    } catch (refreshError) {
      log(`❌ 刷新验证失败: ${refreshError.message}`, 'error');
      throw refreshError;
    }

    log('🎉 Step5完成：成功进入目标文件夹并验证路径持久性', 'success');

  } catch (error) {
    log(`Step5执行失败: ${error.message}`, 'error');
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('unhandledRejection', (reason, promise) => {
  log(`未处理的Promise拒绝: ${reason}`, 'error');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  log(`未捕获的异常: ${error.message}`, 'error');
  process.exit(1);
});

// 运行主函数
main().catch(error => {
  log(`程序执行失败: ${error.message}`, 'error');
  process.exit(1);
});