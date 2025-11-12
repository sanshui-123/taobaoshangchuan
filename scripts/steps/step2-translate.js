const { spawn } = require('child_process');
const path = require('path');
const { feishuClient } = require('../feishu/client');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
const fs = require('fs');

/**
 * 步骤2：翻译商品内容
 * 调用翻译脚本生成中/日文内容
 */
const step2 = async (ctx) => {
  ctx.logger.info('开始翻译商品内容');

  // 创建心跳定时器
  const heartbeat = setInterval(() => {
    process.stdout.write('.');
  }, 5000);

  try {
    // 加载缓存
    const taskCache = loadTaskCache(ctx.productId);

    if (!taskCache.productData) {
      throw new Error('缓存中没有商品数据，请先执行步骤0');
    }

    const { productData } = taskCache;
    const translations = {};

    ctx.logger.info(`商品ID: ${ctx.productId}`);
    ctx.logger.info(`品牌: ${productData.brand}`);
    ctx.logger.info(`原始标题: ${productData.titleCN.substring(0, 50)}...`);

    // 翻译结果统计
    const stats = {
      total: 0,
      success: 0,
      failed: 0,
      results: []
    };

    // 1. 翻译标题（中文到日文）
    if (productData.titleCN && !productData.titleJP) {
      stats.total++;
      ctx.logger.info('翻译标题（中->日）...');

      try {
        const jpTitle = await translateText(
          productData.titleCN,
          'zh',
          'ja',
          'title'
        );

        if (jpTitle.success) {
          translations.titleJP = jpTitle.translated;
          stats.success++;
          ctx.logger.success(`  ✓ ${jpTitle.translated.substring(0, 50)}...`);

          // 长度校验（标题≤60字）
          if (jpTitle.translated.length > 60) {
            ctx.logger.warn(`  警告：日文标题过长 (${jpTitle.translated.length}字)，将被截断`);
            translations.titleJP = jpTitle.translated.substring(0, 60);
          }
        } else {
          throw new Error(jpTitle.error);
        }
      } catch (error) {
        stats.failed++;
        ctx.logger.error(`  ✗ 标题翻译失败: ${error.message}`);
        translations.titleJP = productData.titleCN; // 使用原标题作为后备
      }

      stats.results.push({
        type: 'title',
        source: productData.titleCN,
        target: translations.titleJP,
        status: stats.failed === stats.total ? 'failed' : 'success'
      });
    }

    // 2. 翻译卖点（中文到日文）
    if (productData.descriptionCN && !productData.descriptionJP) {
      stats.total++;
      ctx.logger.info('翻译卖点（中->日）...');

      try {
        const jpDesc = await translateText(
          productData.descriptionCN,
          'zh',
          'ja',
          'description'
        );

        if (jpDesc.success) {
          translations.descriptionJP = jpDesc.translated;
          stats.success++;
          ctx.logger.success(`  ✓ ${jpDesc.translated.substring(0, 50)}...`);
        } else {
          throw new Error(jpDesc.error);
        }
      } catch (error) {
        stats.failed++;
        ctx.logger.error(`  ✗ 卖点翻译失败: ${error.message}`);
        translations.descriptionJP = productData.descriptionCN; // 使用原描述作为后备
      }
    }

    // 3. 翻译详情页（中文到日文）
    if (productData.detailCN && !productData.detailJP) {
      stats.total++;
      ctx.logger.info('翻译详情页（中->日）...');

      // 详情页可能很长，分段处理
      const segments = splitIntoSegments(productData.detailCN, 800);
      let translatedDetail = '';

      for (let i = 0; i < segments.length; i++) {
        ctx.logger.info(`  处理段落 ${i + 1}/${segments.length}...`);

        try {
          const segmentTranslation = await translateText(
            segments[i],
            'zh',
            'ja',
            'detail'
          );

          if (segmentTranslation.success) {
            translatedDetail += segmentTranslation.translated;
            if (i < segments.length - 1) {
              translatedDetail += '\n';
            }
          } else {
            throw new Error(segmentTranslation.error);
          }
        } catch (error) {
          ctx.logger.error(`  ✗ 段落${i + 1}翻译失败: ${error.message}`);
          translatedDetail += segments[i]; // 使用原文作为后备
        }
      }

      // 长度校验（详情≤1000字）
      if (translatedDetail.length > 1000) {
        ctx.logger.warn(`  警告：日文详情过长 (${translatedDetail.length}字)，将被截断`);
        translatedDetail = translatedDetail.substring(0, 1000);
      }

      translations.detailJP = translatedDetail;
      stats.success++;
      ctx.logger.success(`  ✓ 详情页翻译完成 (${translatedDetail.length}字)`);
    }

    // 更新缓存中的翻译数据
    taskCache.translations = translations;
    taskCache.productData = {
      ...productData,
      ...translations
    };

    // 写回飞书（如果有更新）
    if (stats.success > 0 && ctx.feishuRecordId) {
      ctx.logger.info('更新飞书数据...');

      const updateFields = {};

      if (translations.titleJP) {
        updateFields[process.env.FEISHU_TITLE_JP_FIELD || 'タイトル'] = [translations.titleJP];
      }

      if (translations.descriptionJP) {
        updateFields[process.env.FEISHU_DESCRIPTION_JP_FIELD || '卖点_日文'] = [translations.descriptionJP];
      }

      if (translations.detailJP) {
        updateFields[process.env.FEISHU_DETAIL_JP_FIELD || '详情页文字_日文'] = [translations.detailJP];
      }

      if (Object.keys(updateFields).length > 0) {
        try {
          await feishuClient.updateRecord(ctx.feishuRecordId, updateFields);
          ctx.logger.success('飞书数据更新成功');
        } catch (error) {
          ctx.logger.error(`飞书数据更新失败: ${error.message}`);
          // 不中断流程，继续执行
        }
      }
    }

    // 保存缓存
    saveTaskCache(ctx.productId, taskCache);
    updateStepStatus(ctx.productId, 2, 'done');

    // 输出翻译总结
    ctx.logger.success('\n=== 翻译完成 ===');
    ctx.logger.info(`总任务数: ${stats.total}`);
    ctx.logger.success(`成功: ${stats.success}`);
    if (stats.failed > 0) {
      ctx.logger.error(`失败: ${stats.failed}`);
    }

    // 保存翻译日志
    const translationLog = {
      timestamp: new Date().toISOString(),
      productId: ctx.productId,
      stats,
      translations
    };

    const logDir = path.resolve(process.cwd(), 'logs', ctx.productId);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(logDir, 'translation.json'),
      JSON.stringify(translationLog, null, 2),
      'utf8'
    );

  } catch (error) {
    ctx.logger.error(`翻译失败: ${error.message}`);
    updateStepStatus(ctx.productId, 2, 'failed');
    throw error;
  } finally {
    clearInterval(heartbeat);
    process.stdout.write('\n');
  }
};

