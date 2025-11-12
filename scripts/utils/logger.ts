import fs from 'fs';
import path from 'path';
import { StepLogger } from '../types';

export function createStepLogger(productId: string, stepName: string): StepLogger {
  const logDir = path.join(process.cwd(), 'logs', productId);

  // 确保日志目录存在
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const today = new Date().toISOString().replace(/-/g, '').split('T')[0];
  const logFileName = `${today}.step-${stepName}.log`;
  const logFilePath = path.join(logDir, logFileName);

  const writeLog = (level: string, message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    const logLine = `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}\n`;

    // 写入文件
    fs.appendFileSync(logFilePath, logLine, 'utf8');

    // 同时输出到控制台
    const colorCode = level === 'ERROR' ? '\x1b[31m' : level === 'SUCCESS' ? '\x1b[32m' : '\x1b[36m';
    const reset = '\x1b[0m';
    console.log(`${colorCode}[Step ${stepName}]${reset} ${message}`);
  };

  return {
    info(message: string, meta?: any) {
      writeLog('info', message, meta);
    },
    error(message: string, meta?: any) {
      writeLog('error', message, meta);
    },
    success(message: string, meta?: any) {
      writeLog('success', message, meta);
    }
  };
}