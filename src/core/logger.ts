/**
 * Confucius SDK - Console Logger
 * 
 * Simple logger implementation for the SDK.
 * Provides structured logging with timing support.
 */

import type { Logger } from '../sdk/types.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',  // Gray
  info: '\x1b[36m',   // Cyan
  warn: '\x1b[33m',   // Yellow
  error: '\x1b[31m',  // Red
};

const RESET = '\x1b[0m';

export interface LoggerOptions {
  /** Minimum log level to output */
  level?: LogLevel;
  
  /** Whether to use colors */
  colors?: boolean;
  
  /** Whether to include timestamps */
  timestamps?: boolean;
  
  /** Custom prefix for all messages */
  prefix?: string;
}

/**
 * ConsoleLogger - Simple structured logger.
 */
export class ConsoleLogger implements Logger {
  private level: number;
  private colors: boolean;
  private timestamps: boolean;
  private prefix: string;

  constructor(options: LoggerOptions = {}) {
    this.level = LOG_LEVELS[options.level ?? 'info'];
    this.colors = options.colors ?? true;
    this.timestamps = options.timestamps ?? true;
    this.prefix = options.prefix ?? '🔮 Confucius';
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  startTimer(label: string): () => void {
    const start = performance.now();
    return (): void => {
      const duration = performance.now() - start;
      this.debug(`${label} completed`, { durationMs: Math.round(duration) });
    };
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < this.level) {
      return;
    }

    const parts: string[] = [];

    // Timestamp
    if (this.timestamps) {
      const time = new Date().toISOString().slice(11, 23);
      parts.push(`[${time}]`);
    }

    // Prefix
    parts.push(this.prefix);

    // Level
    const levelStr = level.toUpperCase().padEnd(5);
    if (this.colors) {
      parts.push(`${LOG_COLORS[level]}${levelStr}${RESET}`);
    } else {
      parts.push(levelStr);
    }

    // Message
    parts.push(message);

    // Output
    const output = parts.join(' ');
    
    /* eslint-disable no-console */
    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }

    // Meta (if present)
    if (meta !== undefined && Object.keys(meta).length > 0) {
      const metaStr = JSON.stringify(meta, null, 2)
        .split('\n')
        .map(line => '  ' + line)
        .join('\n');
      console.log(metaStr);
    }
    /* eslint-enable no-console */
  }
}

/**
 * Create a logger instance.
 */
export function createLogger(options?: LoggerOptions): Logger {
  return new ConsoleLogger(options);
}
