#!/usr/bin/env node
/**
 * Step5 测试脚本（自动设置开发环境）
 */

// 强制设置开发环境
process.env.NODE_ENV = 'development';

// 设置命令行参数
process.argv = [
  process.argv[0],
  process.argv[1],
  '--product=C25233113',
  '--from=4',
  '--to=5',
  '--verbose'
];

// 运行 publish.js
require('./scripts/publish.js');
