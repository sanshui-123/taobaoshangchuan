/**
 * 飞书多维表便捷封装
 * 目前仅提供获取“待处理”记录的最小实现，供批处理脚本使用。
 */

const { feishuClient } = require('../feishu/client');

/**
 * 解析目标状态列表：优先使用入参，其次环境变量 FEISHU_TARGET_STATUS，最后默认值。
 */
function parseTargetStatuses(statuses) {
  if (Array.isArray(statuses) && statuses.length > 0) {
    return statuses;
  }

  if (process.env.FEISHU_TARGET_STATUS) {
    return process.env.FEISHU_TARGET_STATUS
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  // 默认取“待检测”和“待上传”
  return [
    process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测',
    process.env.FEISHU_STATUS_PENDING_VALUE || '待上传'
  ];
}

/**
 * 获取处于待处理状态的记录列表
 * @param {string[]} [statuses] 可选的状态列表
 * @returns {Promise<Array>} 飞书记录数组
 */
async function getPendingRecords(statuses) {
  const targetStatuses = parseTargetStatuses(statuses);
  const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';

  try {
    // 使用 client 内置的 getRecords，服务端/本地都会按状态过滤
    const resp = await feishuClient.getRecords(1000, targetStatuses);
    const records = resp.records || resp.items || [];

    // 再做一次本地兜底过滤，避免接口未按预期过滤
    return records.filter(record => {
      const value = record.fields?.[statusField];
      return targetStatuses.includes(value);
    });
  } catch (error) {
    console.error('[feishu-manager] 获取待处理记录失败:', error.message);
    return [];
  }
}

module.exports = {
  getPendingRecords
};
