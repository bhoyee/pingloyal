import * as path from 'path';
import * as fs from 'fs';
import * as winston from 'winston';
import { WinstonModuleOptions } from 'nest-winston';
import { maskPhone } from '@pingloyal/utils';

// ── Phone masking format ───────────────────────────────────────────────────────

export function maskPhonesInString(str: string): string {
  return str.replace(/\+?\d{7,15}/g, (match) => {
    try {
      return maskPhone(match);
    } catch {
      return '****';
    }
  });
}

const phoneMaskFormat = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = maskPhonesInString(info.message);
  }
  if (info.metadata && typeof info.metadata === 'object') {
    try {
      const str = JSON.stringify(info.metadata);
      const masked = maskPhonesInString(str);
      info.metadata = JSON.parse(masked) as unknown;
    } catch {
      // Leave metadata as-is if re-parse fails
    }
  }
  return info;
})();

// ── Config factory ─────────────────────────────────────────────────────────────

export function createWinstonConfig(
  nodeEnv: string,
  logLevel: string,
): WinstonModuleOptions {
  if (nodeEnv === 'production') {
    const logsDir = path.resolve(process.cwd(), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    return {
      level: logLevel,
      format: winston.format.combine(
        phoneMaskFormat,
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
        }),
      ],
    };
  }

  // Development: colorized console
  return {
    level: logLevel,
    format: winston.format.combine(
      phoneMaskFormat,
      winston.format.colorize({ all: true }),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(
        ({ timestamp, level, context, message, requestId }) => {
          const ctx = context ? `[${context as string}]` : '[App]';
          const rid = requestId ? ` rid=${requestId as string}` : '';
          return `[${timestamp as string}] ${level} ${ctx}${rid} ${message as string}`;
        },
      ),
    ),
    transports: [new winston.transports.Console()],
  };
}
