#!/usr/bin/env node
/**
 * Step5: 素材库上传工具 - 修复版
 * 修复了文件夹已存在时的处理逻辑
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

// 复制原脚本的必要函数
const { closeMaterialCenterPopups } = require('./lib/material-ads');

// 核心修复：检查文件夹是否已存在
async function checkAndEnterFolder(page, productId) {
  console.log(`📋 检查文件夹 ${productId} 是否已存在...`);

  // 等待页面稳定
  await page.waitForTimeout(2000);

  // 查找文件夹的多种选择器
  const folderSelectors = [
    `text=${productId}`,
    `[title="${productId}"]`,
    `.next-tree-node:has-text("${productId}")`,
    `.material-folder-item:has-text("${productId}")`
  ];

  for (const selector of folderSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        console.log(`✅ 找到已存在的文件夹 ${productId}`);

        // 双击进入文件夹
        await element.dblclick();
        await page.waitForTimeout(2000);

        // 验证是否成功进入（检查面包屑）
        const breadcrumb = await page.$eval('.breadcrumb, .path-bar', el => el.textContent).catch(() => '');
        if (breadcrumb.includes(productId)) {
          console.log(`✅ 成功进入文件夹 ${productId}`);
          return true;
        }
      }
    } catch (e) {
      // 继续尝试下一个选择器
    }
  }

  console.log(`📋 文件夹 ${productId} 不存在，需要创建`);
  return false;
}

// 创建新文件夹函数（从原脚本提取）
async function createNewFolder(page, productId) {
  console.log(`📋 创建新文件夹 ${productId}...`);

  // 清理弹窗
  await closeMaterialCenterPopups(page);

  // 查找并点击新建文件夹按钮
  const createButton = await page.$('button:has-text("新建文件夹")');
  if (!createButton) {
    throw new Error('未找到新建文件夹按钮');
  }

  await createButton.click({ force: true });
  console.log('✅ 点击了新建文件夹按钮');

  // 等待弹窗出现
  await page.waitForSelector('.next-dialog:has-text("新建文件夹")', { timeout: 5000 });

  // 在弹窗内操作
  const dialog = page.locator('.next-dialog:has-text("新建文件夹")');

  // 输入文件夹名称
  const folderInput = dialog.locator('input[maxlength="20"], input:not([role="combobox"])');
  await folderInput.click({ force: true });
  await folderInput.fill(productId);
  console.log(`✅ 输入文件夹名称: ${productId}`);

  // 点击确定
  const confirmButton = dialog.locator('button:has-text("确定")');
  await confirmButton.click();
  console.log('✅ 点击了确定按钮');

  // 等待弹窗消失
  await page.waitForTimeout(3000);

  // 验证文件夹创建成功
  const folderExists = await checkAndEnterFolder(page, productId);
  if (!folderExists) {
    throw new Error(`文件夹 ${productId} 创建失败`);
  }

  return true;
}

// 上传文件函数
async function uploadFiles(page, productId, localPath) {
  console.log(`📋 开始上传文件到 ${productId}...`);

  // 查找上传按钮
  const uploadButton = await page.$('button:has-text("上传文件")');
  if (!uploadButton) {
    throw new Error('未找到上传文件按钮');
  }

  // 获取文件输入元素
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    throw new Error('未找到文件输入元素');
  }

  // 获取所有要上传的文件
  const files = fs.readdirSync(localPath)
    .filter(f => f.startsWith('color_') && f.endsWith('.jpg'))
    .map(f => path.join(localPath, f));

  console.log(`📋 准备上传 ${files.length} 个文件`);

  // 设置文件
  await fileInput.uploadFile(...files);

  // 触发上传
  await uploadButton.click();
  console.log('✅ 开始上传文件...');

  // 等待上传完成（可能需要较长时间）
  await page.waitForTimeout(10000);

  console.log(`✅ 文件上传完成`);
  return true;
}

// 主函数
async function main() {
  const productId = process.argv[2] || 'C25291153';
  const localPath = path.join(__dirname, '..', '..', 'assets', productId);

  console.log('🚀 Step5: 素材库上传 - 修复版');
  console.log(`📦 商品ID: ${productId}`);
  console.log(`📁 本地路径: ${localPath}`);

  // 验证本地文件
  if (!fs.existsSync(localPath)) {
    throw new Error(`本地文件夹不存在: ${localPath}`);
  }

  // 连接到已打开的Chrome
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
    defaultViewport: null
  });

  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('material-center')) || pages[0];

  try {
    // 导航到素材库页面
    if (!page.url().includes('material-center')) {
      await page.goto('https://myseller.taobao.com/home.htm/material-center/mine-material/sucai-tu');
      await page.waitForTimeout(5000);
    }

    // 清理广告弹窗
    await closeMaterialCenterPopups(page);

    // 点击2026文件夹
    console.log('📋 进入2026文件夹...');
    await page.click('li.next-tree-node:has-text("2026")');
    await page.waitForTimeout(2000);

    // 核心修复：先检查文件夹是否存在
    const folderExists = await checkAndEnterFolder(page, productId);

    if (!folderExists) {
      // 文件夹不存在，创建新文件夹
      await createNewFolder(page, productId);
    }

    // 验证当前在正确的文件夹中
    const breadcrumb = await page.$eval('.breadcrumb, [class*="breadcrumb"], .path-bar', el => el.textContent).catch(() => '');
    console.log(`📋 当前路径: ${breadcrumb}`);

    if (!breadcrumb.includes(productId)) {
      throw new Error(`未能进入文件夹 ${productId}`);
    }

    // 上传文件
    await uploadFiles(page, productId, localPath);

    // 刷新页面验证
    console.log('📋 刷新页面验证上传结果...');
    await page.reload();
    await page.waitForTimeout(3000);

    // 截图保存结果
    await page.screenshot({
      path: `step5-upload-success-${productId}.png`,
      fullPage: false
    });

    console.log('✅ Step5: 素材库上传完成！');

  } catch (error) {
    console.error('❌ Step5执行失败:', error.message);

    // 保存错误截图
    await page.screenshot({
      path: `step5-upload-error-${productId}.png`,
      fullPage: false
    });

    throw error;
  } finally {
    // 保持浏览器打开
    console.log('📋 保持Chrome实例运行');
  }
}

// 执行主函数
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { checkAndEnterFolder, createNewFolder, uploadFiles };