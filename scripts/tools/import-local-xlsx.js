/**
 * 将本地 Excel（类似飞书导出的格式）转为任务缓存，供线下发布使用
 *
 * 使用：
 *   node scripts/tools/import-local-xlsx.js /path/to/工作簿2.xlsx
 *
 * 输出：
 *   在 cache/tasks/<productId>.json 生成任务缓存，Step0 视为已完成。
 *
 * 假设列顺序（按样例“工作簿2.xlsx”）：
 *   0: 商品ID
 *   1: 品牌
 *   2: 标题
 *   3: 颜色
 *   4: 尺码
 *   5: 价格
 *   6: 品类
 *   7: 性别
 *   8: 商品链接
 *   9 及以后: 图片 URL / 其他字段（取所有 http 开头的）
 *   12: 尺码表
 *   14: 状态（可选）
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('用法: node scripts/tools/import-local-xlsx.js <excel-path>');
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`文件不存在: ${inputPath}`);
  process.exit(1);
}

const workbook = XLSX.readFile(inputPath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

console.log(`读取 ${inputPath} - 工作表: ${sheetName}, 行数: ${rows.length}`);

const tasksDir = path.resolve(process.cwd(), 'cache', 'tasks');
fs.mkdirSync(tasksDir, { recursive: true });

let current = null;
const products = [];

function flushCurrent() {
  if (!current || !current.productId) return;

  // 去重
  const unique = (arr) => Array.from(new Set(arr.filter(Boolean)));
  current.images = unique(current.images);
  current.colors = unique(current.colors);
  current.sizes = unique(current.sizes);

  const cache = {
    productId: current.productId,
    createdAt: new Date().toISOString(),
    stepStatus: { 0: 'done' },
    productData: {
      productId: current.productId,
      brand: current.brand || '',
      titleCN: current.title || '',
      titleJP: current.titleJP || '',
      descriptionCN: current.descriptionCN || '',
      descriptionJP: current.descriptionJP || '',
      detailCN: current.detailCN || '',
      detailJP: current.detailJP || '',
      price: current.price || '',
      category: current.category || '',
      gender: current.gender || '',
      productUrl: current.productUrl || '',
      images: current.images,
      colors: current.colors,
      sizes: current.sizes,
      sizeTable: current.sizeTable || ''
    },
    images: current.images,
    colors: current.colors,
    sizes: current.sizes
  };

  const outPath = path.join(tasksDir, `${current.productId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(cache, null, 2), 'utf8');
  products.push({
    productId: current.productId,
    images: current.images.length,
    colors: current.colors.length,
    sizes: current.sizes.length
  });
}

for (const row of rows) {
  const [
    productId,
    brand,
    title,
    color,
    size,
    price,
    category,
    gender,
    productUrl,
    firstImage,
    _c10,
    _c11,
    sizeTable,
    remark,
    status
  ] = row;

  // 新商品开始
  if (productId) {
    flushCurrent();
    current = {
      productId: String(productId).trim(),
      brand: String(brand).trim(),
      title: String(title).trim(),
      price: price,
      category: String(category).trim(),
      gender: String(gender).trim(),
      productUrl: String(productUrl).trim(),
      sizeTable: String(sizeTable).trim(),
      status: String(status).trim(),
      images: [],
      colors: [],
      sizes: []
    };
  }

  if (!current) {
    continue; // 跳过前导空行
  }

  // 颜色/尺码累积
  if (color) current.colors.push(String(color).trim());
  if (size) current.sizes.push(String(size).trim());

  // 图片 URL 累积：扫描当前行所有 http 开头的字段
  for (const cell of row) {
    if (typeof cell === 'string' && cell.startsWith('http')) {
      current.images.push(cell.trim());
    }
  }
}

// 最后一条
flushCurrent();

console.log(`已生成 ${products.length} 个任务缓存，输出目录: ${tasksDir}`);
products.slice(0, 5).forEach((p) => {
  console.log(`  ${p.productId} | 图片 ${p.images} | 颜色 ${p.colors} | 尺码 ${p.sizes}`);
});
if (products.length > 5) {
  console.log('  ...');
}

console.log('完成。随后可使用:');
console.log('  node scripts/publish.js --product <ID> --from 1 --to 13 --verbose');
