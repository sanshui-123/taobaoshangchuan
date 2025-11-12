const { chromium } = require('playwright');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤11：裁剪3:4比例图片
 * 将已上传的1:1主图裁剪为3:4比例，用于详情页展示
 */
const step11 = async (ctx) => {
  ctx.logger.info('开始裁剪3:4比例图片');

  // 创建心跳定时器
  const heartbeat = setInterval(() => {
    process.stdout.write('.');
  }, 5000);

  try {
    // 检查是否有页面引用
    if (!ctx.page1) {
      throw new Error('未找到发布页面，请先执行步骤4');
    }

    const page = ctx.page1;
    const productId = ctx.productId;

    // 加载缓存获取商品信息
    const taskCache = loadTaskCache(productId);
    if (!taskCache.productData || !taskCache.productData.colors) {
      throw new Error('缓存中没有商品颜色信息');
    }

    const colors = taskCache.productData.colors;
    const assetsDir = path.resolve(process.cwd(), 'assets', productId);
    const croppedDir = path.join(assetsDir, 'cropped_3to4');

    // 创建裁剪图片目录
    if (!fs.existsSync(croppedDir)) {
      fs.mkdirSync(croppedDir, { recursive: true });
    }

    ctx.logger.info(`商品颜色数量: ${colors.length}`);
    ctx.logger.info(`原始图片目录: ${assetsDir}`);
    ctx.logger.info(`裁剪输出目录: ${croppedDir}`);

    // 步骤1：获取已上传的图片列表
    ctx.logger.info('\n[步骤1] 分析已上传图片');

    const uploadedImages = await page.$$('.material-image-item img');
    ctx.logger.info(`已上传图片数量: ${uploadedImages.length}`);

    if (uploadedImages.length === 0) {
      throw new Error('未找到已上传的图片，请先执行步骤5');
    }

    // 步骤2：获取每个图片的URL并下载
    ctx.logger.info('\n[步骤2] 下载已上传图片');

    const downloadedImages = [];
    for (let i = 0; i < uploadedImages.length; i++) {
      const img = uploadedImages[i];
      const src = await img.getAttribute('src');

      if (src) {
        // 构建完整URL
        const fullUrl = src.startsWith('http') ? src : `https:${src}`;

        try {
          // 使用页面上下文下载图片
          const buffer = await page.evaluate(async (url) => {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return Array.from(new Uint8Array(arrayBuffer));
          }, fullUrl);

          // 保存原始图片
          const originalPath = path.join(croppedDir, `original_${i + 1}.jpg`);
          fs.writeFileSync(originalPath, Buffer.from(buffer));

          downloadedImages.push({
            index: i,
            url: fullUrl,
            path: originalPath,
            size: Buffer.from(buffer).length
          });

          ctx.logger.info(`  ✓ 下载图片 ${i + 1}/${uploadedImages.length}: ${originalPath}`);
        } catch (error) {
          ctx.logger.warn(`  ⚠️ 下载图片失败: ${error.message}`);
        }
      }
    }

    // 步骤3：裁剪图片为3:4比例
    ctx.logger.info('\n[步骤3] 裁剪图片为3:4比例');

    const cropResults = [];
    const targetRatio = 3 / 4; // 3:4比例

    for (let i = 0; i < downloadedImages.length; i++) {
      const image = downloadedImages[i];
      const outputPath = path.join(croppedDir, `cropped_${i + 1}.jpg`);

      ctx.logger.info(`  处理图片 ${i + 1}/${downloadedImages.length}`);

      try {
        // 使用sharp获取图片信息
        const metadata = await sharp(image.path).metadata();
        const { width, height } = metadata;

        ctx.logger.info(`    原始尺寸: ${width}x${height}`);

        // 计算裁剪参数
        let cropWidth, cropHeight, cropX, cropY;

        const originalRatio = width / height;

        if (originalRatio > targetRatio) {
          // 原图比目标宽，裁剪宽度
          cropHeight = height;
          cropWidth = Math.round(height * targetRatio);
          cropX = Math.round((width - cropWidth) / 2);
          cropY = 0;
        } else {
          // 原图比目标高，裁剪高度
          cropWidth = width;
          cropHeight = Math.round(width / targetRatio);
          cropX = 0;
          cropY = Math.round((height - cropHeight) / 2);
        }

        // 执行裁剪
        await sharp(image.path)
          .extract({
            left: cropX,
            top: cropY,
            width: cropWidth,
            height: cropHeight
          })
          .jpeg({
            quality: 85,
            progressive: true
          })
          .toFile(outputPath);

        // 获取裁剪后信息
        const croppedMetadata = await sharp(outputPath).metadata();

        cropResults.push({
          index: i,
          original: {
            width: width,
            height: height,
            path: image.path
          },
          cropped: {
            width: croppedMetadata.width,
            height: croppedMetadata.height,
            path: outputPath,
            size: fs.statSync(outputPath).size
          },
          crop: {
            x: cropX,
            y: cropY,
            width: cropWidth,
            height: cropHeight
          },
          success: true
        });

        ctx.logger.success(`    ✓ 裁剪完成: ${croppedMetadata.width}x${croppedMetadata.height}`);
      } catch (error) {
        ctx.logger.error(`    ❌ 裁剪失败: ${error.message}`);
        cropResults.push({
          index: i,
          error: error.message,
          success: false
        });
      }
    }

    // 步骤4：上传裁剪后的图片到素材库
    ctx.logger.info('\n[步骤4] 上传裁剪图片到素材库');

    // 切换到素材库
    await page.click('.next-tabs-tab:has-text("素材库")');
    await page.waitForTimeout(1000);
    await page.click('.next-tabs-tab:has-text("图片")');
    await page.waitForTimeout(1000);

    // 点击上传按钮
    await page.click('text=上传图片');
    await page.waitForTimeout(2000);

    // 获取上传iframe
    const uploadFrame = page.frameLocator('iframe').first();

    // 搜索商品文件夹
    await uploadFrame.locator('input[placeholder*="文件夹"]').fill(productId);
    await page.waitForTimeout(1000);
    await uploadFrame.locator('.next-menu-item').first().click();
    await page.waitForTimeout(2000);

    // 上传裁剪后的图片文件
    const uploadedCropCount = await uploadCroppedImages(page, uploadFrame, croppedDir, cropResults, ctx);

    ctx.logger.success(`✅ 成功上传 ${uploadedCropCount} 张裁剪图片`);

    // 步骤5：在详情页插入3:4图片
    ctx.logger.info('\n[步骤5] 在详情页插入3:4图片');

    // 切换到详情编辑
    await page.click('.next-tabs-tab:has-text("详情")');
    await page.waitForTimeout(1000);

    // 查找详情编辑器
    const editorFrame = await page.$('.editor-container iframe, .detail-editor iframe');
    if (editorFrame) {
      const editorContent = await editorFrame.contentFrame();

      if (editorContent) {
        // 插入3:4比例图片
        for (let i = 0; i < cropResults.filter(r => r.success).length; i++) {
          const result = cropResults[i];
          if (result.success) {
            // 构建图片HTML
            const imgHtml = `
              <div style="text-align: center; margin: 10px 0;">
                <img src="data:image/jpeg;base64,${getBase64Image(result.cropped.path)}"
                     alt="商品图片${i + 1}"
                     style="max-width: 300px; width: 100%; aspect-ratio: 3/4; object-fit: cover;" />
              </div>
            `;

            // 插入到编辑器
            await editorContent.evaluate((html) => {
              const editor = document.querySelector('.editor-body, .content-body');
              if (editor) {
                editor.innerHTML += html;
              }
            }, imgHtml);

            ctx.logger.info(`  ✓ 插入图片 ${i + 1} 到详情页`);
          }
        }
      }
    }

    // 更新缓存
    taskCache.croppedImageResults = {
      totalImages: downloadedImages.length,
      croppedImages: cropResults.filter(r => r.success).length,
      uploadedImages: uploadedCropCount,
      outputDir: croppedDir,
      results: cropResults,
      timestamp: new Date().toISOString()
    };

    saveTaskCache(productId, taskCache);

    // 输出总结
    ctx.logger.success('\n=== 图片裁剪完成 ===');
    ctx.logger.info(`原始图片数: ${downloadedImages.length}`);
    ctx.logger.info(`成功裁剪: ${cropResults.filter(r => r.success).length}`);
    ctx.logger.info(`上传图片: ${uploadedCropCount}`);
    ctx.logger.info(`输出目录: ${croppedDir}`);

  } catch (error) {
    ctx.logger.error(`图片裁剪失败: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `步骤11失败: ${error.message}`
        });
      } catch (updateError) {
        ctx.logger.error(`更新飞书错误日志失败: ${updateError.message}`);
      }
    }

    throw error;

  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');
  }
};

/**
 * 上传裁剪后的图片
 */
async function uploadCroppedImages(page, uploadFrame, croppedDir, cropResults, ctx) {
  let uploadedCount = 0;
  const croppedFiles = cropResults
    .filter(r => r.success && r.cropped)
    .map(r => r.cropped.path);

  // 查找文件上传输入框
  const fileInput = await uploadFrame.locator('input[type="file"]').first();

  if (fileInput) {
    // 选择所有裁剪后的图片
    await fileInput.setInputFiles(croppedFiles);
    await page.waitForTimeout(3000);

    // 点击确认上传
    const confirmButton = uploadFrame.locator(`.next-btn-primary:has-text("确定(${croppedFiles.length})")`);
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
      await page.waitForTimeout(3000);
      uploadedCount = croppedFiles.length;
    }
  }

  return uploadedCount;
}

/**
 * 获取图片的Base64编码
 */
function getBase64Image(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
  } catch (error) {
    console.error(`读取图片失败: ${error.message}`);
    return '';
  }
}

module.exports = { step11 };