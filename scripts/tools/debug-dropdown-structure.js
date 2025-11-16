const { chromium } = require('playwright');

async function debugDropdownStructure() {
  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔍';
    console.log(`${timestamp} DebugDropdown: ${prefix} ${message}`);
  };

  try {
    log('开始调试下拉菜单结构');

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

    log('✅ 已连接到素材库页面');

    // 清理现有弹窗
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
    });
    await page.waitForTimeout(1000);

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

    // 确认弹窗打开
    const dialogOpen = await page.locator('.next-dialog:has-text("新建文件夹")').isVisible();
    if (!dialogOpen) {
      log('❌ 弹窗未打开');
      return;
    }

    log('✅ 弹窗已打开');

    // 点击上级文件夹选择器
    log('点击上级文件夹选择器...');
    try {
      await page.locator('span.next-select-trigger:has-text("全部图片")').first().click();
      await page.waitForTimeout(2000);
      log('✅ 已点击上级文件夹选择器');
    } catch (error) {
      log(`❌ 无法点击上级文件夹选择器: ${error.message}`);
      return;
    }

    // 详细分析下拉菜单结构
    log('=== 详细分析下拉菜单结构 ===');

    const dropdownAnalysis = await page.evaluate(() => {
      console.log('开始分析下拉菜单...');

      const analysis = {
        dropdowns: [],
        allNodes: [],
        treeNodes: [],
        listItems: [],
        options: []
      };

      // 1. 分析所有下拉菜单
      const dropdowns = document.querySelectorAll('.next-select-menu, .next-overlay-wrapper, .next-select-dropdown');
      console.log(`找到${dropdowns.length}个下拉菜单元素`);

      for (let i = 0; i < dropdowns.length; i++) {
        const dropdown = dropdowns[i];
        const rect = dropdown.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        const className = dropdown.className || '';

        analysis.dropdowns.push({
          index: i,
          tagName: dropdown.tagName,
          className: className,
          visible: isVisible,
          width: rect.width,
          height: rect.height,
          innerHTML: isVisible ? dropdown.innerHTML.substring(0, 500) : '',
          textContent: isVisible ? dropdown.textContent : ''
        });
      }

      // 2. 分析所有可能的节点
      const nodeSelectors = [
        '.next-tree-node',
        'li.next-tree-node',
        '[role="treeitem"]',
        'li',
        '.next-select-menu-item',
        '[role="option"]',
        '.next-tree-node-title'
      ];

      for (const selector of nodeSelectors) {
        const nodes = document.querySelectorAll(selector);
        console.log(`选择器 "${selector}" 找到${nodes.length}个节点`);

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const text = node.textContent || '';
          const rect = node.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const className = node.className || '';

          const nodeInfo = {
            selector: selector,
            index: i,
            tagName: node.tagName,
            className: className,
            text: text.trim(),
            visible: isVisible,
            has2026: text.includes('2026'),
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          };

          analysis.allNodes.push(nodeInfo);

          if (selector.includes('tree-node')) {
            analysis.treeNodes.push(nodeInfo);
          }
          if (node.tagName.toLowerCase() === 'li') {
            analysis.listItems.push(nodeInfo);
          }
          if (className.includes('option') || node.getAttribute('role') === 'option') {
            analysis.options.push(nodeInfo);
          }
        }
      }

      return analysis;
    });

    // 输出分析结果
    log(`找到${dropdownAnalysis.dropdowns.length}个下拉菜单:`);
    dropdownAnalysis.dropdowns.forEach((dropdown, i) => {
      log(`  下拉菜单${i}: ${dropdown.tagName}.${dropdown.className} (可见:${dropdown.visible}, 尺寸:${dropdown.width}x${dropdown.height})`);
      if (dropdown.visible && dropdown.textContent) {
        log(`    文本内容: "${dropdown.textContent.substring(0, 100)}..."`);
      }
    });

    log('');
    log(`所有节点分析结果:`);

    // 重点分析包含2026的节点
    const nodes2026 = dropdownAnalysis.allNodes.filter(node => node.has2026 && node.visible);
    log(`找到${nodes2026.length}个包含"2026"的可见节点:`);

    nodes2026.forEach((node, i) => {
      log(`  节点${i + 1}: ${node.tagName}.${node.className}`);
      log(`    文本: "${node.text}"`);
      log(`    位置: (${Math.round(node.x)}, ${Math.round(node.y)}) 尺寸: ${Math.round(node.width)}x${Math.round(node.height)}`);
      log(`    选择器: ${node.selector}[${node.index}]`);
    });

    if (nodes2026.length === 0) {
      log('❌ 未找到任何包含"2026"的可见节点！');
      log('');
      log('所有可见节点的文本内容:');
      const visibleNodes = dropdownAnalysis.allNodes.filter(node => node.visible);
      visibleNodes.slice(0, 20).forEach((node, i) => {
        log(`  ${i + 1}. [${node.tagName}] "${node.text}"`);
      });

      if (visibleNodes.length > 20) {
        log(`  ... 还有${visibleNodes.length - 20}个节点`);
      }
    }

    // 保存调试截图
    try {
      await page.screenshot({
        path: `/Users/sanshui/Desktop/.claude/claude-code-chat-images/dropdown-debug-${Date.now()}.png`,
        fullPage: true
      });
      log('📸 调试截图已保存');
    } catch (screenshotError) {
      log(`截图失败: ${screenshotError.message}`);
    }

    // 如果找到2026节点，尝试点击
    if (nodes2026.length > 0) {
      log('');
      log('尝试点击第一个2026节点...');
      try {
        const targetNode = nodes2026[0];
        await page.mouse.click(targetNode.x + targetNode.width / 2, targetNode.y + targetNode.height / 2);
        await page.waitForTimeout(2000);
        log('✅ 已点击2026节点');

        // 验证上级文件夹设置
        const parentFolderSet = await page.locator('span.next-select-trigger:has-text("2026")').isVisible();
        if (parentFolderSet) {
          log('🎉 上级文件夹设置成功！现在显示2026');
        } else {
          log('❌ 点击后上级文件夹仍显示不正确');
        }
      } catch (clickError) {
        log(`❌ 点击2026节点失败: ${clickError.message}`);
      }
    }

    await browser.close();
    log('调试分析完成');

  } catch (error) {
    log(`调试失败: ${error.message}`, 'error');
  }
}

debugDropdownStructure();