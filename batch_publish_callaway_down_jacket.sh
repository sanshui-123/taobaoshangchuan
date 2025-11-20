#!/bin/bash

###############################################################################
# 批量发布脚本 - Callaway/卡拉威 羽绒服/棉服
# 功能：连续处理所有符合条件的商品，直到全部处理完
###############################################################################

cd /Users/sanshui/Desktop/tbzhuaqu

# 设置环境变量
export FEISHU_BRAND_FIELD="品牌名"
export FEISHU_CATEGORY_FIELD="衣服分类"  # 或者 "品类"，根据飞书表格实际字段名
export FEISHU_TARGET_STATUS="待上传"

# 配置参数
BRAND="Callaway/卡拉威"
CATEGORY="羽绒服/棉服"
FROM_STEP=0
TO_STEP=13

# 计数器
SUCCESS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0

echo "============================================================"
echo "🚀 开始批量发布 - Callaway/卡拉威 羽绒服/棉服"
echo "============================================================"
echo "品牌: $BRAND"
echo "分类: $CATEGORY"
echo "状态: 待上传"
echo "步骤范围: Step $FROM_STEP 到 Step $TO_STEP"
echo "============================================================"
echo ""

# 循环处理商品
while true; do
  TOTAL_COUNT=$((TOTAL_COUNT + 1))

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📦 正在处理第 $TOTAL_COUNT 个商品..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 执行发布命令
  NODE_ENV=production node scripts/publish.js \
    --from $FROM_STEP \
    --to $TO_STEP \
    --brand "$BRAND" \
    --category "$CATEGORY" \
    --verbose \
    --screenshot 2>&1 | tee -a batch_publish_$(date +%Y%m%d).log

  EXIT_CODE=$?

  # 检查日志中是否有"剩余 0 条记录"
  if tail -100 batch_publish_$(date +%Y%m%d).log | grep -q "剩余 0 条记录"; then
    echo ""
    echo "✅ 所有符合条件的商品已处理完成！"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    break
  fi

  # 检查是否发布成功
  if tail -100 batch_publish_$(date +%Y%m%d).log | grep -q "商品发布成功"; then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    echo "✅ 第 $TOTAL_COUNT 个商品发布成功"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "❌ 第 $TOTAL_COUNT 个商品发布失败"

    # 失败后是否继续？（可选配置）
    read -p "是否继续处理下一个商品？(y/n) " -t 10 CONTINUE || CONTINUE="y"
    if [ "$CONTINUE" != "y" ]; then
      echo "用户选择退出批量处理"
      break
    fi
  fi

  # 等待间隔（避免频繁操作）
  echo "⏳ 等待 5 秒后处理下一个商品..."
  sleep 5
done

# 统计结果
echo ""
echo "============================================================"
echo "📊 批量处理完成统计"
echo "============================================================"
echo "总处理数: $TOTAL_COUNT 个商品"
echo "成功: $SUCCESS_COUNT 个"
echo "失败: $FAIL_COUNT 个"
echo "成功率: $(awk "BEGIN {printf \"%.1f%%\", ($SUCCESS_COUNT/$TOTAL_COUNT)*100}")"
echo "日志文件: batch_publish_$(date +%Y%m%d).log"
echo "============================================================"
