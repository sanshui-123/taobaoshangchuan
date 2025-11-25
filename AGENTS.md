# Repository Guidelines

## 项目结构与模块组织
- `scripts/` 为核心目录，`scripts/publish.js` 负责调度，`scripts/steps/step0~step14` 覆盖取单、上传、裁剪、提交等全流程；`scripts/config/` 加载 `tb.env*` 配置；`scripts/feishu/` 处理飞书读写；`scripts/utils/` 与 `scripts/tools/` 提供缓存、日志、图片上传等通用能力。
- `assets/` 存放模板及示例资源；`storage/` 保存淘宝登录态（勿提交）；`screenshots/` 与 `logs/`、`reports/` 记录运行轨迹；`cache/`、`batch_*` 日志帮助排障。
- 环境文件：`tb.env`、`tb.env.test`、`tb.env.example`，通过 `NODE_ENV` 切换。

## 构建、测试与本地运行
- 安装依赖：`npm install`（Node 18+ 推荐）。
- 校验环境：`npm run check-env`；恢复备份：`npm run restore-env`。
- 登录/调试：`npm run login` 刷新 `storage/`；`npm run start-chrome` 打开 Playwright 调试浏览器。
- 发布示例：`npm run publish -- --product=C25215100`；批量：`npm run publish -- --batch=C25215100,C25215103`；分步/回放：`--from=5 --to=10` 或多次使用 `--step=3 --step=4`。
- 场景自测：可运行 `node test-step5-optimized.js`、`node test-safe-popup-closure.js`、`node test-feishu-update.js` 等针对性脚本；查看 `logs/`、`reports/` 与 `screenshots/` 验证结果。

## 编码风格与命名约定
- 以 Node.js/Playwright 脚本为主，CommonJS `require`，统一使用 2 空格缩进、单引号与分号；优先 `async/await`。
- 配置常量全大写（如 `FEISHU_CONFIG`），步骤文件命名 `stepN-*`，工具以动词前缀命名（如 `uploadImages`、`validateConfig`）；产品 ID 统一使用飞书/淘宝编码（如 `C25215100`）。
- TypeScript 代码遵循 `tsconfig.json`（ES2022，strict）；如需调试 TS，可用 `npx ts-node scripts/publish.ts`。

## 测试与质量检查
- 无集中化测试框架，提交前至少完成：1）`npm run check-env`；2）针对修改步骤运行对应 `test-*.js` 或 `--step` 精简链路；3）确认关键页面截图与日志无错误。
- 若调整选择器/流程，附带最小重现命令（含 `--product`、`--step` 参数）和相关截图/日志路径。

## 提交与 PR 指南
- 遵循 Conventional Commits，如 `feat(step5): 提升主图选择稳健性`、`fix(feishu): 处理空表格分页`；保持英文类型 + 可选作用域 + 简洁描述。
- PR 需包含：变更概述、影响范围（步骤/站点/环境）、已执行命令与结果、必要的截图或日志引用；关联对应任务/问题。
- 严禁提交敏感文件（`tb.env*`、`storage/`、浏览器缓存）；若新增配置项，请同步更新 `tb.env.example` 并在描述中说明。

## 浏览器实例约定（重启后如何开启、如何区分）
- 男店（端口 9222，缓存目录 profile-storeA）  
  启动：
  ```bash
  open -a "Google Chrome" --args \
    --remote-debugging-port=9222 \
    --user-data-dir="/Users/sanshui/Desktop/tbzhuaqu/storage/profile-storeA"
  ```
  连接（browser-manager）：`chromium.connectOverCDP('http://127.0.0.1:9222')`

- 女店（端口 9223，缓存目录 profile-storeB）  
  启动：
  ```bash
  open -a "Google Chrome" --args \
    --remote-debugging-port=9223 \
    --user-data-dir="/Users/sanshui/Desktop/tbzhuaqu/storage/profile-storeB"
  ```
  连接（browser-manager）：`chromium.connectOverCDP('http://127.0.0.1:9223')`

提示：两实例端口和用户数据目录必须独立，重启后先各自运行上述启动命令，再按店铺指定端口连接，缓存/登录互不影响。
