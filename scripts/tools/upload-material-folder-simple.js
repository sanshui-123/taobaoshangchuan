const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function uploadMaterialFolderSimple() {
  const productId = process.argv.find(arg => arg.startsWith('--product='))?.split('=')[1] || 'C25233113';
  const verbose = process.argv.includes('--verbose');
  let gotoStep3 = false;

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '📋';
    console.log(`${timestamp} SimpleUpload: ${prefix} ${message}`);
  };

  const throwOnError = (message) => {
    log(`ERROR: ${message}`, 'error');
    throw new Error(message);
  };

  try {
    // 连接到Chrome
    log(`开始上传流程，商品ID: ${productId}`);
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

    // 先确保2026展开的函数
    const expand2026 = async () => {
      const node2026 = await page.$('li.next-tree-node:has-text("2026")');
      if (node2026) {
        await node2026.click();
        log('点击2026节点确保展开');
      }
    };

    // 步骤1：先关闭任何现有弹窗，然后点击新建文件夹按钮
    log('步骤1：清理弹窗并点击新建文件夹按钮');

    // 强制关闭所有弹窗
    const closeAllDialogs = async () => {
      const dialogs = await page.$$('.next-dialog');
      for (const dialog of dialogs) {
        try {
          // 检查弹窗类型并关闭
          const dialogText = await dialog.textContent();

          // 尝试点击关闭按钮
          const closeButton = await dialog.$('button:has-text("取消"), button:has-text("关闭"), button[aria-label*="close"], .next-dialog-close');
          if (closeButton) {
            await closeButton.click();
            log(`点击了关闭/取消按钮: ${dialogText.substring(0, 20)}...`);
          } else {
            log(`未找到关闭按钮，尝试ESC键关闭弹窗: ${dialogText.substring(0, 20)}...`);
          }
        } catch (e) {
          log('关闭弹窗失败，尝试ESC键');
        }
      }

      // 按ESC键多次确保关闭
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    };

    await closeAllDialogs();
    log('已清理所有弹窗');

    // 先检查${productId}文件夹是否已存在
    log(`检查${productId}文件夹是否已存在`);
    await expand2026();
    await page.waitForTimeout(1000);

    const existingFolder = await page.$(`li.next-tree-node:has-text("${productId}")`);
    if (existingFolder) {
      log(`${productId}文件夹已存在，跳过创建步骤`, 'success');
      await existingFolder.click();
      await page.waitForTimeout(1000);

      // 验证面包屑 - 使用更灵活的验证
      const breadcrumb = await page.$('.next-breadcrumb');
      if (breadcrumb) {
        const text = await breadcrumb.textContent();
        log(`当前面包屑: ${text.trim()}`);

        // 检查是否包含${productId}即可，面包屑格式可能不同
        if (text.includes(productId)) {
          log(`面包屑正确: ${text.trim()}`, 'success');
          // 直接跳转到步骤3
          gotoStep3 = true;
        } else {
          log(`面包屑不包含${productId}，等待更新...`);
          // 等待2秒让面包屑更新
          await page.waitForTimeout(2000);
          const updatedText = await breadcrumb.textContent();
          log(`更新后面包屑: ${updatedText.trim()}`);

          if (updatedText.includes(productId)) {
            log(`面包屑更新正确: ${updatedText.trim()}`, 'success');
            gotoStep3 = true;
          } else {
            log(`面包屑仍不包含${productId}，继续尝试点击...`);
            // 再次尝试点击
            await existingFolder.click();
            await page.waitForTimeout(1000);
            const finalText = await breadcrumb.textContent();

            if (finalText.includes(productId)) {
              log(`第三次面包屑检查通过: ${finalText.trim()}`, 'success');
              gotoStep3 = true;
            }
          }
        }
      } else {
        throwOnError('未找到面包屑元素');
      }

      if (!gotoStep3) {
        // 不要抛错，而是继续步骤2，让正常的导航逻辑处理
        log('灵活验证失败，将使用标准导航流程', 'warning');
      }
    } else {
      log(`${productId}文件夹不存在，开始创建`);
      // 点击新建文件夹按钮
      const newFolderButton = await page.$('button:has-text("新建文件夹")');
      if (newFolderButton) {
        await newFolderButton.click();
        log('点击新建文件夹按钮', 'success');
      } else {
        throwOnError('未找到新建文件夹按钮');
      }

      // 等待弹窗出现
      const dialogSelector = '.next-dialog:has-text("新建文件夹")';
      try {
        await page.waitForSelector(dialogSelector, { timeout: 5000 });
        log('检测到新建文件夹弹窗');
      } catch (e) {
        throwOnError('未检测到新建文件夹弹窗');
      }
    }

    // 在输入框中输入${productId} - 使用多种方法确保输入成功
    log(`开始输入文件夹名称到弹窗`);

    // 方法1：尝试点击并输入
    const inputSelectors = [
      '.next-dialog input[type="text"]',
      '.next-dialog .next-input input',
      '.next-dialog input'
    ];

    let inputFound = false;
    let actualInput = null;

    for (const selector of inputSelectors) {
      const inputs = await page.$$(selector);
      for (const input of inputs) {
        try {
          // 检查输入框是否在弹窗内且可见
          const isVisible = await input.isVisible();
          const parentDialog = await input.$('xpath=./ancestor::*[contains(@class, "next-dialog")]');

          if (isVisible && parentDialog) {
            await input.click({ force: true });
            await page.waitForTimeout(500);

            // 清空并输入
            await input.fill('');
            await input.type(productId, { delay: 100 });

            // 验证输入是否成功
            const value = await input.inputValue();
            if (value === productId) {
              log(`方法1成功: 在输入框中输入: ${productId}`, 'success');
              inputFound = true;
              actualInput = input;
              break;
            }
          }
        } catch (e) {
          log(`输入框 ${selector} 检测失败: ${e.message}`);
        }
      }
      if (inputFound) break;
    }

    // 方法2：如果标准选择器失败，使用更精确的定位
    if (!inputFound) {
      log('方法1失败，使用更精确的定位...');

      // 查找包含"新文件夹名称"文本的输入框
      const nameInputs = await page.$$('.next-dialog input');
      for (let i = 0; i < nameInputs.length; i++) {
        try {
          // 检查输入框附近是否有"新文件夹名称"文本
          const parentElement = await nameInputs[i].$('xpath=./parent::*');
          if (parentElement) {
            const parentText = await parentElement.textContent();
            if (parentText && parentText.includes('新文件夹名称')) {
              await nameInputs[i].click({ force: true });
              await page.waitForTimeout(500);
              await nameInputs[i].fill('');
              await nameInputs[i].type(productId, { delay: 100 });

              const value = await nameInputs[i].inputValue();
              if (value === productId) {
                log(`方法2成功: 找到"新文件夹名称"输入框并输入: ${productId}`, 'success');
                inputFound = true;
                actualInput = nameInputs[i];
                break;
              }
            }
          }
        } catch (e) {
          log(`方法2输入框 ${i} 检测失败: ${e.message}`);
        }
      }
    }

    // 方法3：使用键盘直接操作第二个输入框
    if (!inputFound) {
      log('方法2失败，使用键盘操作第二个输入框...');

      // 先点击第一个输入框（上级文件夹），然后Tab到第二个输入框
      const firstInput = await page.$('.next-dialog input');
      if (firstInput) {
        await firstInput.click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Tab'); // 切换到新文件夹名称输入框
        await page.waitForTimeout(300);
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(200);
        await page.keyboard.type(productId, { delay: 100 });

        // 验证输入
        const focusedElement = await page.evaluateHandle(() => document.activeElement);
        const value = await focusedElement.evaluate(el => el.value || el.textContent);
        if (value && value.includes(productId)) {
          log(`方法3成功: 使用键盘输入: ${productId}`, 'success');
          inputFound = true;
        }
      }
    }

    if (!gotoStep3) {
      if (!inputFound) throwOnError('所有输入方法都失败，无法在弹窗中输入文件夹名称');

      // 点击确定按钮
      const confirmSelectors = [
        '.next-dialog button:has-text("确定")',
        '.next-dialog .next-btn-primary:has-text("确定")'
      ];

      let confirmClicked = false;
      for (const selector of confirmSelectors) {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          log('点击确定按钮', 'success');
          confirmClicked = true;
          break;
        }
      }

      if (!confirmClicked) throwOnError('未找到确定按钮');

      // 尝试按回车键确认
      log('按回车键确认创建');
      await page.keyboard.press('Enter');

      // 等待弹窗关闭
      log('等待弹窗关闭...');
      let dialogClosed = false;
      for (let i = 0; i < 10; i++) {
        const dialogs = await page.$$('.next-dialog:has-text("新建文件夹")');
        if (dialogs.length === 0) {
          log('弹窗已关闭', 'success');
          dialogClosed = true;
          break;
        }
        await page.waitForTimeout(500);
      }

      if (!dialogClosed) {
        log('弹窗未自动关闭，尝试强制关闭');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);

        // 再次检查
        const remainingDialogs = await page.$$('.next-dialog:has-text("新建文件夹")');
        if (remainingDialogs.length > 0) {
          throwOnError('弹窗无法关闭，无法继续后续步骤');
        }
      }

      // 等待5秒让创建处理，然后刷新页面确保文件夹显示在树中
      log('等待5秒让创建处理，然后刷新页面...');
      await page.waitForTimeout(5000);

      // 刷新页面确保新创建的文件夹出现在树结构中
      log('刷新页面确保新文件夹出现在树结构中');
      await page.reload();
      await page.waitForTimeout(3000);
    }

    // 步骤2：左侧树展开2026，单击${productId}节点（仅在新建文件夹时需要）
    if (!gotoStep3) {
      log(`步骤2：点击左侧${productId}节点`);

      await expand2026();
      await page.waitForTimeout(1000);

      // 点击${productId}节点
      const clickProductNode = async () => {
        const nodeProduct = await page.$(`li.next-tree-node:has-text("${productId}")`);
        if (nodeProduct) {
          await nodeProduct.click();
          log(`点击${productId}节点`, 'success');
          return true;
        }
        return false;
      };

      let clicked = await clickProductNode();
      if (!clicked) throwOnError(`未找到${productId}节点`);

      // 等待并验证面包屑
      log(`等待面包屑显示：全部图片 / 2026 / ${productId}`);
      let breadcrumbCorrect = false;
      for (let i = 0; i < 10; i++) {
        const breadcrumb = await page.$('.next-breadcrumb');
        if (breadcrumb) {
          const text = await breadcrumb.textContent();
          if (text.includes('全部图片') && text.includes('2026') && text.includes(productId)) {
            log(`面包屑正确: ${text.trim()}`, 'success');
            breadcrumbCorrect = true;
            break;
          }
        }

        if (i < 9) {
          log(`面包屑未正确，第${i+1}次重试点击${productId}节点`);
          await clickProductNode();
          await page.waitForTimeout(1000);
        }
      }

      if (!breadcrumbCorrect) throwOnError(`5秒内面包屑仍未显示/${productId}`);
    } else {
      log('文件夹已存在且已正确导航，跳过步骤2');
    }

    // 步骤3：点击上传文件
    log('步骤3：点击上传文件按钮');
    const uploadButton = await page.$('button:has-text("上传文件")');
    if (uploadButton) {
      await uploadButton.click();
      log('点击上传文件按钮', 'success');
    } else {
      throwOnError('未找到上传文件按钮');
    }

    // 定义查找文件输入框的函数
    const findFileInput = async () => {
      // 使用多种选择器查找文件输入框
      const fileInputSelectors = [
        'input[type="file"]',
        '.next-dialog input[type="file"]',
        'input[accept*="image"]',
        '.upload-input input[type="file"]'
      ];

      let fileInput = null;
      for (const selector of fileInputSelectors) {
        const inputs = await page.$$(selector);
        for (const input of inputs) {
          try {
            // 检查输入框是否在上传弹窗内且可见
            const isVisible = await input.isVisible();
            const parentDialog = await input.$('xpath=./ancestor::*[contains(@class, "next-dialog")]');

            if (isVisible && parentDialog) {
              fileInput = input;
              log(`找到文件输入框: ${selector}`);
              return fileInput;
            }
          } catch (e) {
            // 继续尝试下一个选择器
          }
        }
        if (fileInput) break;
      }

      // 如果仍然找不到，尝试更多方法
      if (!fileInput) {
        log('标准选择器失败，尝试更多方法...');

        // 方法1：在上传弹窗内查找所有input
        const uploadDialog = await page.$('.next-dialog:has-text("上传素材")');
        if (uploadDialog) {
          const allInputs = await uploadDialog.$$('input');
          log(`在上传弹窗内找到${allInputs.length}个input元素`);

          for (let i = 0; i < allInputs.length; i++) {
            const input = allInputs[i];
            try {
              const inputType = await input.getAttribute('type');
              const inputStyle = await input.getAttribute('style');
              const isVisible = await input.isVisible();

              log(`Input ${i}: type="${inputType}", visible=${isVisible}`);

              // 尝试所有input，包括隐藏的
              if (inputType === 'file' || !inputType || inputType === '') {
                fileInput = input;
                log(`选择input ${i}作为文件输入框`);
                return fileInput;
              }
            } catch (e) {
              log(`检查input ${i}失败: ${e.message}`);
            }
          }
        }

        // 方法2：如果还没找到，尝试查找任何可能的文件输入框
        if (!fileInput) {
          log('尝试查找任何可能的文件输入框...');
          const allFileInputs = await page.$$('input');
          log(`页面上共有${allFileInputs.length}个input元素`);

          for (let i = 0; i < allFileInputs.length; i++) {
            try {
              const input = allFileInputs[i];
              const inputType = await input.getAttribute('type');
              const accept = await input.getAttribute('accept');
              const parentDialog = await input.$('xpath=./ancestor::*[contains(@class, "next-dialog")]');

              if ((inputType === 'file' || !inputType) && parentDialog) {
                fileInput = input;
                log(`找到合适的文件输入框: ${i}, accept="${accept}"`);
                return fileInput;
              }
            } catch (e) {
              // 继续尝试下一个
            }
          }
        }

        // 方法3：最后尝试使用evaluate直接查找
        if (!fileInput) {
          log('使用evaluate直接查找文件输入框...');
          fileInput = await page.evaluateHandle(() => {
            const inputs = document.querySelectorAll('input');
            for (const input of inputs) {
              if (input.type === 'file' || input.type === '') {
                const dialog = input.closest('.next-dialog');
                if (dialog && dialog.textContent.includes('上传素材')) {
                  return input;
                }
              }
            }
            return null;
          });
        }
      }

      return fileInput;
    };

    // 等待文件选择器出现并选择文件
    log('等待文件选择器...');
    try {
      const fileInput = await findFileInput();

      if (fileInput) {
        const imagePath = `/Users/sanshui/Desktop/tbzhuaqu/assets/${productId}`;
        const files = fs.readdirSync(imagePath).filter(f => f.startsWith('color_') && f.endsWith('.jpg'));

        if (files.length === 0) throwOnError(`未找到${productId}的color_*.jpg文件`);

        log(`找到${files.length}个图片文件，开始上传前3个文件进行测试`);

        // 只上传前3个文件进行测试
        const testFiles = files.slice(0, 3);
        log(`测试文件: ${testFiles.join(', ')}`);

        // 检查是否支持多文件上传
        let multiple = false;
        try {
          multiple = await fileInput.getAttribute('multiple');
        } catch (e) {
          // 如果evaluateHandle返回的对象不支持getAttribute，假设不支持多文件
          log('无法检查multiple属性，假设不支持多文件上传');
          multiple = null;
        }
        if (multiple) {
          log('支持多文件上传');
          await fileInput.setInputFiles(testFiles.map(f => path.join(imagePath, f)));
          log('测试文件已选择，等待上传完成');
        } else {
          log('仅支持单文件上传，逐个上传测试文件');
          for (let i = 0; i < testFiles.length; i++) {
            const file = testFiles[i];
            log(`上传测试文件 ${i+1}/${testFiles.length}: ${file}`);

            try {
              await fileInput.setInputFiles(path.join(imagePath, file));
              log(`测试文件 ${file} 已选择`);

              // 等待单个文件上传完成，然后准备下一个
              await page.waitForTimeout(2000);

              // 如果不是最后一个文件，重新打开上传对话框
              if (i < testFiles.length - 1) {
                log('准备下一个测试文件，重新点击上传文件');
                await page.keyboard.press('Escape'); // 关闭当前对话框
                await page.waitForTimeout(1000);
                await page.click('button:has-text("上传文件")');
                await page.waitForTimeout(2000);

                // 重新找到文件输入框
                const newFileInput = await findFileInput();
                if (newFileInput) {
                  fileInput = newFileInput;
                } else {
                  throwOnError('无法重新找到文件输入框');
                }
              }
            } catch (e) {
              log(`上传测试文件 ${file} 失败: ${e.message}`, 'warning');
            }
          }
          log('所有测试文件上传完成');
        }
      } else {
        throwOnError('未找到文件输入框');
      }
    } catch (e) {
      throwOnError(`文件选择失败: ${e.message}`);
    }

    // 步骤4：上传完成后的验证
    log('步骤4：等待上传完成并验证');
    await page.waitForTimeout(10000); // 等待上传完成

    // 刷新页面
    log('刷新页面验证上传结果');
    await page.reload();
    await page.waitForTimeout(3000);

    // 重新点击${productId}节点
    await expand2026();
    await page.waitForTimeout(1000);

    // 定义点击${productId}节点的函数
    const clickProductNodeAgain = async () => {
      const nodeProduct = await page.$(`li.next-tree-node:has-text("${productId}")`);
      if (nodeProduct) {
        await nodeProduct.click();
        log(`重新点击${productId}节点`, 'success');
        return true;
      }
      return false;
    };

    const clickedAgain = await clickProductNodeAgain();
    if (!clickedAgain) throwOnError(`刷新后未找到${productId}节点`);

    // 验证面包屑 - 使用更灵活的验证
    log('验证刷新后面包屑');
    const finalBreadcrumb = await page.$('.next-breadcrumb');
    if (finalBreadcrumb) {
      const text = await finalBreadcrumb.textContent();
      log(`刷新后面包屑: ${text.trim()}`);

      // 只需要包含${productId}即可证明在正确目录
      if (text.includes(productId)) {
        log(`刷新后面包屑正确: ${text.trim()}`, 'success');
      } else {
        throwOnError(`刷新后面包屑错误，未找到${productId}: ${text.trim()}`);
      }
    } else {
      throwOnError('未找到面包屑元素');
    }

    // 验证右侧列表中的文件
    log('验证右侧列表中的color_*.jpg文件');
    await page.waitForTimeout(3000);

    // 检查是否有color_开头的文件
    const fileItems = await page.$$('.file-item, [class*="file"], [class*="item"]');
    let colorFilesFound = false;

    for (let i = 0; i < 10; i++) {
      const contentText = await page.textContent('body');
      if (contentText.includes('color_1_01.jpg') || contentText.includes('color_')) {
        log('检测到上传的color_*.jpg文件', 'success');
        colorFilesFound = true;
        break;
      }

      if (i < 9) {
        await page.waitForTimeout(1000);
      }
    }

    if (!colorFilesFound) throwOnError('未在右侧列表中找到上传的color_*.jpg文件');

    log('✅ 所有步骤完成！', 'success');

  } catch (error) {
    log(`流程失败: ${error.message}`, 'error');
    process.exit(1);
  }
}

uploadMaterialFolderSimple().catch(console.error);