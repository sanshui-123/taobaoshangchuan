const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤13：提交商品
 * 执行最终提交，处理验证和结果获取
 */
const step13 = async (ctx) => {
  ctx.logger.info('开始提交商品');

  // 创建心跳定时器
  const heartbeat = setInterval(() => {
    process.stdout.write('.');
  }, 5000);

  try {
    // 检查是否有页面引用
    if (!ctx.page1) {
      throw new Error('未找到发布页面，请先执行步骤4');
    }

    const page = ctx.page1;
    const productId = ctx.productId;

    // 加载缓存获取任务信息
    const taskCache = loadTaskCache(productId);
    if (!taskCache) {
      throw new Error('未找到任务缓存');
    }

    // 步骤0：选择上架时间（放入仓库）
    ctx.logger.info('\n[步骤0] 选择上架时间 - 放入仓库');

    // 查找"放入仓库"单选按钮
    const warehouseSelectors = [
      'input[type="radio"][name="放入仓库"]',
      'input.next-radio-input[name="放入仓库"]',
      'label:has-text("放入仓库") input[type="radio"]',
      '//label[contains(text(), "放入仓库")]/..//input[@type="radio"]'
    ];

    let warehouseRadio = null;
    for (const selector of warehouseSelectors) {
      if (selector.startsWith('//')) {
        // XPath selector
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          warehouseRadio = elements[0];
          ctx.logger.info(`找到"放入仓库"选项 (XPath)`);
          break;
        }
      } else {
        warehouseRadio = await page.$(selector);
        if (warehouseRadio) {
          ctx.logger.info(`找到"放入仓库"选项: ${selector}`);
          break;
        }
      }
    }

    // 如果没找到，尝试通过文本查找
    if (!warehouseRadio) {
      // 尝试通过getByText查找并点击
      try {
        const warehouseOption = page.getByText('放入仓库', { exact: true });
        await warehouseOption.click();
        ctx.logger.info('✅ 通过文本定位选择了"放入仓库"');
      } catch (e) {
        // 如果还是找不到，尝试点击包含文本的父元素
        try {
          await page.locator('text=放入仓库').click();
          ctx.logger.info('✅ 通过locator选择了"放入仓库"');
        } catch (e2) {
          ctx.logger.warn('未找到"放入仓库"选项，继续执行...');
        }
      }
    } else {
      // 检查是否已经选中
      const isChecked = await warehouseRadio.isChecked();
      if (!isChecked) {
        await warehouseRadio.click();
        ctx.logger.info('✅ 已选择"放入仓库"');
      } else {
        ctx.logger.info('✅ "放入仓库"已经被选中');
      }
    }

    await page.waitForTimeout(800);

    // 步骤1：提交前验证
    ctx.logger.info('\n[步骤1] 提交前验证');

    // 检查所有必填项是否完成
    const requiredSteps = [6, 7, 8, 9, 10, 12]; // 品牌、货号、颜色、尺码、价格、详情
    const incompleteSteps = requiredSteps.filter(step => {
      const cache = loadTaskCache(productId);
      return cache.stepStatus[step] !== 'done';
    });

    if (incompleteSteps.length > 0) {
      ctx.logger.warn(`以下步骤未完成: ${incompleteSteps.join(', ')}`);
      ctx.logger.warn('建议先完成所有必填步骤再提交');
    }

    // 检查页面是否有错误提示
    const errorMessages = await page.$$('.error-message, .field-error, .validation-error');
    const pageErrors = [];

    for (const error of errorMessages) {
      const errorText = await error.textContent();
      if (errorText && errorText.trim()) {
        pageErrors.push(errorText.trim());
      }
    }

    if (pageErrors.length > 0) {
      ctx.logger.error('发现页面错误:');
      pageErrors.forEach(error => ctx.logger.error(`  - ${error}`));
      throw new Error(`页面存在${pageErrors.length}个错误，请修正后重试`);
    }

    ctx.logger.success('✅ 页面验证通过');

    // 步骤2：执行提交
    ctx.logger.info('\n[步骤2] 执行商品提交');

    // 查找提交按钮
    const submitSelectors = [
      'button:has-text("提交宝贝信息")',  // 优先查找"提交宝贝信息"按钮
      'button.next-btn.next-btn-primary.next-large:has-text("提交宝贝信息")',
      'button:has-text("立即发布")',
      'button:has-text("发布商品")',
      'button:has-text("提交")',
      '.submit-btn',
      '.publish-btn',
      'button[type="submit"]',
      '.btn-publish'
    ];

    let submitButton = null;
    for (const selector of submitSelectors) {
      const candidate = await page.$(selector);
      if (candidate) {
        const text = (await candidate.textContent() || '').trim();
        if (/返回旧版/.test(text) || /^返回/.test(text)) {
          ctx.logger.info(`跳过疑似“返回旧版”按钮: ${selector} -> "${text}"`);
          continue;
        }
        submitButton = candidate;
        ctx.logger.info(`找到提交按钮: ${selector} -> "${text}"`);
        break;
      }
    }

    if (!submitButton) {
      throw new Error('未找到提交按钮，可能页面还未完全加载');
    }

    // 检查按钮是否可用
    const isDisabled = await submitButton.isDisabled();
    if (isDisabled) {
      throw new Error('提交按钮不可用，可能还有必填项未完成');
    }

    // 清理可能遮挡提交按钮的元素，并使用JavaScript直接点击
    ctx.logger.info('准备点击提交按钮（清理遮挡+JS点击）...');
    try {
      await submitButton.evaluate((button) => {
        // 1. 清理可能遮挡的元素
        const blockers = [
          '#sku-preview-iframe',
          '.iframe.trans#sku-preview-iframe',
          '.next-overlay-wrapper.v2.opened',
          '#mainImagesGroup',
          '.container-ZETowy',
          '.next-menu.next-nav'
        ];
        blockers.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
          });
        });

        // 2. 滚动到按钮位置
        button.scrollIntoView({ behavior: 'auto', block: 'center' });

        // 3. 直接点击按钮（绕过所有可见性检查）
        button.click();
      });
      ctx.logger.info('✅ 已通过JavaScript成功点击提交按钮');
      await page.waitForTimeout(800);
    } catch (clickError) {
      ctx.logger.error(`JavaScript点击失败: ${clickError.message}`);
      throw clickError;
    }

    // 检测"商品发布违规提醒"弹窗 - 循环持续检测（增强版）
    ctx.logger.info('\n[检测违规提醒弹窗] 启动循环检测...');
    let violationDialogDetected = false;

    try {
      const dialogCandidates = [
        { locator: page.locator('.next-dialog:has-text("商品发布违规提醒")'), name: '.next-dialog' },
        { locator: page.locator('[role="dialog"]:has-text("商品发布违规提醒")'), name: '[role="dialog"]' },
        { locator: page.locator('div:has-text("商品发布违规提醒"):has(button:has-text("返回修改"))'), name: 'div with button' },
        { locator: page.locator('div:has-text("流量严重受损"):has(button:has-text("返回修改"))'), name: '流量严重受损' },
        { locator: page.locator('.next-overlay-wrapper:has-text("商品发布违规提醒")'), name: '.next-overlay-wrapper' },
        { locator: page.locator('[class*="dialog"]:has-text("违规")'), name: 'dialog with 违规' }
      ];

      let violationDialog = null;
      let matchedSelector = null;

      // 循环检测 15 秒，每 1 秒检查一次
      const maxAttempts = 15;
      let attempt = 0;

      while (attempt < maxAttempts && !violationDialog) {
        attempt++;

        // 每次循环检查所有候选选择器
        for (const candidate of dialogCandidates) {
          if (!candidate.locator) continue;
          try {
            // 使用较短的超时时间，快速尝试
            const isVisible = await candidate.locator.first().isVisible({ timeout: 500 });
            if (isVisible) {
              violationDialog = candidate.locator.first();
              matchedSelector = candidate.name;
              ctx.logger.info(`  ✅ 第 ${attempt} 次检测：通过 ${matchedSelector} 检测到违规弹窗`);
              violationDialogDetected = true;
              break;
            }
          } catch (e) {
            // 继续尝试下一个候选
          }
        }

        if (!violationDialog) {
          // 每隔 1 秒重试
          await page.waitForTimeout(1000);
          if (attempt % 3 === 0) {
            ctx.logger.info(`  🔍 第 ${attempt}/${maxAttempts} 次检测中...`);
          }
        }
      }

      if (attempt >= maxAttempts && !violationDialog) {
        ctx.logger.info(`  ℹ️ 循环检测 ${maxAttempts} 次后未发现对话框`);
      }

      if (!violationDialog) {
        ctx.logger.info('  ℹ️ 未通过对话框选择器检测到违规弹窗');
        ctx.logger.info('  🔍 启动全局兜底检测：直接查找"返回修改"按钮...');

        // 全局兜底：尝试多种按钮文字变体
        const backBtnTextVariants = [
          'button:has-text("返回修改")',
          'button:has-text("返回编辑")',
          'button:has-text("修改")',
          'button:has-text("返回")',
          '.next-btn:has-text("返回")',
          '.next-btn:has-text("修改")'
        ];

        let globalBackBtn = null;

        // 循环尝试所有按钮文字变体
        for (const btnSelector of backBtnTextVariants) {
          try {
            const btn = page.locator(btnSelector).first();
            const isVisible = await btn.isVisible({ timeout: 1000 });
            if (isVisible) {
              globalBackBtn = btn;
              ctx.logger.warn(`  ⚠️ 全局兜底成功：找到按钮 "${btnSelector}"！`);
              break;
            }
          } catch (e) {
            // 继续尝试下一个变体
          }
        }

        if (globalBackBtn) {
          try {

            // 点击"返回修改"
            await globalBackBtn.click({ force: true, timeout: 3000 });
            ctx.logger.info('  ✅ 已点击"返回修改"（全局兜底），等待弹窗关闭...');
            await page.waitForTimeout(2000);

            // 等待任何可能的弹窗消失（使用通用选择器）
            try {
              await page.locator('.next-dialog, [role="dialog"], .next-overlay-wrapper').first()
                .waitFor({ state: 'hidden', timeout: 5000 });
              ctx.logger.info('  ✅ 弹窗已关闭');
            } catch (e) {
              ctx.logger.warn('  ⚠️ 等待弹窗关闭超时，继续执行');
            }

            // 重新提交（使用相同的清理逻辑）
            ctx.logger.info('  🔄 准备重新提交商品（全局兜底）...');

            // 等待页面稳定（按钮可能需要重新渲染）
            await page.waitForTimeout(3000);
            ctx.logger.info('  ⏳ 已等待页面稳定，开始查找提交按钮...');

            // 调试：列出页面上所有可见的按钮
            try {
              const allButtons = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons
                  .filter(btn => {
                    const rect = btn.getBoundingClientRect();
                    const style = window.getComputedStyle(btn);
                    return style.display !== 'none' &&
                           style.visibility !== 'hidden' &&
                           rect.width > 0 &&
                           rect.height > 0;
                  })
                  .map(btn => ({
                    text: btn.textContent.trim().substring(0, 30),
                    className: btn.className.substring(0, 50)
                  }));
              });
              ctx.logger.info(`  📋 页面上可见的按钮数量: ${allButtons.length}`);
              if (allButtons.length > 0) {
                ctx.logger.info(`  📋 所有按钮列表:`);
                allButtons.forEach((btn, idx) => {
                  ctx.logger.info(`    ${idx + 1}. "${btn.text}" (${btn.className})`);
                });
              }
            } catch (e) {
              ctx.logger.warn(`  ⚠️ 调试按钮列表失败: ${e.message}`);
            }

            const submitSelectors = [
              'button:has-text("提交宝贝信息")',
              'button:has-text("继续发布")',
              'button.next-btn-primary:has-text("提交")',
              'button:has-text("发布")',
              'button:has-text("提交")'
            ];

            let freshSubmit = null;
            for (const selector of submitSelectors) {
              try {
                ctx.logger.info(`  🔍 尝试选择器: ${selector}`);
                const btn = page.locator(selector).first();

                // 增加超时时间
                const isVisible = await btn.isVisible({ timeout: 5000 });
                if (isVisible) {
                  const text = (await btn.textContent() || '').trim();
                  if (/返回旧版/.test(text) || /^返回/.test(text)) {
                    ctx.logger.info(`  ⏭️ 跳过疑似“返回旧版”按钮: ${selector} -> "${text}"`);
                    continue;
                  }
                  freshSubmit = btn;
                  ctx.logger.info(`  ✅ 重新找到提交按钮: ${selector} -> "${text}"`);
                  break;
                }
              } catch (e) {
                ctx.logger.warn(`  ⚠️ 选择器 ${selector} 未找到，尝试下一个`);
              }
            }

            if (freshSubmit) {
              try {
                await freshSubmit.evaluate((button) => {
                  const blockers = [
                    '#sku-preview-iframe',
                    '.iframe.trans#sku-preview-iframe',
                    '.next-overlay-wrapper.v2.opened',
                    '#mainImagesGroup',
                    '.container-ZETowy',
                    '.next-menu.next-nav'
                  ];
                  blockers.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => {
                      el.style.setProperty('display', 'none', 'important');
                      el.style.setProperty('visibility', 'hidden', 'important');
                      el.style.setProperty('pointer-events', 'none', 'important');
                    });
                  });
                  button.scrollIntoView({ behavior: 'auto', block: 'center' });
                  button.click();
                });
                ctx.logger.info('  ✅ 已处理违规提醒并重新提交商品（全局兜底）');
                await page.waitForTimeout(2000);
              } catch (resubmitError) {
                ctx.logger.error(`  ❌ 重新提交失败: ${resubmitError.message}`);
              }
            } else {
              ctx.logger.error('  ❌ 未找到提交按钮，无法重新提交');
            }
          } catch (clickError) {
            ctx.logger.error(`  ❌ 全局兜底点击失败: ${clickError.message}`);
          }
        } else {
          ctx.logger.info('  ℹ️ 全局兜底：未找到任何"返回修改"相关按钮，继续正常流程');
        }
      } else {
        ctx.logger.warn('⚠️ 检测到"商品发布违规提醒"弹窗，尝试点击"继续提交"按钮');

        // 尝试多种方式查找"继续提交"按钮（在弹窗内，位于"返回修改"左侧）
        const continueSubmitSelectors = [
          violationDialog.locator('button:has-text("继续提交")'),
          violationDialog.locator('button:has-text("继续发布")'),
          violationDialog.locator('button:has-text("确认提交")'),
          violationDialog.locator('button:has-text("确认发布")'),
          violationDialog.locator('.next-btn-primary:has-text("继续")'),
          violationDialog.locator('.next-btn-primary:has-text("提交")'),
          page.getByRole('button', { name: /继续提交/i }),
          page.getByRole('button', { name: /继续发布/i }),
          page.locator('button:has-text("继续提交")'),
          page.locator('button:has-text("继续发布")')
        ];

        let continueBtn = null;
        let matchedSelector = null;
        for (let i = 0; i < continueSubmitSelectors.length; i++) {
          const selector = continueSubmitSelectors[i];
          try {
            if (await selector.first().isVisible({ timeout: 2000 })) {
              continueBtn = selector.first();
              matchedSelector = `选择器 #${i + 1}`;
              ctx.logger.info(`  ✅ 找到"继续提交"按钮 (${matchedSelector})`);
              break;
            }
          } catch (e) {
            // 继续尝试下一个选择器
          }
        }

        if (continueBtn) {
          try {
            // 直接点击"继续提交"按钮，无需返回修改
            await continueBtn.click({ force: true, timeout: 3000 });
            ctx.logger.info('  ✅ 已点击"继续提交"按钮，等待弹窗关闭...');
            await page.waitForTimeout(2000);

            // 等待弹窗消失
            try {
              await violationDialog.waitFor({ state: 'hidden', timeout: 5000 });
              ctx.logger.info('  ✅ 违规弹窗已关闭，商品提交中...');
            } catch (e) {
              ctx.logger.warn('  ⚠️ 等待弹窗关闭超时，继续执行');
            }

            // 等待一下让提交处理完成
            await page.waitForTimeout(2000);
            ctx.logger.info('  ✅ 已处理违规提醒并继续提交商品');

          } catch (clickError) {
            ctx.logger.error(`  ❌ 点击"继续提交"失败: ${clickError.message}`);
          }
        } else {
          ctx.logger.warn('  ⚠️ 未找到"继续提交"按钮，继续后续流程');
        }
      }
    } catch (e) {
      ctx.logger.warn(`  ⚠️ 检测违规提醒弹窗失败: ${e.message}，继续后续流程`);
    }

    // 步骤3：等待页面跳转到成功页面（关键修复：等待URL包含success）
    ctx.logger.info('\n[步骤3] 等待页面跳转到成功页面');

    let reachedSuccessPage = false;

    // 方法1：直接等待URL包含success（最可靠）
    try {
      await page.waitForURL('**/success.htm**', { timeout: 30000 });
      ctx.logger.success('✅ 已跳转到成功页面（URL包含success.htm）');
      reachedSuccessPage = true;
    } catch (urlWaitError) {
      ctx.logger.warn(`waitForURL超时，尝试循环检查URL...`);

      // 方法2：循环检查URL，等待跳转到成功页面
      let checkCount = 0;
      const maxChecks = 30; // 最多检查30次，每次1秒

      while (checkCount < maxChecks) {
        await page.waitForTimeout(800);

        try {
          const currentUrl = page.url();

          if (currentUrl.includes('success')) {
            ctx.logger.success(`✅ 检测到成功页面（第${checkCount + 1}次检查）`);
            reachedSuccessPage = true;
            break;
          }

          checkCount++;
          if (checkCount % 5 === 0) {
            ctx.logger.info(`等待跳转（${checkCount}/${maxChecks}）...`);
          }
        } catch (urlError) {
          // 获取URL可能因为页面跳转而失败，继续尝试
          ctx.logger.warn(`获取URL失败（第${checkCount}次），继续等待...`);
          checkCount++;
        }
      }

      if (!reachedSuccessPage) {
        ctx.logger.warn(`等待${maxChecks}秒后仍未检测到成功页面`);
      }
    }

    // 步骤4：检查提交结果（仅基于URL判断）
    ctx.logger.info('\n[步骤4] 检查提交结果');

    let submitResult = null;

    try {
      // 获取当前URL
      const currentUrl = page.url();
      ctx.logger.info(`当前页面URL: ${currentUrl}`);

      // 检查URL是否包含成功标识
      if (currentUrl.includes('success') ||
          currentUrl.includes('result') ||
          currentUrl.includes('publish/success')) {

        ctx.logger.success('✅ 检测到成功页面URL，商品提交成功！');

        submitResult = {
          status: 'success',
          message: '商品提交成功，页面已跳转',
          productId: null  // 稍后获取
        };

        // 🔒 设置防重试标志：提交成功后，阻止阶段B重试
        ctx.disablePhaseBRetry = true;
        ctx.logger.info('🔒 已设置防重试标志，后续错误不会触发阶段B重试');

        // 🔒 立即保存成功状态到缓存，确保catch块能正确检测
        taskCache.submitResults = {
          status: 'success',
          message: '商品提交成功，页面已跳转',
          submitTime: new Date().toISOString()
        };
        saveTaskCache(productId, taskCache);
        ctx.logger.info('💾 成功状态已保存到缓存');

      } else if (currentUrl.includes('copyItem=true')) {
        // 检测到 copyItem=true，说明淘宝可能已创建草稿但跳转到了复制/编辑页面
        const itemIdMatch = currentUrl.match(/itemId=(\d+)/);
        const taobaoItemId = itemIdMatch ? itemIdMatch[1] : null;

        if (taobaoItemId) {
          ctx.logger.warn(`⚠️ 检测到 copyItem 页面，淘宝已创建商品草稿 (ID: ${taobaoItemId})，但可能因违规未正式发布`);
          ctx.logger.warn('  这通常表示提交时出现了违规提醒，但违规弹窗可能未被正确处理');
          ctx.logger.info(`  建议手动检查淘宝后台商品: https://item.upload.taobao.com/sell/v2/publish.htm?itemId=${taobaoItemId}`);

          submitResult = {
            status: 'draft',
            message: `商品草稿已创建 (ID: ${taobaoItemId})，但可能因违规未正式发布。URL: ${currentUrl}`,
            taobaoItemId: taobaoItemId
          };
        } else {
          ctx.logger.warn(`⚠️ 检测到 copyItem 页面，但无法提取商品ID: ${currentUrl}`);
          submitResult = {
            status: 'unknown',
            message: `页面跳转到 copyItem 页面，请手动检查: ${currentUrl}`
          };
        }
      } else {
        // URL不包含成功标识，记录但不抛错
        ctx.logger.warn(`⚠️ 页面URL未包含成功标识: ${currentUrl}`);
        submitResult = {
          status: 'unknown',
          message: `页面跳转到: ${currentUrl}，请手动检查`
        };
      }
    } catch (urlError) {
      // 获取URL失败也不抛错，记录失败原因
      ctx.logger.error(`获取页面URL失败: ${urlError.message}`);
      submitResult = {
        status: 'unknown',
        message: `无法获取页面URL: ${urlError.message}`
      };
    }

    // 步骤5：获取商品ID（如果提交成功）
    let taobaoProductId = null;
    if (submitResult.status === 'success') {
      ctx.logger.info('\n[步骤5] 获取商品ID');

      // 等待页面稳定
      try {
        await page.waitForTimeout(800);
      } catch (waitError) {
        ctx.logger.warn(`等待页面稳定失败: ${waitError.message}`);
      }

      // 尝试从页面获取商品ID（使用try/catch，失败不影响流程）
      try {
        taobaoProductId = await page.evaluate(() => {
          // 从URL中提取商品ID（最可靠的方式）
          const urlMatch = window.location.href.match(/primaryId=(\d+)/);
          if (urlMatch) {
            return urlMatch[1];
          }

          // 备选方案：从页面元素获取
          const selectors = [
            '[data-product-id]',
            '.product-id',
            '.item-id',
            '[data-item-id]'
          ];

          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
              return element.textContent || element.getAttribute('data-product-id') || element.getAttribute('data-item-id');
            }
          }

          return null;
        });

        if (taobaoProductId) {
          ctx.logger.success(`✅ 获取到商品ID: ${taobaoProductId}`);
        } else {
          ctx.logger.warn('⚠️ 未能从页面获取商品ID（不影响提交结果）');
        }
      } catch (evalError) {
        // 获取商品ID失败不影响整体流程
        ctx.logger.warn(`⚠️ 获取商品ID时出错: ${evalError.message}（不影响提交结果）`);
      }
    }

    // 步骤6：更新飞书状态为"已上传到淘宝"（只写流程状态，不回填链接/商品ID）
    ctx.logger.info('\n[步骤6] 更新飞书状态');

    // 从 ctx 或 taskCache 中获取飞书记录ID
    const feishuRecordId = ctx.feishuRecordId || taskCache.feishuRecordId;

    if (feishuRecordId) {
      const doneValue = process.env.FEISHU_STATUS_DONE_VALUE || '已上传到淘宝';
      const errorValue = process.env.FEISHU_STATUS_ERROR_VALUE || '上传失败';
      const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';

      const updateFields = {
        [statusField]: submitResult.status === 'success' ? doneValue : errorValue
      };

      // 不再覆盖飞书原始商品链接，若需要淘宝链接可单独添加字段

      try {
        await feishuClient.updateRecord(feishuRecordId, updateFields);
        ctx.logger.success(`✅ 飞书状态已更新为"${doneValue}"`);
      } catch (updateError) {
        ctx.logger.error(`更新飞书状态失败: ${updateError.message}`);
      }
    } else {
      ctx.logger.warn('未找到飞书记录ID，跳过状态更新');
    }

    // 更新缓存
    taskCache.submitResults = {
      status: submitResult.status,
      message: submitResult.message,
      submitTime: new Date().toISOString()
      // taobaoProductId, taobaoUrl, screenshot 暂时不需要
    };

    // 标记步骤12（提交商品）为完成
    if (submitResult.status === 'success') {
      taskCache.stepStatus = taskCache.stepStatus || {};
      taskCache.stepStatus[12] = 'done';
    }

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n=== 商品提交完成 ===');
    ctx.logger.info(`提交状态: ${submitResult.status === 'success' ? '✅ 成功' : '⚠️ 未知'}`);
    ctx.logger.info(`提交信息: ${submitResult.message}`);

    // 只有明确失败时才抛错，成功或未知状态都不抛错
    // 这样避免了因为后续步骤失败（如获取商品ID失败）而触发重试
    if (submitResult.status === 'failed') {
      throw new Error(`商品提交失败: ${submitResult.message}`);
    } else if (submitResult.status === 'unknown') {
      ctx.logger.warn('⚠️ 提交结果未知，建议手动检查淘宝后台');
      // 不抛错，避免触发重试
    }

  } catch (error) {
    // 检查是否已经有submitResult，如果已经判定成功，则不再抛错
    const taskCache = loadTaskCache(ctx.productId);
    const hasSucceeded = taskCache?.submitResults?.status === 'success';

    if (hasSucceeded) {
      // 如果已经判定提交成功，即使后续步骤失败也不抛错
      ctx.logger.warn(`⚠️ 商品已提交成功，但后续步骤出错: ${error.message}`);
      ctx.logger.info('✅ 商品提交成功，忽略后续错误，避免重复提交');
      return; // 直接返回，不抛错
    }

    // 如果还没判定成功，说明是提交过程中的错误，需要抛出
    ctx.logger.error(`商品提交过程出错: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_STATUS_FIELD || '上传状态']: '发布失败',
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `步骤13失败: ${error.message}`
        });
      } catch (updateError) {
        ctx.logger.error(`更新飞书错误日志失败: ${updateError.message}`);
      }
    }

    throw error;

  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');
  }
};

module.exports = { step13 };
