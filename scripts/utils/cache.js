const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(process.cwd(), 'cache', 'tasks');

// 确保缓存目录存在
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function loadTaskCache(productId) {
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
  const newCache = {
    productId,
    createdAt: new Date().toISOString(),
    stepStatus: {}
  };
  saveTaskCache(productId, newCache);
  return newCache;
}

function saveTaskCache(productId, cache) {
  const cacheFilePath = path.join(CACHE_DIR, `${productId}.json`);

  try {
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.error(`Failed to save cache for ${productId}:`, error);
  }
}

function updateStepStatus(productId, stepId, status) {
  const cache = loadTaskCache(productId);
  cache.stepStatus[stepId] = status;
  saveTaskCache(productId, cache);
}

module.exports = { loadTaskCache, saveTaskCache, updateStepStatus };