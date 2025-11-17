/**
 * 服装分类判断工具
 * 根据商品数据判断细分类型
 */

/**
 * 判断服装类型
 * @param {Object} productData - 商品数据
 * @param {string} productData.title - 商品标题
 * @param {string} [productData.productName] - 产品名称
 * @param {string} [productData.description] - 描述
 * @param {string} [productData.category] - 类别
 * @param {string} [productData.productUrl] - 产品URL
 * @returns {string} 细分类型
 */
function determine_clothing_type(productData) {
  const { title = '', productName = '', description = '', category = '', productUrl = '' } = productData;

  // 合并所有文本用于匹配
  const allText = `${title} ${productName} ${description} ${category} ${productUrl}`.toLowerCase();

  // 定义关键词匹配规则（按优先级排序）
  const typeRules = [
    // 上衣类
    { keywords: ['polo', 'ポロシャツ'], type: 'Polo衫' },
    { keywords: ['t恤', 'tシャツ', 't-shirt', 'tee'], type: 'T恤' },
    { keywords: ['卫衣', 'スウェット', 'hoodie', 'sweatshirt'], type: '卫衣' },
    { keywords: ['夹克', 'ジャケット', 'jacket'], type: '夹克' },
    { keywords: ['风衣', 'ウインドブレーカー', 'windbreaker'], type: '风衣' },
    { keywords: ['羽绒', 'ダウン', 'down'], type: '羽绒服' },
    { keywords: ['雨衣', 'レインウェア', 'rainwear'], type: '雨衣' },
    { keywords: ['马甲', 'ベスト', 'vest'], type: '马甲' },
    { keywords: ['背心', 'タンクトップ', 'tank'], type: '背心上衣' },
    { keywords: ['毛衣', 'セーター', 'sweater', 'knit'], type: '毛衣' },
    { keywords: ['衬衫', 'シャツ', 'shirt'], type: '衬衫' },
    { keywords: ['打底', 'インナー', 'inner'], type: '打底衣' },

    // 下装类
    { keywords: ['短裤', 'ショートパンツ', 'shorts'], type: '短裤' },
    { keywords: ['长裤', 'ロングパンツ', 'pants', 'trousers'], type: '长裤' },
    { keywords: ['雨裤', 'レインパンツ', 'rain pants'], type: '雨裤' },
    { keywords: ['裙', 'スカート', 'skirt'], type: '裙子' },

    // 配件类
    { keywords: ['袜子', 'ソックス', 'socks'], type: '袜子' },
    { keywords: ['高筒袜', 'ハイソックス'], type: '高筒袜' },
    { keywords: ['长袜', 'ロングソックス'], type: '长袜' },
    { keywords: ['短袜', 'ショートソックス'], type: '短袜' },
    { keywords: ['腰带', 'ベルト', 'belt'], type: '腰带' },
    { keywords: ['手套', 'グローブ', 'glove'], type: '手套' },
    { keywords: ['鸭舌帽', 'キャップ', 'cap'], type: '鸭舌帽' },
    { keywords: ['帽子', 'ハット', 'hat'], type: '帽子' },
    { keywords: ['毛巾', 'タオル', 'towel'], type: '毛巾' },
    { keywords: ['围巾', 'マフラー', 'scarf'], type: '围巾' },
    { keywords: ['护臂', 'アームカバー', 'arm cover'], type: '护臂套' },

    // 鞋类
    { keywords: ['钉鞋', 'スパイク', 'spike'], type: '钉鞋' },
    { keywords: ['软钉', 'ソフトスパイク'], type: '软钉鞋' },
    { keywords: ['无钉', 'スパイクレス'], type: '无钉鞋' },
    { keywords: ['高尔夫鞋', 'ゴルフシューズ', 'golf shoes'], type: '高尔夫鞋' },
    { keywords: ['鞋', 'シューズ', 'shoes'], type: '鞋类' },
  ];

  // 遍历规则，找到第一个匹配的类型
  for (const rule of typeRules) {
    for (const keyword of rule.keywords) {
      if (allText.includes(keyword)) {
        return rule.type;
      }
    }
  }

  // 如果没有匹配到，尝试根据URL路径判断
  if (productUrl) {
    if (productUrl.includes('/tops/')) return '上衣';
    if (productUrl.includes('/bottoms/')) return '下装';
    if (productUrl.includes('/outerwear/')) return '外套';
    if (productUrl.includes('/accessories/')) return '配件';
  }

  // 默认返回"其他"
  return '其他';
}

module.exports = {
  determine_clothing_type
};
