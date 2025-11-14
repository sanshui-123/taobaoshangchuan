/**
 * Chrome 启动脚本
 * 用于系统重启后重新启动带调试端口的 Chrome
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

/**
 * 启动带调试端口的 Chrome
 */
async function startChrome() {
  console.log('🚀 启动带调试端口的 Chrome...');

  const profileDir = path.resolve(process.cwd(), 'storage', 'browser-profile');
  const remotePort = parseInt(process.env.CHROME_REMOTE_PORT || '9222', 10);
  const chromeHost = process.env.CHROME_REMOTE_HOST || '127.0.0.1';
  const chromeAppName = process.env.CHROME_APP_NAME || 'Google Chrome';

  // 检查端口是否已被监听
  if (await isPortListening(remotePort, chromeHost)) {
    console.log(`✅ Chrome 已在端口 ${remotePort} 运行`);
    return true;
  }

  console.log(`📍 Chrome 配置信息:`);
  console.log(`   - 调试端口: ${remotePort}`);
  console.log(`   - 用户数据目录: ${profileDir}`);
  console.log(`   - Chrome 应用: ${chromeAppName}`);

  // 启动 Chrome
  const args = [
    '-n',
    '-a',
    chromeAppName,
    '--args',
    `--remote-debugging-port=${remotePort}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
    '--disable-blink-features=AutomationControlled'
  ];

  console.log('🌐 正在启动 Chrome...');

  try {
    const chromeProcess = spawn('open', args, {
      detached: true,
      stdio: 'ignore'
    });

    chromeProcess.unref();

    // 等待 Chrome 启动并监听端口
    console.log('⏳ 等待 Chrome 启动...');
    await waitForPort(remotePort, chromeHost, 30000);

    console.log(`✅ Chrome 已成功启动，监听端口 ${remotePort}`);
    return true;

  } catch (error) {
    console.error('❌ 启动 Chrome 失败:', error.message);
    return false;
  }
}

/**
 * 检查端口是否已被监听
 */
function isPortListening(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection(
      { port, host },
      () => {
        socket.destroy();
        resolve(true);
      }
    );

    socket.setTimeout(1000);
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * 等待端口就绪
 */
async function waitForPort(port, host, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isPortListening(port, host)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Chrome 远程调试端口 ${port} 未在预期时间内就绪`);
}

/**
 * 检查 Chrome 状态
 */
async function checkChromeStatus() {
  const remotePort = parseInt(process.env.CHROME_REMOTE_PORT || '9222', 10);
  const chromeHost = process.env.CHROME_REMOTE_HOST || '127.0.0.1';

  console.log(`🔍 检查 Chrome 状态 (端口 ${remotePort})...`);

  if (await isPortListening(remotePort, chromeHost)) {
    console.log('✅ Chrome 正在运行，可以正常连接');
    return true;
  } else {
    console.log('❌ Chrome 未运行，需要先启动');
    return false;
  }
}

// 命令行处理
async function main() {
  const command = process.argv[2] || 'start';

  switch (command) {
    case 'start':
      await startChrome();
      break;
    case 'check':
      await checkChromeStatus();
      break;
    case 'help':
      console.log(`
使用方法:
  node start-chrome.js [命令]

命令:
  start  - 启动带调试端口的 Chrome (默认)
  check  - 检查 Chrome 是否正在运行
  help   - 显示帮助信息

示例:
  node start-chrome.js          # 启动 Chrome
  node start-chrome.js start    # 启动 Chrome
  node start-chrome.js check    # 检查状态

环境变量:
  CHROME_REMOTE_PORT    - Chrome 调试端口 (默认: 9222)
  CHROME_REMOTE_HOST    - Chrome 主机 (默认: 127.0.0.1)
  CHROME_APP_NAME       - Chrome 应用名称 (默认: Google Chrome)
      `);
      break;
    default:
      console.log(`❌ 未知命令: ${command}`);
      console.log('使用 "node start-chrome.js help" 查看帮助');
      process.exit(1);
  }
}

// 处理 Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Chrome 启动脚本已退出');
  process.exit(0);
});

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error.message);
    process.exit(1);
  });
}

module.exports = { startChrome, checkChromeStatus };