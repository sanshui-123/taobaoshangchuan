# 淘宝商品发布自动化管线

自动化淘宝商品发布的完整解决方案，支持从飞书多维表格获取商品信息并自动发布到淘宝平台。

## 功能特性

- ✅ 14个完整的发布步骤
- ✅ 支持多商品批量处理
- ✅ 断点续传和错误恢复
- ✅ 飞书数据双向同步
- ✅ 图片自动下载和裁剪
- ✅ 多语言翻译（中文→日文）
- ✅ 智能错误处理和重试

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制配置文件模板：
```bash
cp tb.env.example tb.env
```

编辑 `tb.env` 文件，填写你的配置：

```env
# 飞书配置
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
FEISHU_APP_TOKEN=your_app_token
FEISHU_TABLE_ID=your_table_id

# 字段映射（根据飞书表格调整）
FEISHU_IMAGE_FIELD=图片
FEISHU_TITLE_FIELD=商品标题
# ... 其他字段映射
```

### 3. 运行发布

```bash
# 发布单个商品（完整流程）
npm run publish -- --product=PRODUCT_ID

# 执行特定步骤
npm run publish -- --product=PRODUCT_ID --step=8

# 执行步骤范围
npm run publish -- --product=PRODUCT_ID --from=8 --to=14
```

## 环境配置

项目支持多环境配置：

- `tb.env` - 默认环境配置
- `tb.env.test` - 测试环境配置
- `tb.env.production` - 生产环境配置

通过 `NODE_ENV` 环境变量指定使用哪个配置文件。

## 项目结构

```
tbzhuaqu/
├── scripts/
│   ├── config/index.js      # 配置加载
│   ├── steps/              # 发布步骤
│   │   ├── step0-task-init.js
│   │   ├── step1-download-images.js
│   │   ├── ...
│   │   └── step14-log-and-notify.js
│   ├── utils/              # 工具函数
│   └── feishu/              # 飞书API
├── tb.env.example          # 配置模板
├── storage/                 # 登录状态
├── assets/                  # 资源文件
├── screenshots/             # 截图
└── logs/                    # 日志文件
```

## 步骤说明

1. **任务初始化** - 从飞书获取待发布商品
2. **下载图片** - 批量下载商品图片
3. **翻译内容** - 中文翻译为日文
4. **登录验证** - 自动登录淘宝
5. **打开发布页** - 打开商品发布页面
6. **上传主图** - 上传商品主图
7. **选择品牌** - 选择商品品牌
8. **填写颜色** - 填写商品颜色
9. **填写尺码** - 配置尺码（含LL→XL映射）
10. **填写价格库存** - 设置价格和库存
11. **裁剪图片** - 裁剪3:4比例图片
12. **填写详情** - 填写商品详情
13. **提交商品** - 提交发布
14. **日志通知** - 记录日志并发送通知

## 注意事项

- 确保 `tb.env` 文件不被提交到版本控制
- 登录状态会保存在 `storage/` 目录
- 所有截图保存在 `screenshots/` 目录
- 支持断点续传，中断后可从失败步骤继续

## 故障排除

1. **配置错误**：检查 `tb.env` 中的飞书配置是否正确
2. **登录失败**：删除 `storage/` 目录重新登录
3. **步骤失败**：查看日志文件获取详细错误信息

## 许可证

MIT License