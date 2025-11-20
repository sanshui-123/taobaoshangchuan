#!/bin/bash
# 自动监控脚本：等当前商品完成，下一个商品开始时重启批处理

cd /Users/sanshui/Desktop/tbzhuaqu

echo "🔍 开始监控批处理进度..."
echo "⏳ 等待当前商品完成，下一个商品开始时将自动重启..."

# 获取当前处理的商品数量
CURRENT_COUNT=$(grep -c "开始处理第" loop_hoodie.log)
echo "📊 当前已启动处理: $CURRENT_COUNT 个商品"

# 循环检查，每5秒检查一次
while true; do
  sleep 5

  # 获取最新的处理商品数量
  NEW_COUNT=$(grep -c "开始处理第" loop_hoodie.log)

  # 如果数量增加了，说明开始处理下一个商品
  if [ $NEW_COUNT -gt $CURRENT_COUNT ]; then
    echo ""
    echo "🎯 检测到新商品开始处理（第 $NEW_COUNT 个）"
    echo "🛑 停止当前批处理..."

    # 停止批处理进程
    pkill -f "loop_publish_hoodie.sh"
    pkill -f "node scripts/publish.js.*卫衣"

    sleep 2

    echo "🔄 重启批处理（应用优化后的代码）..."

    # 重启批处理
    nohup ./loop_publish_hoodie.sh > loop_hoodie_optimized.log 2>&1 &

    echo "✅ 批处理已重启！"
    echo "📝 新日志文件: loop_hoodie_optimized.log"
    echo ""
    echo "监控命令:"
    echo "  tail -f loop_hoodie_optimized.log"

    break
  fi

  # 显示心跳
  echo -n "."
done

echo ""
echo "🎉 监控完成！批处理已使用优化代码重启。"
