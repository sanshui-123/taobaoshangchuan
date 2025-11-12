import fs from 'fs';
import path from 'path';
import { TaskCache } from '../types';

const CACHE_DIR = path.join(process.cwd(), 'cache', 'tasks');

// 确保缓存目录存在
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export function loadTaskCache(productId: string): TaskCache {
  const cacheFilePath = path.join(CACHE_DIR, `${productId}.json`);

  try {
    if (fs.existsSync(cacheFilePath)) {
      const data = fs.readFileSync(cacheFilePath, 'utf8');
      const cache = JSON.parse(data);
      return cache;
    }
  } catch (error) {
    console.error(`Failed to load cache for ${productId}:`, error);
  }

  // 如果缓存不存在，创建新的
  const newCache: TaskCache = {
    productId,
    createdAt: new Date().toISOString(),
    stepStatus: {}
  };
  saveTaskCache(productId, newCache);
  return newCache;
}

export function saveTaskCache(productId: string, cache: TaskCache): void {
  const cacheFilePath = path.join(CACHE_DIR, `${productId}.json`);

  try {
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.error(`Failed to save cache for ${productId}:`, error);
  }
}

export function updateStepStatus(
  productId: string,
  stepId: number,
  status: 'pending' | 'done' | 'failed'
): void {
  const cache = loadTaskCache(productId);
  cache.stepStatus[stepId] = status;
  saveTaskCache(productId, cache);
}