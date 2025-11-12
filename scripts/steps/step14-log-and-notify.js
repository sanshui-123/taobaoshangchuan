const fs = require('fs');
const path = require('path');
const { loadTaskCache, saveTaskCache } = require('../utils/cache');
const { feishuClient } = require('../feishu/client');

/**
 * 步骤14：日志和通知
 * 完成整个流程的日志汇总和通知推送
 */
const step14 = async (ctx) => {
  ctx.logger.info('开始执行日志汇总和通知');

  try {
    const productId = ctx.productId;
    const startTime = ctx.startTime || new Date();
    const endTime = new Date();
    const duration = Math.round((endTime - startTime) / 1000); // 秒

    // 加载任务缓存
    const taskCache = loadTaskCache(productId);
    if (!taskCache) {
      throw new Error('未找到任务缓存');
    }

    // 步骤1：生成执行报告
    ctx.logger.info('\n[步骤1] 生成执行报告');

    const report = generateExecutionReport({
      productId: productId,
      startTime: startTime,
      endTime: endTime,
      duration: duration,
      stepStatus: taskCache.stepStatus || {},
      submitResults: taskCache.submitResults,
      productData: taskCache.productData
    });

    // 保存报告到文件
    const reportDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportFile = path.join(reportDir, `${productId}_${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    ctx.logger.info(`✅ 执行报告已保存: ${reportFile}`);

    // 步骤2：保存详细日志
    ctx.logger.info('\n[步骤2] 保存详细日志');

    const logFile = await saveDetailedLog(ctx, report);

    // 步骤3：清理临时文件
    ctx.logger.info('\n[步骤3] 清理临时文件');

    await cleanupTempFiles(productId, ctx);

    // 步骤4：更新飞书最终状态
    ctx.logger.info('\n[步骤4] 更新飞书最终状态');

    if (ctx.feishuRecordId) {
      const updateFields = {
        [process.env.FEISHU_STATUS_FIELD || 'status']: report.summary.status === 'success' ? '已完成' : '发布失败',
        [process.env.FEISHU_DURATION_FIELD || 'duration']: `${duration}秒`,
        [process.env.FEISHU_REPORT_FIELD || 'report']: reportFile
      };

      // 添加错误信息
      if (report.summary.errors.length > 0) {
        updateFields[process.env.FEISHU_ERROR_LOG_FIELD || 'error_log'] = report.summary.errors.join('; ');
      }

      // 添加商品链接
      if (taskCache.submitResults && taskCache.submitResults.taobaoUrl) {
        updateFields[process.env.FEISHU_URL_FIELD || 'taobao_url'] = taskCache.submitResults.taobaoUrl;
        updateFields[process.env.FEISHU_PRODUCT_ID_FIELD || 'product_id'] = taskCache.submitResults.taobaoProductId;
      }

      await feishuClient.updateRecord(ctx.feishuRecordId, updateFields);
      ctx.logger.info('✅ 飞书最终状态已更新');
    }

    // 步骤5：输出最终总结
    ctx.logger.success('\n' + '='.repeat(50));
    ctx.logger.success('========== 流程执行完成 ==========');
    ctx.logger.info(`商品ID: ${productId}`);
    ctx.logger.info(`商品标题: ${taskCache.productData?.titleCN || 'N/A'}`);
    ctx.logger.info(`执行状态: ${report.summary.status === 'success' ? '✅ 成功' : '❌ 失败'}`);
    ctx.logger.info(`执行时间: ${formatDuration(duration)}`);
    ctx.logger.info(`完成步骤: ${report.summary.completedSteps}/14`);

    if (taskCache.submitResults && taskCache.submitResults.taobaoProductId) {
      ctx.logger.success(`淘宝商品ID: ${taskCache.submitResults.taobaoProductId}`);
      ctx.logger.success(`商品链接: ${taskCache.submitResults.taobaoUrl}`);
    }

    if (report.summary.errors.length > 0) {
      ctx.logger.error('\n错误汇总:');
      report.summary.errors.forEach(error => {
        ctx.logger.error(`  - ${error}`);
      });
    }

    if (report.summary.warnings.length > 0) {
      ctx.logger.warn('\n警告信息:');
      report.summary.warnings.forEach(warning => {
        ctx.logger.warn(`  - ${warning}`);
      });
    }

    ctx.logger.info(`\n报告文件: ${reportFile}`);
    ctx.logger.info(`日志文件: ${logFile}`);
    ctx.logger.success('='.repeat(50));

    // 更新缓存
    taskCache.stepStatus = taskCache.stepStatus || {};
    taskCache.stepStatus[14] = 'done';
    taskCache.completionTime = new Date().toISOString();
    taskCache.duration = duration;
    taskCache.reportFile = reportFile;
    taskCache.logFile = logFile;
    saveTaskCache(productId, taskCache);

    // 如果整体失败，抛出错误
    if (report.summary.status !== 'success') {
      throw new Error(`流程执行失败: ${report.summary.errors.join(', ')}`);
    }

  } catch (error) {
    ctx.logger.error(`日志通知步骤失败: ${error.message}`);

    // 更新飞书错误日志
    if (ctx.feishuRecordId) {
      try {
        await feishuClient.updateRecord(ctx.feishuRecordId, {
          [process.env.FEISHU_STATUS_FIELD || 'status']: '失败',
          [process.env.FEISHU_ERROR_LOG_FIELD || 'error_log']: `步骤14失败: ${error.message}`
        });
      } catch (updateError) {
        ctx.logger.error(`更新飞书错误日志失败: ${updateError.message}`);
      }
    }

    throw error;
  }
};

/**
 * 生成执行报告
 */
function generateExecutionReport(data) {
  const { productId, startTime, endTime, duration, stepStatus, submitResults, productData } = data;

  const steps = [];
  const errors = [];
  const warnings = [];

  // 分析每个步骤
  for (let i = 0; i <= 14; i++) {
    const status = stepStatus[i] || 'skipped';
    const stepNames = [
      '任务初始化', '下载图片', '翻译内容', '登录验证',
      '打开发布页', '上传主图', '选择品牌', '填写货号性别',
      '填写颜色', '填写尺码', '填写价格库存', '裁剪图片',
      '填写详情', '提交商品', '日志通知'
    ];

    steps.push({
      step: i,
      name: stepNames[i] || `步骤${i}`,
      status: status,
      completed: status === 'done'
    });

    // 收集错误
    if (status === 'failed') {
      errors.push(`步骤${i}: ${stepNames[i]}失败`);
    }
  }

  // 收集警告
  if (!submitResults) {
    warnings.push('商品未提交');
  } else if (submitResults.status !== 'success') {
    warnings.push(`商品提交失败: ${submitResults.message}`);
  }

  const completedSteps = steps.filter(s => s.completed).length;
  const overallStatus = completedSteps === 14 && submitResults?.status === 'success' ? 'success' : 'failed';

  return {
    productId: productId,
    productTitle: productData?.titleCN || '',
    executionTime: {
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      duration: duration,
      formatted: formatDuration(duration)
    },
    summary: {
      status: overallStatus,
      completedSteps: completedSteps,
      totalSteps: 14,
      successRate: Math.round((completedSteps / 14) * 100),
      errors: errors,
      warnings: warnings
    },
    steps: steps,
    submitResults: submitResults,
    statistics: {
      imagesDownloaded: productData?.downloadResults?.successCount || 0,
      imagesUploaded: productData?.uploadResults?.uploadedImages || 0,
      colorsConfigured: productData?.colors?.length || 0,
      sizesConfigured: productData?.sizes?.length || 0
    }
  };
}

/**
 * 保存详细日志
 */
async function saveDetailedLog(ctx, report) {
  const logDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logFile = path.join(logDir, `${ctx.productId}_${new Date().toISOString().replace(/[:.]/g, '-')}.log`);

  // 构建日志内容
  let logContent = `# 商品发布执行日志\n`;
  logContent += `# 商品ID: ${ctx.productId}\n`;
  logContent += `# 开始时间: ${report.executionTime.start}\n`;
  logContent += `# 结束时间: ${report.executionTime.end}\n`;
  logContent += `# 执行时长: ${report.executionTime.formatted}\n`;
  logContent += `# 总体状态: ${report.summary.status === 'success' ? '成功' : '失败'}\n`;
  logContent += `# 完成步骤: ${report.summary.completedSteps}/14\n\n`;

  // 步骤详情
  logContent += `## 步骤执行详情\n\n`;
  report.steps.forEach(step => {
    const status = step.status === 'done' ? '✅' : step.status === 'failed' ? '❌' : '⏭️';
    logContent += `${status} 步骤${step.step}: ${step.name}\n`;
  });

  // 错误和警告
  if (report.summary.errors.length > 0) {
    logContent += `\n## 错误信息\n\n`;
    report.summary.errors.forEach(error => {
      logContent += `- ${error}\n`;
    });
  }

  if (report.summary.warnings.length > 0) {
    logContent += `\n## 警告信息\n\n`;
    report.summary.warnings.forEach(warning => {
      logContent += `- ${warning}\n`;
    });
  }

  // 统计信息
  logContent += `\n## 统计信息\n\n`;
  logContent += `- 下载图片: ${report.statistics.imagesDownloaded} 张\n`;
  logContent += `- 上传图片: ${report.statistics.imagesUploaded} 张\n`;
  logContent += `- 配置颜色: ${report.statistics.colorsConfigured} 个\n`;
  logContent += `- 配置尺码: ${report.statistics.sizesConfigured} 个\n`;

  // 商品信息
  if (report.submitResults && report.submitResults.taobaoProductId) {
    logContent += `\n## 商品信息\n\n`;
    logContent += `- 淘宝商品ID: ${report.submitResults.taobaoProductId}\n`;
    logContent += `- 商品链接: ${report.submitResults.taobaoUrl}\n`;
  }

  fs.writeFileSync(logFile, logContent, 'utf8');
  return logFile;
}

/**
 * 清理临时文件
 */
async function cleanupTempFiles(productId, ctx) {
  const tempDir = path.resolve(process.cwd(), 'temp');
  const screenshotsDir = path.resolve(process.cwd(), 'screenshots');

  // 清理超过7天的截图文件
  try {
    if (fs.existsSync(screenshotsDir)) {
      const files = fs.readdirSync(screenshotsDir);
      const now = new Date();

      files.forEach(file => {
        if (file.startsWith(`${productId}_`) && file.includes('_error')) {
          const filePath = path.join(screenshotsDir, file);
          const stat = fs.statSync(filePath);
          const daysOld = (now - stat.mtime) / (1000 * 60 * 60 * 24);

          if (daysOld > 7) {
            fs.unlinkSync(filePath);
            ctx.logger.info(`  清理旧截图: ${file}`);
          }
        }
      });
    }
  } catch (error) {
    ctx.logger.warn(`清理文件失败: ${error.message}`);
  }
}

/**
 * 格式化时间
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}小时${minutes}分${secs}秒`;
  } else if (minutes > 0) {
    return `${minutes}分${secs}秒`;
  } else {
    return `${secs}秒`;
  }
}

module.exports = { step14 };