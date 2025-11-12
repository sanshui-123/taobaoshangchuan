#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
商品内容翻译脚本 v2.0
支持中英文互译，优化商品描述
"""

import json
import sys
import subprocess
import os

def translate_text(text, source_lang='zh', target_lang='ja'):
    """
    调用翻译API翻译文本
    这里使用占位符，实际应集成真实的翻译API
    """
    # 占位符翻译逻辑
    translations = {
        'zh_to_ja': {
            '男士高尔夫球服': 'メンズゴルフウェア',
            '女士高尔夫球裙': 'レディースゴルフスカート',
            '速干透气': '速乾性・通気性',
            '防紫外线': '紫外線防止',
            '弹性面料': '伸縮性素材',
            '专业设计': 'プロフェッショナルデザイン',
            '舒适': '快適',
            '高品质': '高品質',
            '新款': '新作',
            '夏季新款': '夏の新作'
        },
        'ja_to_zh': {
            'メンズゴルフウェア': '男士高尔夫球服',
            'レディースゴルフスカート': '女士高尔夫球裙',
            '速乾性・通気性': '速干透气',
            '紫外線防止': '防紫外线',
            '伸縮性素材': '弹性面料',
            'プロフェッショナルデザイン': '专业设计',
            '快適': '舒适',
            '高品質': '高品质',
            '新作': '新款',
            '夏の新作': '夏季新款'
        }
    }

    key = f'{source_lang}_to_{target_lang}'
    translation_map = translations.get(key, {})

    result = text
    for zh, ja in translation_map.items():
        if source_lang == 'zh':
            result = result.replace(zh, ja)
        else:
            result = result.replace(ja, zh)

    return result

def optimize_title(title, target_lang='zh'):
    """
    优化标题，添加营销词
    """
    if target_lang == 'zh':
        marketing_words = ['新款', '热销', '专业', '正品']
    else:
        marketing_words = ['新作', '人気', 'プロ', '正規品']

    # 简单优化：在前面添加营销词
    return f"{marketing_words[0]}{title}"

def optimize_description(desc, target_lang='zh'):
    """
    优化商品描述
    """
    if target_lang == 'zh':
        features = ['【产品特点】', '【材质说明】', '【适用场景】']
    else:
        features = ['【製品特徴】', '【素材説明】', '【使用シーン】']

    # 添加结构化描述
    optimized = f"{features[0]}\n{desc}"

    # 如果描述太短，添加默认内容
    if len(desc) < 50:
        if target_lang == 'zh':
            optimized += "\n\n• 优质面料，舒适透气\n• 专业版型，运动自如\n• 时尚设计，彰显品味"
        else:
            optimized += "\n\n• 高品質な生地、快適で通気性\n• プロフェッショナルなフィット、自由な動き\n• 时尚なデザイン、趣味を引き立てる"

    return optimized

def main():
    """
    主函数：处理命令行输入
    """
    if len(sys.argv) < 4:
        print(json.dumps({
            "error": "Usage: python translator_v2.py <source_lang> <target_lang> <text>",
            "example": "python translator_v2.py zh ja '男士高尔夫球服'"
        }, ensure_ascii=False))
        sys.exit(1)

    source_lang = sys.argv[1]
    target_lang = sys.argv[2]
    text = sys.argv[3]
    task_type = sys.argv[4] if len(sys.argv) > 4 else 'translate'

    try:
        if task_type == 'title':
            # 标题翻译+优化
            translated = translate_text(text, source_lang, target_lang)
            optimized = optimize_title(translated, target_lang)
        elif task_type == 'description':
            # 描述翻译+优化
            translated = translate_text(text, source_lang, target_lang)
            optimized = optimize_description(translated, target_lang)
        else:
            # 普通翻译
            optimized = translate_text(text, source_lang, target_lang)

        # 长度校验
        if len(optimized) > 1000:
            optimized = optimized[:1000] + '...'

        result = {
            "success": True,
            "original": text,
            "translated": optimized,
            "length": len(optimized),
            "source_lang": source_lang,
            "target_lang": target_lang,
            "task_type": task_type
        }

        print(json.dumps(result, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }, ensure_ascii=False))
        sys.exit(1)

if __name__ == '__main__':
    main()