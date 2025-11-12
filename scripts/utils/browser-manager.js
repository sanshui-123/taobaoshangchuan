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
    this.initPromise = null; // 初始化Promise，避免重复初始化
    this.profileDir = path.resolve(process.cwd(), 'storage', 'browser-profile');
    this.pages = []; // 跟踪所有创建的页面，但不关闭它们

    // 不在构造函数中初始化，改为按需懒加载
  }

  /**
   * 初始化浏览器（懒加载）
   */
  async _init() {
    // 如果已经有context，直接返回
    if (this.context) {
      console.log('✅ 复用已有浏览器上下文');
      return this.context;
    }

    // 如果正在初始化，返回同一个Promise
    if (this.initPromise) {
      console.log('⏳ 等待浏览器初始化完成...');
      return this.initPromise;
    }

    // 开始初始化
    console.log('🌐 初始化持久化浏览器...');
    this.initPromise = this._doInit();

    try {
      const context = await this.initPromise;
      this.context = context;
      return context;
    } catch (error) {
      this.initPromise = null; // 失败后重置，允许重试
      throw error;
    }
  }

  /**
   * 实际的初始化逻辑
   */
  async _doInit() {
    try {
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

      console.log('✅ 持久化浏览器初始化成功');
      console.log(`📁 用户数据目录: ${this.profileDir}`);

      return this.browser;
    } catch (error) {
      console.error('❌ 浏览器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 获取浏览器上下文
   */
  async getContext() {
    return await this._init();
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