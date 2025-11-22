const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
const browserManager = require('../utils/browser-manager');

/**
 * 步骤3：登录并保存storage状态
 * 通过实际访问检测登录状态，而不是仅检查文件时间
 */
const step3 = async (ctx) => {
  ctx.logger.info('检查登录状态');

  // 如果标记为跳过，直接返回
  const taskCachePre = loadTaskCache(ctx.productId);
  if (taskCachePre.stepStatus && taskCachePre.stepStatus[3] === 'skipped') {
    ctx.logger.info('⚠️ 步骤3已标记为跳过，直接结束');
    updateStepStatus(ctx.productId, 3, 'skipped');
    return;
  }

  // 获取storage路径
  const storagePath = process.env.TAOBAO_STORAGE_STATE_PATH ||
    path.resolve(process.cwd(), 'storage', 'taobao-storage-state.json');

  ctx.storagePath = storagePath;

  // 创建心跳定时器
  const heartbeat = setInterval(() => {
    process.stdout.write('.');
  }, 5000);

  try {
    // 通过实际访问检测登录状态
    const isLoggedIn = await checkLoginByAccess(ctx);

    if (isLoggedIn) {
      ctx.logger.success('✅ 登录状态有效（实际访问检测）');

      // 即使登录有效，也要检查storage文件是否存在，以便其他步骤使用
      if (!fs.existsSync(storagePath)) {
        ctx.logger.info('虽然已登录，但storage文件不存在，保存当前状态...');
        await saveCurrentStorageState(ctx);
      } else {
        // 显示文件信息
        const stats = fs.statSync(storagePath);
        const fileAge = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
        ctx.logger.info(`Storage路径: ${storagePath}`);
        ctx.logger.info(`文件年龄: ${fileAge.toFixed(1)}小时`);
      }

      // 更新缓存
      const taskCache = loadTaskCache(ctx.productId);
      taskCache.storagePath = storagePath;
      taskCache.storageValid = true;
      taskCache.loginTime = new Date().toISOString();
      saveTaskCache(ctx.productId, taskCache);

    } else {
      ctx.logger.warn('登录状态无效，需要重新登录');
      await performLogin(ctx);
    }

    updateStepStatus(ctx.productId, 3, 'done');

  } catch (error) {
    ctx.logger.error(`登录检查失败: ${error.message}`);
    updateStepStatus(ctx.productId, 3, 'failed');
    throw error;
  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');
  }
};

/**
 * 通过实际访问页面检测登录状态
 */
async function checkLoginByAccess(ctx) {
  try {
    ctx.logger.info('通过实际访问检测登录状态...');

    // 使用browser-manager获取页面
    const page = await browserManager.getPage();

    // 访问千牛卖家中心首页
    ctx.logger.info('访问千牛卖家中心...');
    const response = await page.goto('https://myseller.taobao.com/home.htm', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 等待一下让页面稳定
    await page.waitForTimeout(2000);

    // 获取当前URL
    const currentUrl = page.url();
    ctx.logger.info(`当前页面URL: ${currentUrl}`);

    // 检查是否被重定向到登录页面
    if (currentUrl.includes('login.taobao.com') ||
        currentUrl.includes('passport') ||
        currentUrl.includes('login.htm')) {
      ctx.logger.info('检测到登录页面重定向');
      return false;
    }

    // 检查是否在卖家中心首页
    if (!currentUrl.includes('myseller.taobao.com')) {
      ctx.logger.info('不在卖家中心页面');
      return false;
    }

    // 检查页面是否有用户信息元素
    try {
      // 尝试查找用户信息相关元素
      const userInfoSelectors = [
        '.user-nick',
        '.header-user',
        '.user-info',
        '.seller-nav',
        '.menu-list',
        '#J_SiteNav'
      ];

      let hasUserInfo = false;
      for (const selector of userInfoSelectors) {
        const element = await page.$(selector);
        if (element) {
          hasUserInfo = true;
          ctx.logger.info(`找到用户信息元素: ${selector}`);
          break;
        }
      }

      if (!hasUserInfo) {
        // 即使没找到用户信息元素，如果能正常访问页面也认为已登录
        const pageTitle = await page.title();
        ctx.logger.info(`页面标题: ${pageTitle}`);

        if (pageTitle.includes('千牛') || pageTitle.includes('卖家')) {
          ctx.logger.info('页面标题显示已在卖家中心');
          return true;
        }
      }

      return hasUserInfo;

    } catch (checkError) {
      ctx.logger.warn(`检查用户信息元素时出错: ${checkError.message}`);

      // 如果检查出错但URL正确，认为已登录
      if (currentUrl.includes('myseller.taobao.com/home.htm')) {
        return true;
      }
      return false;
    }

  } catch (error) {
    ctx.logger.error(`访问检测失败: ${error.message}`);

    // 如果访问超时或出错，回退到文件检查
    if (fs.existsSync(ctx.storagePath)) {
      const stats = fs.statSync(ctx.storagePath);
      const fileAge = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);

      // 如果文件存在且不太旧（7天内），假设登录有效
      if (fileAge < 24 * 7) {
        ctx.logger.info(`访问检测失败，但storage文件存在（${fileAge.toFixed(1)}小时），假设登录有效`);
        return true;
      }
    }

    return false;
  }
}

