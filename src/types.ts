/**
 * Log entry structure from Re.Pack's JSON log output.
 * Re.Pack outputs JSON lines with webpack compilation info.
 */
export interface LogEntry {
  timestamp: string;
  type: LogType;
  issuer?: string;
  message: string;
  /** Module request path */
  request?: string;
  /** File path being processed */
  file?: string;
  /** Webpack loader info */
  loader?: string;
  /** Error stack trace */
  stack?: string;
  /** Build duration in ms */
  duration?: number;
  /** Additional metadata */
  [key: string]: unknown;
}

export type LogType =
  | 'info'
  | 'warn'
  | 'error'
  | 'debug'
  | 'success'
  | 'progress';

export interface LogFilter {
  /** Filter by log type(s) */
  types?: LogType[];
  /** Maximum number of logs to return */
  limit?: number;
  /** Only logs after this timestamp (ISO string) */
  since?: string;
  /** Filter by issuer/source */
  issuer?: string;
  /** Search in message content */
  search?: string;
}

export interface WatcherStatus {
  watching: boolean;
  filePath: string;
  fileExists: boolean;
  logCount: number;
  errorCount: number;
  warningCount: number;
  lastUpdate: string | null;
}
