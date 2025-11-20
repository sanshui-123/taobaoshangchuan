#!/bin/bash
# 批量处理 Le Coq公鸡乐卡克 衬衫

cd /Users/sanshui/Desktop/tbzhuaqu

# 设置必要的环境变量
export FEISHU_BRAND_FIELD="品牌名"
export FEISHU_CATEGORY_FIELD="衣服分类"
export FEISHU_TARGET_STATUS="待检测,待上传"

COUNT=0
MAX_COUNT=1  # 最多处理10次，防止无限循环

echo "============================================================"
echo "🚀 开始循环处理 Le Coq公鸡乐卡克 衬衫"
echo "============================================================"
echo "品牌: Le Coq公鸡乐卡克"
echo "分类: 衬衫"
echo "状态: 待检测,待上传"
echo "最大处理数: $MAX_COUNT"
echo "============================================================"

while [ $COUNT -lt $MAX_COUNT ]; do
  COUNT=$((COUNT + 1))

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📦 正在处理第 $COUNT 个商品..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 保存输出到临时文件以便分析
  NODE_ENV=production node scripts/publish.js \
    --from 0 \
    --to 13 \
    --brand "Le Coq公鸡乐卡克" \
    --category "衬衫" \
    --verbose 2>&1 | tee /tmp/publish_current.log

  EXIT_CODE=$?

  # 检查是否没有更多商品了
  if grep -q "剩余 0 条记录" /tmp/publish_current.log; then
    echo ""
    echo "✅ 没有更多符合条件的商品，处理完成！"
    break
  fi

  # 显示当前商品的处理结果
  if grep -q "已存在于淘宝" /tmp/publish_current.log; then
    echo "⏭️  第 $COUNT 个商品已存在，已跳过"
  elif grep -q "商品发布成功" /tmp/publish_current.log; then
    echo "✅ 第 $COUNT 个商品发布成功"
  elif [ $EXIT_CODE -ne 0 ]; then
    echo "⚠️  第 $COUNT 个商品处理遇到错误"
    # 不退出，继续处理下一个
  fi

  echo "⏳ 等待5秒后处理下一个商品..."
  sleep 5
done

echo ""
echo "============================================================"
echo "📊 处理完成"
echo "============================================================"
echo "总共尝试处理: $COUNT 个商品"
echo "============================================================"
