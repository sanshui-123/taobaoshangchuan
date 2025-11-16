const { chromium } = require('playwright');

async function analyzeImageWithOCR() {
  try {
    // 尝试使用系统截图分析功能
    const { execSync } = require('child_process');

    console.log('=== 尝试分析图片内容 ===');

    // 方法1：尝试使用macOS的文本识别
    try {
      const result = execSync(`sips -g all "/Users/sanshui/Desktop/.claude/claude-code-chat-images/image_1763188025047.png"`, { encoding: 'utf8' });
      console.log('图片信息:', result);
    } catch (e) {
      console.log('sips命令失败:', e.message);
    }

    // 方法2：尝试使用系统命令获取图片描述
    try {
      const result = execSync(`mdls "/Users/sanshui/Desktop/.claude/claude-code-chat-images/image_1763188025047.png"`, { encoding: 'utf8' });
      console.log('文件元数据:', result);
    } catch (e) {
      console.log('mdls命令失败:', e.message);
    }

  } catch (error) {
    console.error('分析失败:', error.message);
  }
}

analyzeImageWithOCR();