import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private static instance: Logger;
  private level: LogLevel = 'info';

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) Logger.instance = new Logger();
    return Logger.instance;
  }

  setLevel(level: LogLevel) { this.level = level; }

  debug(msg: string) { if (this.level === 'debug') console.log(chalk.gray('[DEBUG] ' + msg)); }
  info(msg: string) { if (this.level !== 'error') console.log(chalk.blue('[INFO] ') + msg); }
  success(msg: string) { console.log(chalk.green('[SUCCESS] ') + msg); }
  error(msg: string) { console.error(chalk.red('[ERROR] ') + msg); }
  agent(name: string, msg: string) { console.log(chalk.magenta(`[${name}]`) + ' ' + msg); }
}

export const logger = Logger.getInstance();
