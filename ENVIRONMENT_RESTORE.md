# 系统重启后环境恢复指南

## 问题描述

系统重启后，之前一直保持的 Chrome 窗口会关闭，导致脚本无法通过 CDP (Chrome DevTools Protocol) 连接到浏览器。

## 解决方案

### 🎯 快速恢复（推荐）

**一键恢复环境：**
```bash
npm run restore-env
```

### 📋 分步恢复

**1. 检查环境状态：**
```bash
npm run check-env
```

**2. 启动 Chrome（如果需要）：**
```bash
npm run start-chrome
```

**3. 登录淘宝（如果需要）：**
```bash
npm run login
```

## 📦 新增工具

### 1. `start-chrome.js` - Chrome 启动器
```bash
# 启动带调试端口的 Chrome
node start-chrome.js start

# 检查 Chrome 状态
node start-chrome.js check

# 查看帮助
node start-chrome.js help
```

### 2. `restore-env.js` - 环境恢复器
```bash
# 检查环境状态
node restore-env.js check

# 一键恢复环境
node restore-env.js restore
```

## 🔧 环境变量配置

可以在 `.env` 文件中配置以下环境变量：

```env
# Chrome 调试配置
CHROME_REMOTE_PORT=9222
CHROME_REMOTE_HOST=127.0.0.1
CHROME_APP_NAME=Google Chrome
```

## 📝 最佳实践

### 日常使用节奏

1. **系统重启后**：
   ```bash
   npm run restore-env  # 一键恢复
   ```

2. **定期检查状态**：
   ```bash
   npm run check-env   # 检查环境
   ```

3. **手动启动 Chrome**（可选）：
   ```bash
   npm run start-chrome
   ```

### 自动化流程

可以在 CI/CD 脚本中添加环境检查：

```javascript
// 在执行流程前检查环境
const { restoreEnvironment } = require('./restore-env');

const envStatus = await restoreEnvironment();
if (!envStatus.ready) {
  throw new Error('环境不完整，请先运行 npm run restore-env');
}
```

## 🔍 故障排查

### Chrome 无法启动

1. **检查 Chrome 安装路径**：
   ```bash
   # 修改 .env 中的 CHROME_APP_NAME
   CHROME_APP_NAME="/Applications/Google Chrome.app"
   ```

2. **检查端口占用**：
   ```bash
   lsof -i :9222
   ```

3. **清理 Chrome 进程**：
   ```bash
   pkill -f "Google Chrome"
   ```

### 登录状态丢失

1. **检查登录文件**：
   ```bash
   ls -la storage/*storage*
   ```

2. **重新登录**：
   ```bash
   npm run login
   ```

## 📊 环境状态说明

- ✅ **Chrome 浏览器**: 运行中，监听调试端口 9222
- ✅ **登录状态文件**: storageState.json 存在且有效
- ✅ **图片资源**: assets 目录下有商品图片
- ✅ **任务缓存**: cache/tasks 目录下有任务缓存

当所有项目都为 ✅ 时，环境即可正常运行。

## 🚀 快速开始

系统重启后，只需要一个命令：

```bash
npm run restore-env
```

然后就可以正常运行发布流程了！