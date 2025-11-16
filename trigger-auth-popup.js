/**
 * 尝试触发权限失效弹窗的脚本
 * 通过模拟各种可能触发权限检查的操作
 */

const { chromium } = require('playwright');

async function triggerAuthPopup() {
  console.log('🎯 尝试触发权限失效弹窗...');

  let browser;
  let page;

  try {
    // 启动浏览器
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const pages = browser.contexts()[0].pages();
    page = pages.find(p => p.url().includes('taobao.com')) || pages[0];

    if (!page) {
      throw new Error('未找到可用的淘宝页面');
    }

    console.log('✅ 已连接到淘宝页面');
    console.log('📄 当前页面URL:', page.url());

    // 尝试各种可能触发权限失效弹窗的操作

    // 1. 尝试点击新建文件夹按钮（可能触发权限检查）
    console.log('\n🔍 尝试1: 点击新建文件夹按钮...');
    try {
      const createFolderBtn = await page.$('button:has-text("新建文件夹")');
      if (createFolderBtn) {
        await createFolderBtn.click();
        await page.waitForTimeout(2000);

        // 检查是否有权限弹窗
        const authDialog = await page.$('div:has-text("权限已失效"), div:has-text("您的权限已失效")');
        if (authDialog) {
          console.log('🎉 成功触发权限失效弹窗！');

          // 立即处理弹窗
          const closeButton = await authDialog.$('.next-icon-close, [class*="close"]');
          if (closeButton) {
            await closeButton.click();
            console.log('✅ 已关闭权限失效弹窗');
          }
          return;
        } else {
          console.log('❌ 未触发权限弹窗');
        }
      } else {
        console.log('❌ 未找到新建文件夹按钮');
      }
    } catch (error) {
      console.log('❌ 点击新建文件夹按钮失败:', error.message);
    }

    // 2. 尝试关闭可能的弹窗并重试
    console.log('\n🔍 尝试2: 先关闭现有弹窗，再点击新建文件夹...');
    try {
      // 关闭任何可见的弹窗
      const visibleDialogs = await page.$$('.next-dialog:visible');
      for (const dialog of visibleDialogs) {
        const closeBtn = await dialog.$('.next-icon-close');
        if (closeBtn) {
          await closeBtn.click();
          console.log('✅ 关闭了一个弹窗');
        }
      }
      await page.waitForTimeout(1000);

      // 再次尝试点击新建文件夹
      const createFolderBtn = await page.$('button:has-text("新建文件夹")');
      if (createFolderBtn) {
        await createFolderBtn.click();
        await page.waitForTimeout(3000);

        // 检查权限弹窗
        const authDialog = await page.$('div:has-text("权限已失效"), div:has-text("您的权限已失效"), div:has-text("登录失效")');
        if (authDialog) {
          console.log('🎉 成功触发权限失效弹窗！');
          return;
        } else {
          console.log('❌ 仍然未触发权限弹窗');
        }
      }
    } catch (error) {
      console.log('❌ 尝试2失败:', error.message);
    }

    // 3. 尝试点击上传文件按钮
    console.log('\n🔍 尝试3: 点击上传文件按钮...');
    try {
      const uploadBtn = await page.$('button:has-text("上传文件")');
      if (uploadBtn) {
        await uploadBtn.click();
        await page.waitForTimeout(3000);

        // 检查权限弹窗
        const authDialog = await page.$('div:has-text("权限已失效"), div:has-text("您的权限已失效"), div:has-text("登录失效")');
        if (authDialog) {
          console.log('🎉 上传操作触发权限失效弹窗！');
          return;
        } else {
          console.log('❌ 上传操作未触发权限弹窗');
        }
      }
    } catch (error) {
      console.log('❌ 点击上传按钮失败:', error.message);
    }

    // 4. 尝试刷新页面
    console.log('\n🔍 尝试4: 刷新页面...');
    try {
      await page.reload();
      await page.waitForTimeout(5000);

      // 检查权限弹窗
      const authDialog = await page.$('div:has-text("权限已失效"), div:has-text("您的权限已失效")');
      if (authDialog) {
        console.log('🎉 页面刷新后触发权限失效弹窗！');
        return;
      } else {
        console.log('❌ 页面刷新后未触发权限弹窗');
      }
    } catch (error) {
      console.log('❌ 页面刷新失败:', error.message);
    }

    // 5. 尝试访问其他需要权限的页面
    console.log('\n🔍 尝试5: 访问需要权限的页面...');
    try {
      await page.goto('https://myseller.taobao.com/seller/admin.htm', { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      // 检查权限弹窗
      const authDialog = await page.$('div:has-text("权限已失效"), div:has-text("您的权限已失效")');
      if (authDialog) {
        console.log('🎉 访问管理页面触发权限失效弹窗！');
        return;
      } else {
        console.log('❌ 访问管理页面未触发权限弹窗');
      }
    } catch (error) {
      console.log('❌ 访问管理页面失败:', error.message);
    }

    console.log('\n📊 尝试结果总结:');
    console.log('❌ 所有尝试都未能触发权限失效弹窗');
    console.log('💡 可能原因:');
    console.log('   1. 权限有效，不会出现弹窗');
    console.log('   2. 弹窗已经被之前的操作关闭了');
    console.log('   3. 需要特定的触发条件');
    console.log('   4. 弹窗在其他时间点出现');

    // 回到素材库页面
    try {
      await page.goto('https://myseller.taobao.com/home.htm/material-center/mine-material/sucai-tu', { waitUntil: 'networkidle' });
      console.log('✅ 已回到素材库页面');
    } catch (error) {
      console.log('⚠️ 回到素材库页面失败:', error.message);
    }

  } catch (error) {
    console.error('❌ 触发过程失败:', error.message);
  } finally {
    console.log('\n📝 尝试触发权限失效弹窗完成');
  }
}

// 运行触发脚本
triggerAuthPopup();