const { chromium } = require('playwright');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

/**
 * 浏览器管理器
 * - 使用系统级 Chrome（remote debugging）保持窗口常驻
 * - Node 进程退出后浏览器依旧保持
 */
class BrowserManager {
  constructor() {
    if (BrowserManager.instance) {
      return BrowserManager.instance;
    }

    this.browser = null;
    this.context = null;
    this.mainPage = null;
    this.initPromise = null;

    this.profileDir = path.resolve(process.cwd(), 'storage', 'browser-profile');
    this.chromeAppName = process.env.CHROME_APP_NAME || 'Google Chrome';
    this.chromeHost = process.env.CHROME_REMOTE_HOST || '127.0.0.1';
    this.remoteEndpoint = this._resolveEndpoint();

    BrowserManager.instance = this;
  }

  /**
   * 检查端口是否已被监听
   */
  _isPortListening() {
    return new Promise((resolve) => {
      const socket = net.createConnection(
        { port: this.remotePort, host: this.chromeHost },
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
  async _waitForPort(timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this._isPortListening()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Chrome 远程调试端口 ${this.remotePort} 未在预期时间内就绪`);
  }

  /**
   * 启动独立 Chrome（detach），确保 Node 退出后窗口依旧存在
   */
  async _ensureChromeLaunched() {
    if (await this._isPortListening()) {
      return;
    }

    console.log('🚀 启动独立 Chrome（detach）...');
    const args = [
      '-n',
      '-a',
      this.chromeAppName,
      '--args',
      `--remote-debugging-port=${this.remotePort}`,
      `--user-data-dir=${this.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check'
    ];

    spawn('open', args, {
      detached: true,
      stdio: 'ignore'
    }).unref();

    await this._waitForPort();
  }

  /**
   * 连接至已有 Chrome
   */
  async _connectToChrome() {
    await this._ensureChromeLaunched();
    console.log(`🔗 连接 Chrome 调试端口: ${this.remoteEndpoint}`);
    return await chromium.connectOverCDP(this.remoteEndpoint);
  }

  /**
   * 根据环境变量解析 CDP 端点
   * 优先级：BROWSER_CDP_ENDPOINT > BROWSER_CDP_PORT > TAOBAO_STORE 映射 > CHROME_REMOTE_PORT 默认
   */
  _resolveEndpoint() {
    const defaultHost = process.env.CHROME_REMOTE_HOST || '127.0.0.1';
    const defaultPort = parseInt(process.env.CHROME_REMOTE_PORT || '9222', 10);
    const store = (process.env.TAOBAO_STORE || '').toLowerCase();
    const storePort = store === 'female' ? 9223 : store === 'male' ? 9222 : null;

    // 1) 完整端点
    const endpointEnv = process.env.BROWSER_CDP_ENDPOINT;
    if (endpointEnv) {
      try {
        const url = new URL(endpointEnv);
        this.remoteHost = url.hostname || defaultHost;
        this.remotePort = parseInt(url.port || defaultPort, 10);
        this.chromeHost = this.remoteHost;
        return endpointEnv;
      } catch (e) {
        console.warn(`⚠️ BROWSER_CDP_ENDPOINT 无效，回退使用端口: ${e.message}`);
      }
    }

    // 2) 指定端口
    const portEnv = process.env.BROWSER_CDP_PORT;
    if (portEnv) {
      this.remotePort = parseInt(portEnv, 10) || defaultPort;
      this.remoteHost = defaultHost;
      this.chromeHost = this.remoteHost;
      return `http://${this.remoteHost}:${this.remotePort}`;
    }

    // 3) 店铺映射
    if (storePort) {
      this.remotePort = storePort;
      this.remoteHost = defaultHost;
      this.chromeHost = this.remoteHost;
      return `http://${this.remoteHost}:${this.remotePort}`;
    }

    // 4) 默认
    this.remotePort = defaultPort;
    this.remoteHost = defaultHost;
    this.chromeHost = this.remoteHost;
    return `http://${this.remoteHost}:${this.remotePort}`;
  }

  /**
   * 初始化/获取 context（懒加载）
   */
  async _init() {
    if (this.context) {
      return this.context;
    }

    if (!this.initPromise) {
      this.initPromise = (async () => {
        const browser = await this._connectToChrome();
        this.browser = browser;
        const contexts = browser.contexts();
        this.context = contexts.length > 0 ? contexts[0] : await browser.newContext();
        return this.context;
      })();
    }

    try {
      await this.initPromise;
      return this.context;
    } finally {
      this.initPromise = null;
    }
  }

  async getContext() {
    return await this._init();
  }

  async getMainPage() {
    const context = await this.getContext();
    const existing = context.pages().find((p) => !p.isClosed());

    if (existing) {
      this.mainPage = existing;
      return existing;
    }

    console.log('📄 创建主页面...');
    this.mainPage = await context.newPage();
    return this.mainPage;
  }

  async newPage() {
    const context = await this.getContext();
    return await context.newPage();
  }

  async getPage() {
    return await this.getMainPage();
  }

  async close() {
    console.log('⚠️ 浏览器由系统托管，不执行关闭操作');
    return Promise.resolve();
  }

  async forceClose() {
    console.log('⚠️ 浏览器需手动关闭（或结束 Chrome 进程），此处仅清理引用');
    this.context = null;
    this.browser = null;
  }
}

module.exports = new BrowserManager();
