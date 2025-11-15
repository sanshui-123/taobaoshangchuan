const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  let page = null;
  for (const context of contexts) {
    const pages = context.pages();
    for (const p of pages) {
      if (p.url().includes('taobao.com') && p.url().includes('material-center')) {
        page = p;
        break;
      }
    }
    if (page) break;
  }

  if (page) {
    console.log('页面URL:', page.url());
    console.log('页面标题:', await page.title());
    const dialogs = await page.$$('.next-dialog');
    console.log('弹窗数量:', dialogs.length);
    for (let i = 0; i < dialogs.length; i++) {
      const text = await dialogs[i].textContent();
      console.log('弹窗' + (i+1) + '内容:', text.substring(0, 100));
    }
  }
})();