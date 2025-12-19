const path = require('path');

async function isTaobaoHumanVerifyVisible(page) {
  const candidates = [
    // 常见滑块容器（阿里系 noCaptcha）
    '.nc-container',
    '#nc_1_wrapper',
    '#nocaptcha',
    // 一些页面会用 iframe 承载验证
    'iframe[src*="captcha"], iframe[src*="verify"], iframe[name*="captcha"], iframe[name*="verify"]',
    // 文案兜底（不同渠道可能文字不同）
    'text=/请完成验证|安全验证|滑动验证|向右滑动|拖动滑块|验证码/'
  ];

  for (const selector of candidates) {
    const visible = await page.locator(selector).first().isVisible({ timeout: 300 }).catch(() => false);
    if (visible) return true;
  }

  return false;
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

