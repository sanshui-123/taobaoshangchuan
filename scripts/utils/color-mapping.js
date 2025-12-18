const COLOR_MAPPING_JP_TO_CN = Object.freeze({
  'ライトイエロー': '浅黄色',
  'レオパード': '豹纹',
  'ブラック×グレー': '黑色×灰色',
  'グレー×ブラック': '灰色×黑色',
  'ピンク×ホワイト': '粉色×白色',
  'ホワイト×ブラウン': '白色×棕色',
  'ブラウン×レオパード': '棕色×豹纹',
  'ネイビー×アイボリー': '藏青色×象牙白',
  'グレイッシュネイビー': '灰藏青',
  'キャメル': '驼色',
  'テラコッタ': '陶土色',
  'ホワイト×ゴールド': '白色×金色',
  'ライトパープル': '浅紫色',
  'パープル×イエロー': '紫色×黄色',
  'イエロー×パープル': '黄色×紫色',
  'キャロット': '胡萝卜色',
  'ミルク': '奶白色',
  'パンプキン': '南瓜色',
  'パンプキン×カーキ': '南瓜色×卡其色',
  'ヘザーグレー': '麻灰色',
  'ダークベージュ': '深米色',
  'ベージュ×カーキ': '米色×卡其色',
  'アッシュグレー': '烟灰色',
  'アッシュグレー×グレー': '烟灰色×灰色',
  'インディゴ': '靛蓝色',
  'グレープ': '葡萄紫',
  'マスタード': '芥末黄',
  'モスグレー×ダークグレー': '苔藓灰×深灰色',
  'レッド×イエロー': '红色×黄色',
  'ワイン': '酒红色',
  'スモークブルー': '烟蓝色',
  'アイアングレー': '铁灰色',
  'オリーブグリーン': '橄榄绿'
});

const normalizeColorKey = (value) => (value || '').toString().trim();

const mapColorKeyToCN = (colorKey) => {
  const key = normalizeColorKey(colorKey);
  if (!key) return colorKey;
  return COLOR_MAPPING_JP_TO_CN[key] || colorKey;
};

const mapColorValueToCN = (colorValue) => {
  if (typeof colorValue === 'string') {
    return mapColorKeyToCN(colorValue);
  }

  if (colorValue && typeof colorValue === 'object') {
    let changed = false;
    const next = { ...colorValue };

    if (typeof next.colorName === 'string') {
      const mapped = mapColorKeyToCN(next.colorName);
      if (mapped !== next.colorName) {
        next.colorName = mapped;
        changed = true;
      }
    }

    if (typeof next.text === 'string') {
      const mapped = mapColorKeyToCN(next.text);
      if (mapped !== next.text) {
        next.text = mapped;
        changed = true;
      }
    }

    return changed ? next : colorValue;
  }

  return colorValue;
};

const mapColorsToCN = (colors) => {
  if (!Array.isArray(colors)) return colors;
  return colors.map(mapColorValueToCN);
};

module.exports = {
  COLOR_MAPPING_JP_TO_CN,
  mapColorKeyToCN,
  mapColorValueToCN,
  mapColorsToCN
};
