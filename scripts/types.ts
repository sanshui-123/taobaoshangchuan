import { Page } from 'playwright';

export type StepId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface StepStatus {
  [key: number]: 'pending' | 'done' | 'failed';
}

export interface TaskCache {
  productId: string;
  createdAt: string;
  stepStatus: StepStatus;
  data?: any;
}

export interface StepLogger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  success(message: string, meta?: any): void;
}

export interface StepContext {
  productId: string;
  feishuRecordId?: string;
  page?: Page;
  page1?: Page;
  taskCache: TaskCache;
  logger: StepLogger;
  stepStatus: Record<StepId, 'pending' | 'done' | 'failed'>;
  runStep(step: StepId): Promise<void>;
}

export type StepHandler = (ctx: StepContext) => Promise<void>;

export interface RunOptions {
  product: string;
  steps?: StepId[];
  from?: StepId;
  to?: StepId;
}