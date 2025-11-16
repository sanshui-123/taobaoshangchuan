const { chromium } = require('playwright');
const { closeMaterialCenterPopups } = require('../utils/advert-handler');

async function analyzeDropdownAfterCleanup() {
  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔍';
    console.log(`${timestamp} AnalyzeDropdown: ${prefix} ${message}`);
  };

  try {
    log('开始分析清理后的下拉菜单结构');

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
      log('未找到素材库页面');
      return;
    }

    log('已连接到素材库页面');

    // 移除搜索面板
    log('移除搜索面板...');
    await closeMaterialCenterPopups(page, {
      forceRemoveSearchPanel: true,
      keepSearchPanelAlive: true
    });

    await page.waitForTimeout(2000);

    // 打开新建文件夹弹窗
    log('打开新建文件夹弹窗...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const button of buttons) {
        const text = button.textContent || '';
        if (text.includes('新建文件夹')) {
          button.click();
          break;
        }
      }
    });

    await page.waitForTimeout(3000);

    // 点击上级文件夹选择器
    log('点击上级文件夹选择器...');
    const dialog = page.locator('.next-dialog:has-text("新建文件夹")');
    await dialog.locator('span.next-select-trigger:has-text("全部图片")').first().click();
    await page.waitForTimeout(3000);

    // 详细分析下拉菜单结构
    log('=== 详细分析下拉菜单结构 ===');

    const dropdownAnalysis = await page.evaluate(() => {
      console.log('开始详细分析...');

      const analysis = {
        dropdowns: [],
        trees: [],
        lists: [],
        nodes: [],
        allVisibleElements: []
      };

      // 1. 分析所有可能的下拉菜单容器
      const dropdownSelectors = [
        '.next-select-menu',
        '.next-overlay-wrapper',
        '.next-select-dropdown',
        '.next-tree-select-dropdown',
        '[role="listbox"]',
        '[role="tree"]',
        '[role="dialog"]'
      ];

      dropdownSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        console.log(`选择器 "${selector}" 找到${elements.length}个元素`);

        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];
          const rect = element.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const className = element.className || '';

          analysis.dropdowns.push({
            selector: selector,
            index: i,
            tagName: element.tagName,
            className: className,
            visible: isVisible,
            width: rect.width,
            height: rect.height,
            innerHTML: isVisible ? element.innerHTML.substring(0, 300) : '',
            textContent: isVisible ? element.textContent : ''
          });
        }
      });

      // 2. 分析所有树结构
      const treeSelectors = [
        '.next-tree',
        '.next-tree-node',
        '[role="tree"]',
        '[role="treeitem"]',
        '.tree',
        '.node'
      ];

      treeSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        console.log(`树选择器 "${selector}" 找到${elements.length}个元素`);

        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];
          const text = element.textContent || '';
          const rect = element.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const className = element.className || '';

          analysis.trees.push({
            selector: selector,
            index: i,
            tagName: element.tagName,
            className: className,
            text: text.trim(),
            visible: isVisible,
            has2026: text.includes('2026'),
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          });
        }
      });

      // 3. 分析所有列表项
      const listSelectors = [
        'li',
        '.next-select-menu-item',
        '[role="option"]',
        '[role="listitem"]',
        '.option',
        '.item'
      ];

      listSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        console.log(`列表选择器 "${selector}" 找到${elements.length}个元素`);

        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];
          const text = element.textContent || '';
          const rect = element.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const className = element.className || '';

          if (isVisible) {
            analysis.lists.push({
              selector: selector,
              index: i,
              tagName: element.tagName,
              className: className,
              text: text.trim(),
              has2026: text.includes('2026'),
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            });
          }
        }
      });

      // 4. 查找所有包含"2026"的元素
      const allElements = document.querySelectorAll('*');
      for (let i = 0; i < allElements.length; i++) {
        const element = allElements[i];
        const text = element.textContent || '';
        const rect = element.getBoundingClientRect();

        if (text.includes('2026') && rect.width > 0 && rect.height > 0) {
          analysis.nodes.push({
            index: i,
            tagName: element.tagName,
            className: element.className || '',
            text: text.trim(),
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            id: element.id || '',
            role: element.getAttribute('role') || ''
          });
        }
      }

      // 5. 记录弹窗附近的所有可见元素
      const dialog = document.querySelector('.next-dialog:has-text("新建文件夹")');
      if (dialog) {
        const rect = dialog.getBoundingClientRect();
        const nearbyElements = [];

        // 在弹窗下方和右侧查找元素（下拉列表通常在这里）
        for (let y = rect.bottom; y < Math.min(rect.bottom + 300, window.innerHeight); y += 50) {
          for (let x = rect.left; x < Math.min(rect.right + 200, window.innerWidth); x += 50) {
            const element = document.elementFromPoint(x, y);
            if (element && element.offsetWidth > 0 && element.offsetHeight > 0) {
              const text = element.textContent || '';
              const className = element.className || '';

              if (text.includes('2026') || className.includes('tree') || className.includes('select') || className.includes('dropdown')) {
                nearbyElements.push({
                  x: x,
                  y: y,
                  tagName: element.tagName,
                  className: className,
                  text: text.trim(),
                  has2026: text.includes('2026')
                });
              }
            }
          }
        }

        analysis.allVisibleElements = nearbyElements;
      }

      return analysis;
    });

    // 输出分析结果
    log(`找到${dropdownAnalysis.dropdowns.length}个下拉菜单容器:`);
    dropdownAnalysis.dropdowns.forEach((dropdown, i) => {
      if (dropdown.visible) {
        log(`  容器${i}: ${dropdown.tagName}.${dropdown.className} (尺寸:${dropdown.width}x${dropdown.height})`);
        if (dropdown.textContent) {
          log(`    文本: "${dropdown.textContent.substring(0, 100)}..."`);
        }
      }
    });

    log('');
    log(`找到${dropdownAnalysis.trees.length}个树结构元素:`);
    dropdownAnalysis.trees.forEach((tree, i) => {
      if (tree.visible && tree.has2026) {
        log(`  树${i}: ${tree.tagName}.${tree.className} 包含2026`);
        log(`    位置: (${Math.round(tree.x)}, ${Math.round(tree.y)}) 文本: "${tree.text}"`);
      }
    });

    log('');
    log(`找到${dropdownAnalysis.lists.length}个列表项，其中包含2026的:`);
    const lists2026 = dropdownAnalysis.lists.filter(item => item.has2026);
    lists2026.forEach((item, i) => {
      log(`  列表项${i}: ${item.tagName}.${item.className}`);
      log(`    位置: (${Math.round(item.x)}, ${Math.round(item.y)}) 文本: "${item.text}"`);
    });

    log('');
    log(`找到${dropdownAnalysis.nodes.length}个包含2026的元素:`);
    dropdownAnalysis.nodes.forEach((node, i) => {
      log(`  节点${i}: ${node.tagName}.${node.className} id="${node.id}" role="${node.role}"`);
      log(`    位置: (${Math.round(node.x)}, ${Math.round(node.y)}) 文本: "${node.text}"`);
    });

    log('');
    log(`弹窗附近的相关元素:`);
    dropdownAnalysis.allVisibleElements.forEach((element, i) => {
      const marker = element.has2026 ? '👉' : '  ';
      log(`${marker} 元素${i}: ${element.tagName}.${element.className} 位置(${element.x},${element.y})`);
      if (element.has2026) {
        log(`    文本: "${element.text}"`);
      }
    });

    // 保存调试截图
    await page.screenshot({
      path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/dropdown-analysis-${Date.now()}.png`,
      fullPage: true
    });

    log('分析完成，截图已保存');

    await browser.close();

  } catch (error) {
    log(`分析失败: ${error.message}`, 'error');
  }
}

analyzeDropdownAfterCleanup();