/**
 * 调用翻译脚本
 */
function translateText(text, sourceLang, targetLang, taskType = 'translate') {
  return new Promise((resolve, reject) => {
    const pythonPath = path.resolve(process.cwd(), 'translator_v2.py');
    const child = spawn('python3', [pythonPath, sourceLang, targetLang, text, taskType]);

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`翻译脚本退出码: ${code}, 错误: ${errorOutput}`));
        return;
      }

      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (parseError) {
        reject(new Error(`解析翻译结果失败: ${parseError.message}, 输出: ${output}`));
      }
    });

    // 设置超时
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('翻译超时'));
    }, 30000);

    child.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

/**
 * 将长文本分割成段落
 */
function splitIntoSegments(text, maxLength = 800) {
  const segments = [];
  const paragraphs = text.split('\n');
  let currentSegment = '';

  for (const paragraph of paragraphs) {
    if (currentSegment.length + paragraph.length + 1 > maxLength) {
      if (currentSegment) {
        segments.push(currentSegment);
        currentSegment = '';
      }

      // 如果单个段落就超过最大长度，强制分割
      if (paragraph.length > maxLength) {
        for (let i = 0; i < paragraph.length; i += maxLength) {
          segments.push(paragraph.substring(i, i + maxLength));
        }
      } else {
        currentSegment = paragraph;
      }
    } else {
      if (currentSegment) {
        currentSegment += '\n' + paragraph;
      } else {
        currentSegment = paragraph;
      }
    }
  }

  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}

module.exports = { step2 };