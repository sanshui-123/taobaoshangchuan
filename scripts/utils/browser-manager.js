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
    this.isInitialized = false;
    this.profileDir = path.resolve(process.cwd(), 'storage', 'browser-profile');
    this.pages = []; // 跟踪所有创建的页面，但不关闭它们
  }

  /**
   * 初始化浏览器（如果还没初始化）
   */
  async initialize() {
    if (this.isInitialized && this.context) {
      return this.context;
    }

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
          '--no-default-browser-check'
        ],
        viewport: null,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      this.context = this.browser;
      this.isInitialized = true;

      console.log('✅ 持久化浏览器初始化成功');
      console.log(`📁 用户数据目录: ${this.profileDir}`);

      return this.context;
    } catch (error) {
      console.error('❌ 浏览器初始化失败:', error);
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
   * 创建新页面
   */
  async newPage() {
    const context = await this.getContext();
    const page = await context.newPage();

    // 跟踪页面但不关闭
    this.pages.push(page);

    // 移除页面关闭监听器，防止自动关闭
    page.on('close', () => {
      console.log('📄 页面已关闭，但浏览器保持打开状态');
    });

    return page;
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

// 导出单例
module.exports = browserManager;