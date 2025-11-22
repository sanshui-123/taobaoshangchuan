const { spawn } = require('child_process');
const path = require('path');
const { feishuClient } = require('../feishu/client');
const { loadTaskCache, saveTaskCache, updateStepStatus } = require('../utils/cache');
const fs = require('fs');

/**
 * 步骤2：翻译商品内容（已禁用翻译，直接跳过）
 * 如果需要恢复翻译，可回滚到历史版本或接入真实翻译API。
 */
const step2 = async (ctx) => {
  ctx.logger.info('步骤2已禁用翻译，跳过并标记完成');

  // 如已标记为跳过，直接返回
  const taskCache = loadTaskCache(ctx.productId);
  if (taskCache.stepStatus && taskCache.stepStatus[2] === 'skipped') {
    updateStepStatus(ctx.productId, 2, 'skipped');
    return;
  }

  // 保底更新步骤状态
  taskCache.stepStatus[2] = 'done';
  saveTaskCache(ctx.productId, taskCache);
  updateStepStatus(ctx.productId, 2, 'done');
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

  // 确保 text 是字符串类型
  if (typeof text !== 'string') {
    if (text === null || text === undefined) {
      return [];
    }
    text = String(text);
  }

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