/**
 * 保存当前浏览器的storage状态
 */
async function saveCurrentStorageState(ctx) {
  try {
    const context = await browserManager.getContext();
    const storageState = await context.storageState();

    // 确保目录存在
    const storageDir = path.dirname(ctx.storagePath);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    // 写入文件
    fs.writeFileSync(ctx.storagePath, JSON.stringify(storageState, null, 2));
    ctx.logger.success(`✅ 当前登录状态已保存到: ${ctx.storagePath}`);

  } catch (error) {
    ctx.logger.error(`保存storage状态失败: ${error.message}`);
  }
}

/**
 * 执行登录流程
 */
async function performLogin(ctx) {
  ctx.logger.info('\n=== 开始执行登录流程 ===');

  return new Promise((resolve, reject) => {
    const loginScript = path.resolve(process.cwd(), 'login.js');

    // 检查登录脚本是否存在
    if (!fs.existsSync(loginScript)) {
      reject(new Error('登录脚本不存在: login.js'));
      return;
    }

    ctx.logger.info('启动登录脚本...');
    ctx.logger.info('提示：请在打开的浏览器中完成登录');

    // 创建新的心跳定时器
    const loginHeartbeat = setInterval(() => {
      process.stdout.write('.');
    }, 5000);

    // 执行登录脚本
    const child = spawn('node', [loginScript], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    let resolved = false;

    child.on('close', (code) => {
      if (resolved) return;
      resolved = true;

      clearInterval(loginHeartbeat);

      // 解析退出码
      switch (code) {
        case 0:
          ctx.logger.success('\n✅ 登录成功！');
          break;
        case 10:
          ctx.logger.warn('\n⚠️ 用户中断登录');
          reject(new Error('用户取消登录'));
          return;
        case 11:
          ctx.logger.error('\n❌ 登录超时');
          reject(new Error('登录超时'));
          return;
        default:
          ctx.logger.error(`\n❌ 登录失败，退出码: ${code}`);
          reject(new Error(`登录失败，退出码: ${code}`));
          return;
      }

      // 登录成功，验证storage文件
      const storagePath = process.env.TAOBAO_STORAGE_STATE_PATH ||
        path.resolve(process.cwd(), 'storage', 'taobao-storage-state.json');

      if (fs.existsSync(storagePath)) {
        ctx.logger.success(`✅ 登录状态已保存: ${storagePath}`);

        // 更新缓存
        const taskCache = loadTaskCache(ctx.productId);
        taskCache.storagePath = storagePath;
        taskCache.storageValid = true;
        taskCache.loginTime = new Date().toISOString();
        saveTaskCache(ctx.productId, taskCache);

        resolve();
      } else {
        reject(new Error('登录成功但未找到storage文件'));
      }
    });

    child.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      clearInterval(loginHeartbeat);
      reject(error);
    });

    // 设置超时（5分钟）
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(loginHeartbeat);
        child.kill();
        reject(new Error('登录流程超时'));
      }
    }, 5 * 60 * 1000);
  });
}

module.exports = { step3 };
