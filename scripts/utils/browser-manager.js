const { chromium } = require('playwright');
const path = require('path');

/**
 * 全局浏览器管理器 - 使用持久化上下文
 * 单例模式 - 确保全局只有一个浏览器实例，且永不关闭
 */
class BrowserManager {
  constructor() {
    // 单例模式
    if (BrowserManager.instance) {
      return BrowserManager.instance;
    }
    BrowserManager.instance = this;

    this.browser = null;
    this.context = null;
    this.mainPage = null; // 保存主页面引用
    this.isInitialized = false;
    this.isInitializing = false; // 防止并发初始化
    this.profileDir = path.resolve(process.cwd(), 'storage', 'browser-profile');
    this.pages = []; // 跟踪所有创建的页面，但不关闭它们

    // 模块加载时自动初始化
    this._autoInit();
  }

  /**
   * 自动初始化（异步，但不阻塞）
   */
  async _autoInit() {
    if (this.isInitialized || this.isInitializing) {
      return;
    }
    this.isInitializing = true;

    try {
      await this.initialize();
    } catch (error) {
      console.error('❌ 自动初始化失败:', error);
      this.isInitializing = false;
    }
  }

  /**
   * 初始化浏览器（如果还没初始化）
   */
  async initialize() {
    if (this.isInitialized && this.context) {
      console.log('✅ 复用已有浏览器上下文');
      return this.context;
    }

    if (this.isInitializing) {
      // 等待初始化完成
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return this.context;
    }

    this.isInitializing = true;

    try {
      console.log('🌐 初始化持久化浏览器...');

      // 使用持久化上下文
      this.browser = await chromium.launchPersistentContext(this.profileDir, {
        headless: false, // 必须有头模式
        args: [
          '--start-maximized',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-setuid-sandbox',
          '--no-sandbox',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
        viewport: null,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      this.context = this.browser;
      this.isInitialized = true;
      this.isInitializing = false;

      console.log('✅ 持久化浏览器初始化成功');
      console.log(`📁 用户数据目录: ${this.profileDir}`);

      return this.context;
    } catch (error) {
      console.error('❌ 浏览器初始化失败:', error);
      this.isInitializing = false;
      throw error;
    }
  }

  /**
   * 获取浏览器上下文
   */
  async getContext() {
    return await this.initialize();
  }

  /**
   * 获取当前页面
   */
  getCurrentPages() {
    return this.context ? this.context.pages() : [];
  }

  /**
   * 获取主页面（如果不存在则创建）
   */
  async getMainPage() {
    // 确保浏览器已初始化
    await this.getContext();

    if (!this.mainPage || this.mainPage.isClosed()) {
      console.log('📄 创建主页面...');
      this.mainPage = await this.context.newPage();
      this.pages.push(this.mainPage);

      // 禁止关闭主页面
      this.mainPage.on('close', () => {
        console.log('⚠️ 主页面被关闭，但浏览器保持打开状态');
        this.mainPage = null;
      });
    } else {
      console.log('📄 复用已有主页面');
    }

    return this.mainPage;
  }

  /**
   * 创建新页面
   */
  async newPage() {
    const context = await this.getContext();
    const page = await context.newPage();

    // 跟踪页面但不关闭
    this.pages.push(page);

    // 禁止关闭页面
    page.on('close', () => {
      console.log('📄 页面已关闭，但浏览器保持打开状态');
    });

    return page;
  }

  /**
   * 获取页面（返回主页面或新页面）
   */
  async getPage() {
    return await this.getMainPage();
  }

  /**
   * 关闭浏览器（禁用 - 永不关闭浏览器）
   * 为了保持浏览器持续打开，这个方法被禁用
   */
  async close() {
    console.log('⚠️ 浏览器保持打开状态，不会被关闭');
    // 不执行实际的关闭操作
    return Promise.resolve();
  }

  /**
   * 强制关闭（仅在完全关闭程序时使用）
   */
  async forceClose() {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.browser = null;
      this.isInitialized = false;
      console.log('✅ 浏览器已强制关闭');
    }
  }

  /**
   * 检查浏览器是否正在运行
   */
  isConnected() {
    return this.isInitialized && this.context && this.context.browser().isConnected();
  }
}

// 创建单例实例
const browserManager = new BrowserManager();

// 导出实例和方法
module.exports = browserManager;