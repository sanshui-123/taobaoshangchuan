const { chromium } = require('playwright');

async function debugTree() {
  try {
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

    if (!page) {
      console.log('未找到素材库页面');
      return;
    }

    console.log('=== 页面信息 ===');
    console.log('URL:', page.url());
    console.log('标题:', await page.title());

    console.log('\n=== 检查所有树节点 ===');
    const treeNodes = await page.$$('li.next-tree-node');
    console.log(`找到 ${treeNodes.length} 个树节点`);

    for (let i = 0; i < treeNodes.length; i++) {
      const node = treeNodes[i];
      try {
        const text = await node.textContent();
        if (text && text.trim()) {
          console.log(`节点 ${i}: ${text.trim()}`);
        }
      } catch (e) {
        console.log(`节点 ${i}: 读取失败`);
      }
    }

    console.log('\n=== 搜索包含C25291153的元素 ===');
    const elementsWithText = await page.evaluate(() => {
      const elements = [];
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.textContent && el.textContent.includes('C25291153')) {
          elements.push({
            tagName: el.tagName,
            className: el.className,
            text: el.textContent.trim().substring(0, 100)
          });
        }
      }
      return elements;
    });

    console.log(`找到 ${elementsWithText.length} 个包含C25291153的元素:`);
    elementsWithText.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tagName} class="${el.className}"> ${el.text}...`);
    });

    console.log('\n=== 检查2026节点的子节点 ===');
    const node2026 = await page.$('li.next-tree-node:has-text("2026")');
    if (node2026) {
      const childNodes = await node2026.$$('li.next-tree-node');
      console.log(`2026节点下有 ${childNodes.length} 个子节点`);

      for (let i = 0; i < childNodes.length; i++) {
        const child = childNodes[i];
        try {
          const text = await child.textContent();
          if (text && text.trim()) {
            console.log(`  子节点 ${i}: ${text.trim()}`);
          }
        } catch (e) {
          console.log(`  子节点 ${i}: 读取失败`);
        }
      }
    } else {
      console.log('未找到2026节点');
    }

    await browser.disconnect();
  } catch (error) {
    console.error('调试失败:', error.message);
  }
}

debugTree();