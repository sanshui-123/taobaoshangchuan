/**
 * 飞书API客户端 - 基础版本
 * 用于演示，实际使用时需要配置真实的App ID和Secret
 */
require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

class FeishuClient {
  constructor(appId, appSecret, appToken, tableId) {
    this.appId = appId || process.env.FEISHU_APP_ID || '';
    this.appSecret = appSecret || process.env.FEISHU_APP_SECRET || '';
    // appToken 应该使用 BITTABLE_TOKEN（多维表应用token）
    this.appToken = appToken || process.env.FEISHU_BITTABLE_TOKEN || '';
    this.tableId = tableId || process.env.FEISHU_TABLE_ID || '';
    this.tenantAccessToken = null;
    this.tokenExpireTime = 0;
    this.baseUrl = 'https://open.feishu.cn/open-apis';
  }

  /**
   * 获取访问令牌
   */
  async getAccessToken() {
    if (this.tenantAccessToken && Date.now() < this.tokenExpireTime) {
      return this.tenantAccessToken;
    }

    const data = JSON.stringify({
      app_id: this.appId,
      app_secret: this.appSecret
    });

    const options = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.code === 0) {
              this.tenantAccessToken = response.tenant_access_token;
              // 提前5分钟刷新token
              this.tokenExpireTime = Date.now() + (response.expire - 300) * 1000;
              resolve(this.tenantAccessToken);
            } else {
              reject(new Error(`获取token失败: ${response.msg}`));
            }
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * 发送请求
   */
  async request(path, method = 'GET', data = null) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${path}`;

    const options = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      const body = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    // 确保 path 以 /open-apis 开头
    const apiPath = path.startsWith('/open-apis') ? path : '/open-apis' + path;
    options.path = apiPath;

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';

        // 处理chunked编码
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            // 检查是否是HTML响应（错误页面）
            if (body.trim().startsWith('<!')) {
              reject(new Error('收到HTML响应，可能是认证失败'));
              return;
            }

            const response = JSON.parse(body);
            if (response.code === 0) {
              resolve(response.data);
            } else {
              // 添加更详细的错误信息
              let errorMsg = `请求失败: ${response.msg}`;
              if (response.msg.includes('FieldNameNotFound')) {
                // 尝试从请求体中提取字段名
                if (data && data.records && data.records[0] && data.records[0].fields) {
                  const fieldNames = Object.keys(data.records[0].fields);
                  errorMsg += `\n尝试更新的字段: ${fieldNames.join(', ')}`;
                }
              }
              reject(new Error(errorMsg));
            }
          } catch (e) {
            // 调试输出
            console.error('JSON解析错误，响应内容:', body.substring(0, 200));
            reject(new Error('解析响应失败'));
          }
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  /**
   * 获取多维表格记录
   */
  async getRecords(pageSize = 100, filterStatuses = null, pageToken = null) {
    // 使用实例变量中的 appToken 和 tableId
    if (!this.appToken || !this.tableId) {
      throw new Error('App token and table ID are required');
    }

    // 构建请求路径，包含过滤条件
    let path = `/bitable/v1/apps/${this.appToken}/tables/${this.tableId}/records?page_size=${pageSize}`;

    if (pageToken) {
      path += `&page_token=${pageToken}`;
    }

    // 如果需要过滤状态，构建 filter 参数
    if (filterStatuses && filterStatuses.length > 0) {
      const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';

      // 过滤掉空状态，只处理具体的状态值
      const validStatuses = filterStatuses.filter(status => status !== '');

      if (validStatuses.length > 0) {
        // 构建条件过滤器 - 使用简化的过滤器结构
        const conditions = validStatuses.map(status => ({
          field_name: statusField,
          operator: 'is',
          value: status
        }));

        // 使用 OR 连接条件
        path += `&filter=${encodeURIComponent(JSON.stringify({
          conjunction: 'or',
          conditions: conditions
        }))}`;
      }
    }

    const response = await this.request(path);

    // 如果没有传入过滤状态，使用环境变量进行本地过滤（包括空值）
    if (!filterStatuses) {
      const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
      const targetStatusStr = process.env.FEISHU_TARGET_STATUS;
      filterStatuses = targetStatusStr ? targetStatusStr.split(',').map(s => s.trim()) : ['待上传'];

      if (response.records) {
        response.records = response.records.filter(record => {
          const statusValue = record.fields[statusField];

          // 包含空值处理（如果FEISHU_STATUS_CHECKING_VALUE存在）
          if ((!statusValue || statusValue === '') && process.env.FEISHU_STATUS_CHECKING_VALUE) {
            return true;
          }

          // 检查状态是否在目标状态列表中
          return filterStatuses.includes(statusValue);
        });
      }
    }

    return response;
  }

  /**
   * 获取所有记录（带筛选）
   * 支持 FEISHU_TARGET_STATUS 环境变量指定多个状态，用逗号分隔
   * 例如：FEISHU_TARGET_STATUS="待检测,待上传"
   */
  async getAllRecords() {
    // 解析目标状态列表
    const targetStatusEnv = process.env.FEISHU_TARGET_STATUS;
    console.log('[飞书-DEBUG] FEISHU_TARGET_STATUS:', targetStatusEnv);
    let targetStatuses;
    let includeEmpty = false; // 是否包含空状态

    if (targetStatusEnv) {
      // 支持逗号分隔的多个状态，split 后的数组保留所有元素
      const rawStatuses = targetStatusEnv.split(',').map(s => s.trim());
      console.log('[飞书-DEBUG] Split后的状态:', rawStatuses);

      // 检查是否包含空字符串（表示要包含空状态）
      includeEmpty = rawStatuses.some(s => s === '');
      console.log('[飞书-DEBUG] 包含空状态:', includeEmpty);

      // 过滤掉空字符串，得到非空状态列表
      targetStatuses = rawStatuses.filter(s => s);
      console.log('[飞书-DEBUG] 非空状态列表:', targetStatuses);

      if (includeEmpty) {
        console.log('[飞书] ✅ 配置包含空状态，将同时获取状态为空的记录');
      }
    } else {
      // 默认只获取"待检测"状态
      targetStatuses = [process.env.FEISHU_STATUS_CHECKING_VALUE || '待检测'];
    }

    const statusField = process.env.FEISHU_STATUS_FIELD || '上传状态';
    const pageSize = 500; // 保守使用 500，避免接口上限

    // 带分页拉取
    const fetchAll = async (statuses) => {
      const all = [];
      let pageToken = null;
      let hasMore = true;
      while (hasMore) {
        const resp = await this.getRecords(pageSize, statuses, pageToken);
        all.push(...(resp.records || resp.items || []));
        hasMore = !!resp.has_more;
        pageToken = resp.page_token || null;
        if (!hasMore) break;
      }
      return all;
    };

    let records = [];
    try {
      records = await fetchAll(targetStatuses);
    } catch (error) {
      if (error.message.includes('InvalidFilter')) {
        this.logger?.warn?.('API 过滤失败，回退到本地过滤');
        const allRecords = await fetchAll(null);
        records = allRecords.filter(record => {
          const statusValue = record.fields[statusField];
          return targetStatuses.includes(statusValue);
        });
      } else {
        throw error;
      }
    }

    // 如需包含空状态，补充空值记录并去重
    if (includeEmpty) {
      const allRecords = await fetchAll(null);
      const emptyRecords = allRecords.filter(record => {
        const statusValue = record.fields[statusField];
        return !statusValue || statusValue === '';
      });

      const seen = new Set(records.map(r => r.record_id));
      emptyRecords.forEach(r => {
        if (!seen.has(r.record_id)) {
          records.push(r);
        }
      });
    }

    return records;
  }

  /**
   * 更新记录
   */
  async updateRecord(recordId, fields) {
    if (!this.appToken || !this.tableId) {
      throw new Error('App token and table ID are required');
    }

    // 使用批量更新接口
    const path = `/bitable/v1/apps/${this.appToken}/tables/${this.tableId}/records/batch_update`;
    const data = {
      records: [
        {
          record_id: recordId,
          fields: fields
        }
      ]
    };
    return this.request(path, 'POST', data);
  }

  /**
   * 批量更新多条记录
   */
  async batchUpdateRecords(records) {
    if (!this.appToken || !this.tableId) {
      throw new Error('App token and table ID are required');
    }

    if (!records || records.length === 0) {
      return { code: 0, data: { records: [] } };
    }

    // 限制批量更新的记录数量
    const MAX_BATCH_SIZE = 500;
    if (records.length > MAX_BATCH_SIZE) {
      console.warn(`批量更新记录数 ${records.length} 超过限制 ${MAX_BATCH_SIZE}，将分批处理`);
    }

    const path = `/bitable/v1/apps/${this.appToken}/tables/${this.tableId}/records/batch_update`;
    const data = {
      records: records
    };
    return this.request(path, 'POST', data);
  }

  /**
   * 上传文件
   */
  async uploadFile(parentType, parentToken, fileName, buffer) {
    const token = await this.getAccessToken();

    return new Promise((resolve, reject) => {
      const boundary = '----WebKitFormBoundary' + Date.now();

      const formData = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file_name"',
        '',
        fileName,
        `--${boundary}`,
        'Content-Disposition: form-data; name="parent_type"',
        '',
        parentType,
        `--${boundary}`,
        'Content-Disposition: form-data; name="parent_node"',
        '',
        parentToken,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="' + fileName + '"',
        'Content-Type: application/octet-stream',
        '',
        buffer,
        `--${boundary}--`
      ].join('\r\n');

      const options = {
        hostname: 'open.feishu.cn',
        port: 443,
        path: '/open-apis/drive/v1/medias/upload_all',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': Buffer.byteLength(formData)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.code === 0) {
              resolve(response.data);
            } else {
              reject(new Error(`上传失败: ${response.msg}`));
            }
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.write(formData);
      req.end();
    });
  }

  /**
   * 下载文件
   */
  async downloadFile(fileToken) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/drive/v1/medias/${fileToken}/download`;

    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }, (res) => {
        if (res.statusCode === 302) {
          https.get(res.headers.location, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
              resolve(Buffer.concat(chunks));
            });
          }).on('error', reject);
        } else {
          reject(new Error(`下载失败: ${res.statusCode}`));
        }
      }).on('error', reject);
    });
  }

  /**
   * 下载附件（用于下载图片）
   * @param {string} fileToken 文件token
   * @returns {Promise<Buffer>} 图片buffer
   */
  async downloadAttachment(fileToken) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/open-apis/drive/v1/medias/${fileToken}/download`;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'open.feishu.cn',
        port: 443,
        path: `/open-apis/drive/v1/medias/${fileToken}/download`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // 处理重定向
          https.get(res.headers.location, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
              resolve(Buffer.concat(chunks));
            });
          }).on('error', reject);
        } else if (res.statusCode === 200) {
          // 直接返回响应数据
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            resolve(Buffer.concat(chunks));
          });
        } else {
          reject(new Error(`下载失败，状态码: ${res.statusCode}`));
        }
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }

  /**
   * 验证必填字段
   */
  validateRequiredFields(fields, requiredFields = []) {
    const missing = [];

    const defaultRequired = [
      process.env.FEISHU_IMAGE_FIELD || '图片',
      process.env.FEISHU_TITLE_FIELD || '商品标题',
      process.env.FEISHU_PRICE_FIELD || '价格'
    ];

    requiredFields = requiredFields.length > 0 ? requiredFields : defaultRequired;

    for (const field of requiredFields) {
      if (!fields[field] || (Array.isArray(fields[field]) && fields[field].length === 0)) {
        missing.push(field);
      }
    }

    return {
      isValid: missing.length === 0,
      missingFields: missing
    };
  }
}

// 创建客户端实例 - 使用环境变量初始化
const feishuClient = new FeishuClient(
  process.env.FEISHU_APP_ID,
  process.env.FEISHU_APP_SECRET,
  process.env.FEISHU_APP_TOKEN,
  process.env.FEISHU_TABLE_ID
);

module.exports = {
  feishuClient,
  FeishuClient,
  downloadAttachment: feishuClient.downloadAttachment.bind(feishuClient)
};
