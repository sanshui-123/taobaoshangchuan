# 上传框选择器调试指南

## 问题描述
如果 Step5 的日志中没有显示 "✅ 已点击第一个上传位"，说明所有选择器都没有命中目标元素。

## 验证方法

### 方法1：浏览器控制台验证（推荐）

1. **打开淘宝商品发布页面**
   - 确保页面已经加载完成
   - 1:1主图区域可见

2. **打开浏览器开发者工具**
   - 按 `F12` 或右键 -> 检查

3. **在 Console 中粘贴测试代码**
   ```javascript
   // 复制 test-upload-selector.js 的内容并执行
   ```

4. **查看结果**
   - 找到显示 "✅" 的选择器
   - 记录成功的选择器

### 方法2：使用 Inspector 手动检查

1. **点击 Elements/元素 标签页**

2. **点击左上角的选择器图标**（或按 Ctrl+Shift+C）

3. **在页面上点击第一个"上传图片"框**

4. **在 DevTools 中查看该元素的：**
   - class 名称
   - id
   - data-* 属性
   - 父容器结构

5. **常见的可能结构：**
   ```html
   <!-- 示例1 -->
   <div class="sell-component-info-wrapper-component-child">
     <div class="placeholder">
       上传图片
     </div>
   </div>

   <!-- 示例2 -->
   <div class="upload-pic-box">
     <div class="placeholder">
       <i class="upload-icon"></i>
       <span>上传图片</span>
     </div>
   </div>

   <!-- 示例3 -->
   <div id="struct-mainImagesGroup">
     <div class="upload-item">
       上传图片
     </div>
   </div>
   ```

### 方法3：运行测试观察日志

```bash
cd /Users/sanshui/Desktop/tbzhuaqu
node run-step5-test.js
```

查看日志中的：
```
[步骤3] 点击第一个白底图上传位
✅ 已点击第一个上传位（选择器名称）  # 这里会显示成功的选择器
```

## 已更新的选择器列表

当前 Step5 会按以下顺序尝试：

1. `.sell-component-info-wrapper-component-child div.placeholder`
2. `div.placeholder`
3. `[data-testid="upload-placeholder"]`
4. `.upload-pic-box.placeholder`
5. `.sell-field-mainImagesGroup .upload-pic-box:first-child`
6. `.upload-pic-box:first-child`
7. `[class*="mainImages"] .upload-item:first-child`
8. `[class*="mainImagesGroup"] div:first-child`
9. `div:has-text("上传图片")`
10. `button:has-text("上传图片")`
11. （以及其他备选项）

## 如果所有选择器都失败

1. **手动获取准确的选择器**
   - 使用 Inspector 检查元素
   - 复制元素的 CSS Selector
   - 在 Chrome DevTools 中右键元素 -> Copy -> Copy selector

2. **更新 Step5 代码**
   - 打开 `scripts/steps/step5-upload-images.js`
   - 在 `uploadBoxSelectors` 数组的**最前面**添加您找到的选择器
   - 保存文件

3. **重新测试**
   ```bash
   node run-step5-test.js
   ```

## 常见问题

### Q: 为什么需要这么多选择器？
A: 淘宝的发布页面结构可能因版本、A/B测试等原因而变化，使用多个选择器可以提高兼容性。

### Q: 选择器优先级如何确定？
A: 越具体的选择器优先级越高。例如 `div.placeholder` 比 `div:has-text("上传图片")` 更精确。

### Q: 如何确认选择器真的能点击？
A: 在浏览器控制台中执行：
```javascript
document.querySelector('你的选择器').click();
```
如果素材库弹窗出现，说明选择器正确。
