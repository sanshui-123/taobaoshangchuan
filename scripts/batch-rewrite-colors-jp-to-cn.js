require('./config');
const { feishuClient } = require('./feishu/client');
const { COLOR_MAPPING_JP_TO_CN } = require('./utils/color-mapping');

const parseArgs = (argv) => {
  const args = argv.slice(2);
  const hasFlag = (flag) => args.includes(flag);

  const getArgValue = (flag) => {
    const exactIdx = args.indexOf(flag);
    if (exactIdx >= 0 && args[exactIdx + 1] && !args[exactIdx + 1].startsWith('-')) {
      return args[exactIdx + 1];
    }
    const withEq = args.find(a => a.startsWith(`${flag}=`));
    if (withEq) return withEq.split('=').slice(1).join('=');
    return null;
  };

  return {
    help: hasFlag('--help') || hasFlag('-h'),
    apply: hasFlag('--apply'),
    limit: Number.parseInt(getArgValue('--limit') || '', 10) || 0
  };
};

async function fetchAllFeishuRecordsUnfiltered(pageSize = 500) {
  const all = [];
  let pageToken = null;
  let hasMore = true;
  while (hasMore) {
    const resp = await feishuClient.getRecords(pageSize, [], pageToken);
    all.push(...(resp.records || resp.items || []));
    hasMore = !!resp.has_more;
    pageToken = resp.page_token || null;
  }
  return all;
}

function mapLinePreserveWhitespace(line) {
  if (typeof line !== 'string') return { value: line, changed: false };

  const leading = (line.match(/^\s*/) || [''])[0];
  const trailing = (line.match(/\s*$/) || [''])[0];
  const key = line.trim();

  const mapped = COLOR_MAPPING_JP_TO_CN[key];
  if (!mapped) return { value: line, changed: false };

  return { value: `${leading}${mapped}${trailing}`, changed: true };
}

function rewriteColorFieldValue(value) {
  if (typeof value === 'string') {
    const parts = value.split('\n');
    let hitCount = 0;
    const nextParts = parts.map(part => {
      const mapped = mapLinePreserveWhitespace(part);
      if (mapped.changed) hitCount += 1;
      return mapped.value;
    });
    const nextValue = nextParts.join('\n');
    return {
      nextValue,
      changed: nextValue !== value,
      hitCount,
      skipped: false
    };
  }

  if (Array.isArray(value)) {
    const allStrings = value.every(v => typeof v === 'string');
    if (!allStrings) {
      return { nextValue: value, changed: false, hitCount: 0, skipped: true };
    }

    let hitCount = 0;
    const nextValue = value.map(v => {
      const mapped = mapLinePreserveWhitespace(v);
      if (mapped.changed) hitCount += 1;
      return mapped.value;
    });

    return {
      nextValue,
      changed: hitCount > 0,
      hitCount,
      skipped: false
    };
  }

  return { nextValue: value, changed: false, hitCount: 0, skipped: true };
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function printUsage() {
  console.log('Usage:');
  console.log('  NODE_ENV=production node scripts/batch-rewrite-colors-jp-to-cn.js [--apply] [--limit N]');
  console.log('');
  console.log('Options:');
  console.log('  --apply     Write updates to Feishu (default: dry-run)');
  console.log('  --limit N   Only process first N changed records (default: 0 = no limit)');
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const colorField = process.env.FEISHU_COLOR_FIELD || '颜色';
  const productIdField = process.env.FEISHU_PRODUCT_ID_FIELD || '商品ID';

  console.log(`[colors] Field: ${colorField}`);
  console.log(`[colors] Mode: ${options.apply ? 'APPLY' : 'DRY-RUN'}`);
  if (options.limit) console.log(`[colors] Limit: ${options.limit}`);

  const records = await fetchAllFeishuRecordsUnfiltered(500);
  console.log(`[colors] Records scanned: ${records.length}`);

  const updates = [];
  let totalHitCount = 0;
  let skippedTypeCount = 0;

  for (const record of records) {
    const fields = record.fields || {};
    const current = fields[colorField];
    if (current === undefined || current === null || current === '') continue;

    const rewritten = rewriteColorFieldValue(current);
    if (rewritten.skipped) {
      skippedTypeCount += 1;
      continue;
    }
    if (!rewritten.changed) continue;

    totalHitCount += rewritten.hitCount;
    updates.push({
      record_id: record.record_id,
      fields: {
        [colorField]: rewritten.nextValue
      },
      _productId: fields[productIdField]
    });

    if (options.limit && updates.length >= options.limit) break;
  }

  console.log(`[colors] Records to update: ${updates.length}`);
  console.log(`[colors] Total replacements: ${totalHitCount}`);
  if (skippedTypeCount) console.log(`[colors] Skipped (unsupported type): ${skippedTypeCount}`);

  if (!options.apply) {
    if (updates.length > 0) {
      console.log('[colors] Dry-run sample (first 10):');
      updates.slice(0, 10).forEach((u, idx) => {
        const pid = Array.isArray(u._productId) ? u._productId[0] : u._productId;
        console.log(`  ${idx + 1}. record_id=${u.record_id} productId=${pid || ''}`);
      });
      console.log('[colors] Run with --apply to write changes.');
    }
    return;
  }

  if (updates.length === 0) {
    console.log('[colors] No changes needed.');
    return;
  }

  const MAX_BATCH_SIZE = 500;
  const chunks = chunkArray(updates, MAX_BATCH_SIZE).map(chunk => (
    chunk.map(({ record_id, fields }) => ({ record_id, fields }))
  ));

  let updatedCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await feishuClient.batchUpdateRecords(chunk);
    updatedCount += chunk.length;
    console.log(`[colors] Updated batch ${i + 1}/${chunks.length}: ${chunk.length} records`);
  }

  console.log(`[colors] Done. Updated records: ${updatedCount}`);
}

main().catch((error) => {
  console.error('[colors] Failed:', error.message);
  process.exit(1);
});

