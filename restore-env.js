/**
 * 环境恢复脚本
 * 系统重启后快速恢复运行环境
 */

const { checkChromeStatus } = require('./start-chrome');
const fs = require('fs');
const path = require('path');

/**
 * 检查并恢复完整运行环境
 */
async function restoreEnvironment() {
  console.log('🔄 开始检查运行环境...\n');

  let chromeOk = false;
  let loginOk = false;
  let storageOk = false;

  // 1. 检查 Chrome
  console.log('📋 [1/4] 检查 Chrome 浏览器状态...');
  chromeOk = await checkChromeStatus();

  // 2. 检查 storageState
  console.log('\n📋 [2/4] 检查登录状态文件...');
  storageOk = checkStorageState();

  // 3. 检查图片资源
  console.log('\n📋 [3/4] 检查图片资源...');
  const assetsCount = checkAssets();

  // 4. 检查缓存
  console.log('\n📋 [4/4] 检查任务缓存...');
  const cacheCount = checkTaskCache();

  // 5. 输出恢复建议
  console.log('\n' + '='.repeat(50));
  console.log('📊 环境检查结果:');
  console.log(`   Chrome 浏览器: ${chromeOk ? '✅ 运行中' : '❌ 未运行'}`);
  console.log(`   登录状态文件: ${storageOk ? '✅ 存在' : '❌ 缺失'}`);
  console.log(`   图片资源: ${assetsCount > 0 ? `✅ ${assetsCount} 个商品` : '❌ 无资源'}`);
  console.log(`   任务缓存: ${cacheCount > 0 ? `✅ ${cacheCount} 个任务` : '❌ 无缓存'}`);
  console.log('='.repeat(50));

  // 6. 提供恢复建议
  console.log('\n🎯 恢复建议:');

  if (!chromeOk) {
    console.log('   🚀 需要先启动 Chrome:');
    console.log('      node start-chrome.js start');
    console.log('   或者手动启动带调试端口的 Chrome');
  }

  if (!storageOk) {
    console.log('   🔐 需要重新登录:');
    console.log('      npm run login');
  }

  if (chromeOk && storageOk && assetsCount > 0) {
    console.log('   ✅ 环境完整，可以正常运行流程!');
    console.log('   📝 建议运行命令:');
    console.log('      npm run publish -- --product=YOUR_PRODUCT_ID --from=0 --to=5');
  }

  if (!chromeOk || !storageOk) {
    console.log('\n🔄 一键恢复流程:');
    if (!chromeOk && !storageOk) {
      console.log('      1. node start-chrome.js start  # 启动 Chrome');
      console.log('      2. npm run login               # 登录淘宝');
    } else if (!chromeOk) {
      console.log('      1. node start-chrome.js start  # 启动 Chrome');
    } else {
      console.log('      1. npm run login               # 登录淘宝');
    }
  }

  return {
    chrome: chromeOk,
    storage: storageOk,
    assets: assetsCount,
    cache: cacheCount,
    ready: chromeOk && storageOk && assetsCount > 0
  };
}

/**
 * 检查 storageState 文件
 */
function checkStorageState() {
  const storagePaths = [
    path.resolve(process.cwd(), 'storage', 'storageState.json'),
    path.resolve(process.cwd(), 'storage', 'taobao-storage-state.json'),
    path.resolve(process.cwd(), 'storage', 'storageStateSimple.json')
  ];

  for (const storagePath of storagePaths) {
    if (fs.existsSync(storagePath)) {
      const stats = fs.statSync(storagePath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`   ✓ 找到登录状态: ${path.basename(storagePath)} (${sizeKB}KB)`);
      return true;
    }
  }

  console.log('   ✗ 未找到登录状态文件');
  return false;
}

/**
 * 检查图片资源
 */
function checkAssets() {
  const assetsPath = path.resolve(process.cwd(), 'assets');

  if (!fs.existsSync(assetsPath)) {
    console.log('   ✗ assets 目录不存在');
    return 0;
  }

  const items = fs.readdirSync(assetsPath);
  const productDirs = items.filter(item => {
    const itemPath = path.join(assetsPath, item);
    return fs.statSync(itemPath).isDirectory();
  });

  let totalImages = 0;
  productDirs.forEach(product => {
    const productPath = path.join(assetsPath, product);
    const images = fs.readdirSync(productPath).filter(file => file.endsWith('.jpg'));
    totalImages += images.length;
  });

  console.log(`   ✓ 找到 ${productDirs.length} 个商品目录，${totalImages} 张图片`);
  return productDirs.length;
}

/**
 * 检查任务缓存
 */
function checkTaskCache() {
  const cachePath = path.resolve(process.cwd(), 'cache', 'tasks');

  if (!fs.existsSync(cachePath)) {
    console.log('   ✗ 任务缓存目录不存在');
    return 0;
  }

  const cacheFiles = fs.readdirSync(cachePath).filter(file => file.endsWith('.json'));
  console.log(`   ✓ 找到 ${cacheFiles.length} 个任务缓存文件`);
  return cacheFiles.length;
}

/**
 * 一键恢复环境
 */
async function quickRestore() {
  console.log('🚀 执行一键恢复...');

  const { startChrome } = require('./start-chrome');

  // 1. 启动 Chrome
  console.log('\n🌐 [步骤1] 启动 Chrome...');
  const chromeStarted = await startChrome();

  if (!chromeStarted) {
    console.log('❌ Chrome 启动失败，请手动启动');
    return false;
  }

  // 2. 检查登录状态
  console.log('\n🔐 [步骤2] 检查登录状态...');
  const storageOk = checkStorageState();

  if (!storageOk) {
    console.log('⚠️ 需要手动登录淘宝');
    console.log('   请在新打开的 Chrome 中登录淘宝: https://myseller.taobao.com');
    console.log('   登录完成后运行: npm run login');
    return false;
  }

  console.log('\n✅ 环境恢复完成！');
  console.log('🎉 现在可以正常运行发布流程了');
  return true;
}

// 命令行处理
async function main() {
  const command = process.argv[2] || 'check';

  switch (command) {
    case 'check':
      await restoreEnvironment();
      break;
    case 'restore':
      await quickRestore();
      break;
    case 'help':
      console.log(`
使用方法:
  node restore-env.js [命令]

命令:
  check   - 检查环境状态 (默认)
  restore - 一键恢复环境
  help    - 显示帮助信息

示例:
  node restore-env.js           # 检查环境状态
  node restore-env.js check     # 检查环境状态
  node restore-env.js restore   # 一键恢复

建议的恢复流程:
  1. 系统重启后先运行: node restore-env.js
  2. 根据提示执行相应操作
  3. 或者直接运行: node restore-env.js restore
      `);
      break;
    default:
      console.log(`❌ 未知命令: ${command}`);
      console.log('使用 "node restore-env.js help" 查看帮助');
      process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 环境恢复失败:', error.message);
    process.exit(1);
  });
}

module.exports = { restoreEnvironment, quickRestore };