const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');

/**
 * 步骤3：登录并保存storage状态
 * 检查或执行登录流程
 */
const step3 = async (ctx) => {
  ctx.logger.info('检查登录状态');

  // 获取storage路径
  const storagePath = process.env.TAOBAO_STORAGE_STATE_PATH ||
    path.resolve(process.cwd(), 'storage', 'taobao-storage-state.json');

  ctx.storagePath = storagePath;

  // 创建心跳定时器
  const heartbeat = setInterval(() => {
    process.stdout.write('.');
  }, 5000);

  try {
    // 1. 检查storage文件是否存在
    if (!fs.existsSync(storagePath)) {
      ctx.logger.info('登录状态文件不存在，需要登录');
      await performLogin(ctx);
      return;
    }

    // 2. 检查storage文件是否过期（超过7天）
    const stats = fs.statSync(storagePath);
    const fileAge = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
    const maxAge = 7; // 7天有效期

    if (fileAge > maxAge) {
      ctx.logger.warn(`登录状态已过期（${fileAge.toFixed(1)}天），需要重新登录`);
      await performLogin(ctx);
      return;
    }

    // 3. 验证storage文件内容
    try {
      const storageContent = fs.readFileSync(storagePath, 'utf8');
      const storageState = JSON.parse(storageContent);

      // 检查是否有cookies
      if (!storageState.cookies || storageState.cookies.length === 0) {
        ctx.logger.warn('登录状态文件无效（无cookies），需要重新登录');
        await performLogin(ctx);
        return;
      }

      // 检查淘宝相关cookie是否存在
      const taobaoCookies = storageState.cookies.filter(cookie =>
        cookie.domain.includes('taobao.com') || cookie.domain.includes('tmall.com')
      );

      if (taobaoCookies.length === 0) {
        ctx.logger.warn('登录状态文件无效（无淘宝cookie），需要重新登录');
        await performLogin(ctx);
        return;
      }

      ctx.logger.success('✅ 登录状态有效');
      ctx.logger.info(`Storage路径: ${storagePath}`);
      ctx.logger.info(`Cookie数量: ${storageState.cookies.length}`);
      ctx.logger.info(`文件年龄: ${fileAge.toFixed(1)}天`);

      // 更新缓存
      const taskCache = loadTaskCache(ctx.productId);
      taskCache.storagePath = storagePath;
      taskCache.storageValid = true;
      taskCache.loginTime = new Date().toISOString();
      saveTaskCache(ctx.productId, taskCache);

    } catch (parseError) {
      ctx.logger.error(`登录状态文件格式错误: ${parseError.message}`);
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

    // 执行登录脚本
    const child = spawn('node', [loginScript], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    let resolved = false;

    child.on('close', (code) => {
      if (resolved) return;
      resolved = true;

      clearInterval(heartbeat);

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
      clearInterval(heartbeat);
      reject(error);
    });

    // 设置超时（5分钟）
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(heartbeat);
        child.kill();
        reject(new Error('登录流程超时'));
      }
    }, 5 * 60 * 1000);
  });
}

module.exports = { step3 };