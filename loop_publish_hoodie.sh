#!/bin/bash
# 批量处理 Callaway/卡拉威 卫衣/连帽衫

cd /Users/sanshui/Desktop/tbzhuaqu

# 设置必要的环境变量
export FEISHU_BRAND_FIELD="品牌名"
export FEISHU_CATEGORY_FIELD="衣服分类"
export FEISHU_TARGET_STATUS="待检测,待上传"

COUNT=0
MAX_COUNT=50

while [ $COUNT -lt $MAX_COUNT ]; do
  COUNT=$((COUNT + 1))

  echo ""
  echo "=========================================="
  echo "开始处理第 $COUNT 个商品"
  echo "=========================================="

  NODE_ENV=production node scripts/publish.js \
    --from 0 \
    --to 13 \
    --brand "Callaway/卡拉威" \
    --category "卫衣/连帽衫" \
    --verbose 2>&1 | tee /tmp/publish_current.log

  # 检查是否还有待处理的商品
  if grep -q "剩余 0 条记录" /tmp/publish_current.log; then
    echo "✅ 没有更多符合条件的商品，处理完成！"
    break
  fi

  # 等待5秒后处理下一个
  sleep 5
done

echo ""
echo "=========================================="
echo "批处理完成！共处理 $COUNT 个商品"
echo "=========================================="
