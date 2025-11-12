import axios, { AxiosInstance } from 'axios';
import { FEISHU_CONFIG } from '../config';

interface TokenResponse {
  app_access_token: string;
  expire: number;
}

interface RecordResponse {
  code: number;
  data: {
    items: Array<{
      record_id: string;
      fields: Record<string, any>;
    }>;
    has_more: boolean;
    page_token?: string;
  };
}

interface UpdateRecordResponse {
  code: number;
  data: {
    record: {
      record_id: string;
    };
  };
}

interface FileUploadResponse {
  code: number;
  data: {
    file_token: string;
    url: string;
  };
}

export class FeishuClient {
  private token: string | null = null;
  private tokenExpireTime: number = 0;
  private axios: AxiosInstance;

  constructor() {
    this.axios = axios.create({
      baseURL: FEISHU_CONFIG.BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // 请求拦截器
    this.axios.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器 - 处理token刷新
    this.axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token过期，刷新后重试
          await this.refreshToken();
          return this.axios.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * 获取/刷新访问令牌
   */
  private async refreshToken(): Promise<void> {
    const now = Date.now();

    // 如果token仍然有效，不需要刷新
    if (this.token && now < this.tokenExpireTime) {
      return;
    }

    try {
      const response = await axios.post<TokenResponse>(
        `${FEISHU_CONFIG.BASE_URL}/open-apis/auth/v3/tenant_access_token/internal`,
        {
          app_id: FEISHU_CONFIG.APP_ID,
          app_secret: FEISHU_CONFIG.APP_SECRET
        }
      );

      this.token = response.data.app_access_token;
      // 提前5分钟过期
      this.tokenExpireTime = now + (response.data.expire - 300) * 1000;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      throw new Error('Failed to get access token');
    }
  }

  /**
   * 获取多维表格记录
   * @param viewId 视图ID，可选
   * @param pageSize 每页数量
   * @param pageToken 分页token
   */
  async getRecords(
    viewId: string = FEISHU_CONFIG.VIEW_ID,
    pageSize: number = 100,
    pageToken?: string
  ): Promise<RecordResponse['data']> {
    await this.refreshToken();

    const url = `/open-apis/bitable/v1/apps/${FEISHU_CONFIG.BITTABLE_TOKEN}/tables/${FEISHU_CONFIG.TABLE_ID}/records`;
    const params: any = {
      page_size: pageSize,
      view_id: viewId
    };

    if (pageToken) {
      params.page_token = pageToken;
    }

    // 筛选条件：状态为"待发布"
    const filter = {
      conjunction: 'and',
      conditions: [
        {
          field_name: FEISHU_CONFIG.STATUS_FIELD,
          operator: 'is',
          value: [FEISHU_CONFIG.TARGET_STATUS]
        }
      ]
    };

    params.filter = JSON.stringify(filter);

    try {
      const response = await this.axios.get<RecordResponse>(url, { params });

      if (response.data.code !== 0) {
        throw new Error(`Failed to get records: ${response.data.code}`);
      }

      return response.data.data;
    } catch (error) {
      console.error('Failed to get records:', error);
      throw error;
    }
  }

  /**
   * 获取所有记录（自动分页）
   */
  async getAllRecords(): Promise<Array<{ record_id: string; fields: Record<string, any> }>> {
    const allRecords = [];
    let pageToken: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const data = await this.getRecords(FEISHU_CONFIG.VIEW_ID, 100, pageToken);
      allRecords.push(...data.items);
      hasMore = data.has_more;
      pageToken = data.page_token;
    }

    return allRecords;
  }

  /**
   * 更新记录
   * @param recordId 记录ID
   * @param fields 要更新的字段
   */
  async updateRecord(
    recordId: string,
    fields: Record<string, any>
  ): Promise<void> {
    await this.refreshToken();

    const url = `/open-apis/bitable/v1/apps/${FEISHU_CONFIG.BITTABLE_TOKEN}/tables/${FEISHU_CONFIG.TABLE_ID}/records/${recordId}`;

    try {
      const response = await this.axios.put<UpdateRecordResponse>(url, {
        fields
      });

      if (response.data.code !== 0) {
        throw new Error(`Failed to update record: ${response.data.code}`);
      }
    } catch (error) {
      console.error('Failed to update record:', error);
      throw error;
    }
  }

  /**
   * 批量更新记录
   * @param records 记录数组
   */
  async batchUpdateRecords(
    records: Array<{
      record_id: string;
      fields: Record<string, any>;
    }>
  ): Promise<void> {
    await this.refreshToken();

    const url = `/open-apis/bitable/v1/apps/${FEISHU_CONFIG.BITTABLE_TOKEN}/tables/${FEISHU_CONFIG.TABLE_ID}/records/batch_update`;

    try {
      const response = await this.axios.post(url, {
        records
      });

      if (response.data.code !== 0) {
        throw new Error(`Failed to batch update records: ${response.data.code}`);
      }
    } catch (error) {
      console.error('Failed to batch update records:', error);
      throw error;
    }
  }

  /**
   * 上传文件并获取file_token
   * @param filePath 文件路径
   * @param parentType 父类型（例如：bitable_image）
   */
  async uploadFile(
    filePath: string,
    parentType: string = 'bitable_image'
  ): Promise<FileUploadResponse['data']> {
    await this.refreshToken();

    const FormData = require('form-data');
    const fs = require('fs');

    // 首先获取上传地址
    const uploadUrl = `${FEISHU_CONFIG.BASE_URL}/open-apis/drive/v1/medias/upload_all`;

    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      formData.append('parent_type', parentType);
      formData.append('parent_node', FEISHU_CONFIG.BITTABLE_TOKEN);

      const response = await this.axios.post<FileUploadResponse>(
        uploadUrl,
        formData,
        {
          headers: {
            ...formData.getHeaders()
          }
        }
      );

      if (response.data.code !== 0) {
        throw new Error(`Failed to upload file: ${response.data.code}`);
      }

      return response.data.data;
    } catch (error) {
      console.error('Failed to upload file:', error);
      throw error;
    }
  }

  /**
   * 下载附件
   * @param fileToken 文件token
   */
  async downloadAttachment(fileToken: string): Promise<Buffer> {
    await this.refreshToken();

    const url = `${FEISHU_CONFIG.BASE_URL}/open-apis/drive/v1/medias/${fileToken}/download`;

    try {
      const response = await this.axios.get(url, {
        responseType: 'arraybuffer'
      });

      return Buffer.from(response.data);
    } catch (error) {
      console.error('Failed to download attachment:', error);
      throw error;
    }
  }

  /**
   * 验证记录必填字段
   * @param record 记录数据
   */
  validateRequiredFields(record: Record<string, any>): {
    isValid: boolean;
    missingFields: string[];
  } {
    const requiredFields = [
      FEISHU_CONFIG.PRODUCT_ID_FIELD,
      FEISHU_CONFIG.BRAND_FIELD,
      FEISHU_CONFIG.TITLE_CN_FIELD,
      FEISHU_CONFIG.PRICE_FIELD,
      FEISHU_CONFIG.IMAGE_FIELD,
      FEISHU_CONFIG.COLOR_FIELD,
      FEISHU_CONFIG.SIZE_FIELD
    ];

    const missingFields = requiredFields.filter(field => {
      const value = record[field];
      return !value || (Array.isArray(value) ? value.length === 0 : false);
    });

    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  }
}

// 导出单例
export const feishuClient = new FeishuClient();