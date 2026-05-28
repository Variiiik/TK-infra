import winston from 'winston';
import path from 'path';
import os from 'os';

// Safe log dir — app.getPath() throws before app.isReady(), use homedir fallback
function getLogDir(): string {
  try {
    // Only works after app is ready
    const { app } = require('electron');
    if (app.isReady()) return app.getPath('logs');
  } catch {}
  return path.join(os.homedir(), 'AppData', 'Roaming', 'TakeControl Agent', 'logs');
}

export class AgentLogger {
  private logger: winston.Logger;
  private logDir: string;

  constructor() {
    this.logDir = getLogDir();

    // Ensure log dir exists
    try {
      require('fs').mkdirSync(this.logDir, { recursive: true });
    } catch {}

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
        new winston.transports.File({
          filename: path.join(this.logDir, 'agent.log'),
          maxsize: 10 * 1024 * 1024,
          maxFiles: 3,
        }),
      ],
    });
  }

  getLogPath(): string {
    return path.join(this.logDir, 'agent.log');
  }

  info(msg: string, meta?: object): void {
    this.logger.info(msg, meta);
  }

  warn(msg: string, meta?: object): void {
    this.logger.warn(msg, meta);
  }

  error(msg: string, error?: unknown): void {
    this.logger.error(msg, { error: error instanceof Error ? error.message : String(error) });
  }

  // winston compatible interface for electron-updater
  debug(msg: string): void { this.logger.debug(msg); }
  transports = { file: { level: 'info' } };
}
