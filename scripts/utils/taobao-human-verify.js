const path = require('path');

async function isTaobaoHumanVerifyVisible(page) {
  const isVisible = async (selector) => {
    return await page.locator(selector).first().isVisible({ timeout: 300 }).catch(() => false);
  };

  // 1) 先用“高置信度文案”判断（避免误把其它弹窗当验证码）
  const instructionText = await isVisible(
    'text=/请完成验证|安全验证|滑动验证|向右滑动|拖动滑块|拖动到最右边|请按住滑块|完成验证/'
  );
  if (instructionText) return true;

  // 2) 再检查 noCaptcha 关键容器/滑块按钮
  const containerSelectors = [
    '.nc-container',
    '#nc_1_wrapper',
    '#nocaptcha'
  ];
  for (const selector of containerSelectors) {
    if (!await isVisible(selector)) continue;

    // 容器可见时，再确认滑块按钮/提示文案可见（避免被普通提示/上传结果误判）
    const hasHandle = await isVisible('#nc_1_n1z, [id$="_n1z"], [class*="nc_iconfont"], [class*="nc-lang-cnt"]');
    if (hasHandle) return true;
  }

  // 3) 一些页面会用 iframe 承载验证（只做 url 关键词判定，避免宽泛误判）
  const captchaIframe = await isVisible(
    'iframe[src*="captcha"], iframe[src*="verify"], iframe[name*="captcha"], iframe[name*="verify"]'
  );
  if (captchaIframe) return true;

  // 4) 最后兜底：仅当“nc_”相关元素可见时认为是验证码
  const ncVisible = await isVisible('#nc_1, #nc_1_n1z, [id^="nc_"]');
  return ncVisible;
}

/**
 * 检测到淘宝滑动/人机验证时，暂停等待人工完成。
 * 注意：这里不尝试自动破解验证码，只做“检测 + 等待”。
 */
async function waitForTaobaoHumanVerify(page, logger, options = {}) {
  const timeoutMs = Number(
    options.timeoutMs ??
      process.env.TAOBAO_HUMAN_VERIFY_WAIT_MS ??
      10 * 60 * 1000
  );
  const pollIntervalMs = Number(options.pollIntervalMs ?? 1000);
  const screenshotDir = options.screenshotDir ||
    process.env.TAOBAO_SCREENSHOT_DIR ||
    path.resolve(process.cwd(), 'screenshots');

  const found = await isTaobaoHumanVerifyVisible(page);
  if (!found) return false;

  logger.warn('⚠️ 检测到淘宝安全验证/滑动验证码，请在浏览器窗口手动完成验证；脚本将等待验证消失后继续...');
  await page.bringToFront().catch(() => {});

  const start = Date.now();
  let lastLogAt = 0;

  while (Date.now() - start < timeoutMs) {
    const stillVisible = await isTaobaoHumanVerifyVisible(page);
    if (!stillVisible) {
      logger.success('✅ 已检测到验证完成，继续执行');
      return true;
    }

    const elapsed = Date.now() - start;
    if (elapsed - lastLogAt > 10000) {
      lastLogAt = elapsed;
      logger.info(`⏳ 等待人工验证中... ${(elapsed / 1000).toFixed(0)}s`);
    }

    await page.waitForTimeout(pollIntervalMs);
  }

  // 超时：保存截图，方便排查
  try {
    const file = path.join(screenshotDir, `taobao_human_verify_timeout_${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: false, timeout: 10000 });
    logger.warn(`📸 已保存验证超时截图: ${file}`);
  } catch (e) {
    // ignore
  }

  throw new Error(`淘宝安全验证等待超时（${timeoutMs}ms），请手动完成后重试`);
}

module.exports = {
  isTaobaoHumanVerifyVisible,
  waitForTaobaoHumanVerify
};
