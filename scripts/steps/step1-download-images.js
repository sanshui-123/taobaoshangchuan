const { downloadAttachment } = require('../feishu/client');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

/**
 * 步骤1：下载图片
 * 从飞书下载商品图片到本地
 */
const step1 = async (ctx) => {
  ctx.logger.info('开始下载商品图片');

  // 创建心跳定时器，防止屏幕休眠
  const heartbeat = setInterval(() => {
    process.stdout.write('.');
  }, 5000);

  try {
    // 加载缓存
    const taskCache = loadTaskCache(ctx.productId);

    // 检查步骤状态
    if (taskCache.stepStatus && taskCache.stepStatus[1] === 'skipped') {
      ctx.logger.info('⚠️ 步骤1已被跳过，商品已存在于淘宝');
      updateStepStatus(ctx.productId, 1, 'skipped');
      return;
    }

    if (!taskCache.productData || !taskCache.productData.images) {
      throw new Error('缓存中没有图片信息，请先执行步骤0');
    }

    const { productData } = taskCache;
    const { images, productId, colors } = productData;

    ctx.logger.info(`商品ID: ${productId}`);
    ctx.logger.info(`找到 ${images.length} 张图片`);
    ctx.logger.info(`找到 ${colors.length} 个颜色`);

    // 创建assets目录结构（只在根目录）
    const baseDir = path.resolve(process.cwd(), 'assets', productId);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    // 新的图片分配策略：只有第1个颜色可以拿全部剩余图片，其余颜色最多各取6张
    const colorCount = colors.length;
    const imageCount = images.length;

    ctx.logger.info(`找到 ${imageCount} 张图片`);
    ctx.logger.info(`找到 ${colorCount} 个颜色: ${colors.join(', ')}`);

    // 计算每个颜色的图片分配
    let colorAllocation = [];
    if (colorCount <= 0) {
      // 如果没有颜色，全部命名为 color_1_xx
      colorAllocation = [imageCount];
      ctx.logger.info(`没有颜色信息，全部图片命名为 color_1_xx`);
    } else if (colorCount === 1) {
      // 只有1个颜色，全部图片归color_1
      colorAllocation = [imageCount];
      ctx.logger.info(`分配策略：color_1 分配全部 ${imageCount} 张图片`);
    } else {
      // 多个颜色的情况：color_1拿剩余，color_2及之后最多各6张
      const otherColorsTotal = 6 * (colorCount - 1);  // color_2及之后总共需要的图片数
      const color1Images = Math.max(0, imageCount - otherColorsTotal);  // color_1的图片数

      // 如果图片总数不足以给其他颜色分配6张，则color_1拿剩余的
      colorAllocation.push(color1Images);

      // color_2, color_3... 每个最多6张
      for (let i = 1; i < colorCount; i++) {
        colorAllocation.push(6);
      }

      ctx.logger.info(`分配策略：color_1 分配 ${color1Images} 张，color_2 及之后每个颜色最多6张`);
    }

    // 下载结果记录
    const downloadResults = {
      success: [],
      failed: [],
      total: images.length
    };

    // 记录下载开始时间
    const startTime = Date.now();

    // 遍历原始图片数组，按飞书顺序下载
    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      // 获取图片标识符（file_token或URL）- 在try外部声明
      // 如果image是字符串，直接使用；如果是对象，取file_token或url属性
      let imageIdentifier = typeof image === 'string' ? image : (image.file_token || image.url || image);

      // 处理 callawaygolf.jp 的 Next.js 图片优化URL
      if (imageIdentifier && imageIdentifier.includes('callawaygolf.jp/_next/image')) {
        const urlMatch = imageIdentifier.match(/url=([^&]+)/);
        if (urlMatch) {
          // 解码真实的图片URL
          imageIdentifier = decodeURIComponent(urlMatch[1]);
          ctx.logger.info(`  🔗 提取真实图片URL: ${imageIdentifier.substring(0, 50)}...`);
        }
      }

      // 根据新的分配策略计算颜色索引和图片序号
      let colorIndex = 1;
      let imageIndexInColor = 1;
      let accumulatedCount = 0;

      // 找到当前图片应该属于哪个颜色
      for (let c = 0; c < colorAllocation.length; c++) {
        const previousAccumulated = accumulatedCount;
        accumulatedCount += colorAllocation[c];

        if (i < accumulatedCount) {
          colorIndex = c + 1; // 颜色索引从1开始
          imageIndexInColor = i - previousAccumulated + 1; // 在该颜色下的序号从1开始
          break;
        }
      }

      try {
        // 构建文件名：color_1_01.jpg, color_1_02.jpg...
        const fileName = `color_${colorIndex}_${String(imageIndexInColor).padStart(2, '0')}.jpg`;
        const filePath = path.join(baseDir, fileName);

        // 检查文件是否已存在
        if (fs.existsSync(filePath)) {
          ctx.logger.info(`  图片已存在: ${fileName}`);
          const stats = fs.statSync(filePath);
          downloadResults.success.push({
            index: i + 1,
            fileName,
            path: filePath,
            skipped: true,
            size: stats.size
          });
          continue;
        }

        // 从飞书下载图片
        // 支持两种格式：file_token（飞书文件）或 URL（直接链接）
        ctx.logger.info(`  下载图片 ${i + 1}/${images.length}: ${imageIdentifier.substring(0, 50)}...`);

        let imageBuffer;

        if (imageIdentifier && imageIdentifier.startsWith('https://')) {
          // 如果是URL，使用axios直接下载
          ctx.logger.info(`    📥 使用URL下载图片`);
          const response = await axios.get(imageIdentifier, {
            responseType: 'arraybuffer',
            timeout: 45000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'image/jpeg,image/png,image/gif,image/*,*/*;q=0.8',  // 不接受 webp
              'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
              'Accept-Encoding': 'gzip, deflate, br',
              'Referer': 'https://www.callawaygolf.jp/',
              'Cache-Control': 'no-cache'
            }
          });
          imageBuffer = Buffer.from(response.data);

          // 检测并转换 webp 为 jpg
          const contentType = response.headers['content-type'] || '';
          if (contentType.includes('webp') || imageIdentifier.toLowerCase().endsWith('.webp')) {
            ctx.logger.info(`    🔄 检测到 webp 格式，转换为 jpg...`);
            imageBuffer = await sharp(imageBuffer).jpeg({ quality: 95 }).toBuffer();
          }
        } else {
          // 正式下载（使用file_token）
          imageBuffer = await downloadAttachment(imageIdentifier);

          // 检测 webp 格式（通过文件头魔数）
          // WebP 文件头: RIFF....WEBP
          if (imageBuffer.length > 12 &&
              imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49 &&
              imageBuffer[2] === 0x46 && imageBuffer[3] === 0x46 &&
              imageBuffer[8] === 0x57 && imageBuffer[9] === 0x45 &&
              imageBuffer[10] === 0x42 && imageBuffer[11] === 0x50) {
            ctx.logger.info(`    🔄 检测到 webp 格式（飞书附件），转换为 jpg...`);
            imageBuffer = await sharp(imageBuffer).jpeg({ quality: 95 }).toBuffer();
          }
        }

        // 保存图片
        fs.writeFileSync(filePath, imageBuffer);

        // 验证文件大小
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          throw new Error('图片文件为空');
        }

        downloadResults.success.push({
          index: i + 1,
          fileName,
          path: filePath,
          skipped: false,
          size: stats.size
        });

        ctx.logger.success(`    ✓ 保存成功: ${fileName} (${(stats.size / 1024).toFixed(2)}KB)`);

        // 避免请求过快
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        ctx.logger.error(`  ✗ 下载失败: ${error.message}`);
        const failedFileName = `color_${colorIndex}_${String(imageIndexInColor).padStart(2, '0')}.jpg`;
        downloadResults.failed.push({
          index: i + 1,
          fileName: failedFileName,
          error: error.message,
          fileToken: imageIdentifier
        });
      }
    }

    // 计算下载耗时
    const duration = (Date.now() - startTime) / 1000;

    // 更新缓存
    taskCache.images = downloadResults;
    taskCache.stepStatus[1] = 'done';
    saveTaskCache(ctx.productId, taskCache);

    // 写入专门的图片日志
    const imageLogPath = path.join(
      path.resolve(process.cwd(), 'logs', ctx.productId),
      'images.log'
    );
    const logContent = [
      `=== 图片下载日志 ===`,
      `时间: ${new Date().toISOString()}`,
      `商品ID: ${productId}`,
      `总图片数: ${downloadResults.total}`,
      `成功: ${downloadResults.success.length}`,
      `失败: ${downloadResults.failed.length}`,
      `耗时: ${duration.toFixed(2)}秒`,
      '',
      '=== 成功列表 ===',
      ...downloadResults.success.map(item =>
        `${item.fileName} - ${item.skipped ? '已存在' : (item.size ? `${(item.size/1024).toFixed(2)}KB` : '')}`
      ),
      '',
      '=== 失败列表 ===',
      ...downloadResults.failed.map(item =>
        `图片${item.index}(${item.fileName}): ${item.error}`
      )
    ].join('\n');

    fs.writeFileSync(imageLogPath, logContent, 'utf8');

    // 输出总结
    ctx.logger.success('\n=== 下载完成 ===');
    ctx.logger.info(`总计: ${downloadResults.total} 张`);
    ctx.logger.success(`成功: ${downloadResults.success.length} 张`);
    if (downloadResults.failed.length > 0) {
      ctx.logger.error(`失败: ${downloadResults.failed.length} 张`);
    }
    ctx.logger.info(`耗时: ${duration.toFixed(2)} 秒`);
    ctx.logger.info(`保存路径: ${baseDir}`);

    // 清理颜色子目录（只保留a1.jpg, a2.jpg等文件）
    ctx.logger.info('\n🧹 清理颜色子目录...');
    try {
      const items = fs.readdirSync(baseDir, { withFileTypes: true });
      let cleanedDirs = 0;

      for (const item of items) {
        if (item.isDirectory()) {
          const dirPath = path.join(baseDir, item.name);
          // 删除所有子目录（包括颜色目录）
          fs.rmSync(dirPath, { recursive: true, force: true });
          ctx.logger.info(`  已删除目录: ${item.name}/`);
          cleanedDirs++;
        }
      }

      if (cleanedDirs > 0) {
        ctx.logger.success(`  ✓ 清理完成，删除了 ${cleanedDirs} 个子目录`);
      } else {
        ctx.logger.info('  ✓ 没有需要清理的子目录');
      }
    } catch (error) {
      ctx.logger.warn(`  ⚠️ 清理目录时出错: ${error.message}`);
    }

    // 更新步骤状态
    updateStepStatus(ctx.productId, 1, 'done');

  } catch (error) {
    ctx.logger.error(`图片下载失败: ${error.message}`);
    updateStepStatus(ctx.productId, 1, 'failed');
    throw error;
  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');
  }
};

module.exports = { step1 };