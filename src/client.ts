/**
 * Client-side logger for React Native apps.
 * Sends logs to the repack-logs-mcp server for debugging with AI assistants.
 *
 * Usage:
 *   import { createLogger } from 'repack-logs-mcp/client';
 *   const log = createLogger('MyComponent');
 *   log.info('Hello world');
 *   log.error('Something failed', { details: error });
 */

export interface LoggerOptions {
  /** Server URL (default: http://localhost:9090) */
  serverUrl?: string;
  /** Whether to also call console.log (default: true) */
  passthrough?: boolean;
  /** Batch logs and send periodically (default: true) */
  batched?: boolean;
  /** Batch interval in ms (default: 1000) */
  batchInterval?: number;
  /** Whether logging is enabled (default: __DEV__ or true) */
  enabled?: boolean;
}

export interface LogEntry {
  type: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  tag: string;
  timestamp: string;
  data?: unknown;
  file?: string;
  line?: number;
}

interface Logger {
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  debug: (message: string, data?: unknown) => void;
  log: (message: string, data?: unknown) => void;
  flush: () => Promise<void>;
}

let globalServerUrl = 'http://localhost:9090';
let globalEnabled = true;
let globalPassthrough = true;
let logBuffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let batchInterval = 1000;

/**
 * Configure the global logger settings.
 */
export function configure(options: LoggerOptions): void {
  if (options.serverUrl) globalServerUrl = options.serverUrl;
  if (options.enabled !== undefined) globalEnabled = options.enabled;
  if (options.passthrough !== undefined) globalPassthrough = options.passthrough;
  if (options.batchInterval) batchInterval = options.batchInterval;
}

/**
 * Create a tagged logger instance.
 */
export function createLogger(tag: string, options?: LoggerOptions): Logger {
  const serverUrl = options?.serverUrl ?? globalServerUrl;
  const passthrough = options?.passthrough ?? globalPassthrough;
  const enabled = options?.enabled ?? globalEnabled;
  const batched = options?.batched ?? true;

  const sendLog = (entry: LogEntry) => {
    if (!enabled) return;

    if (passthrough) {
      const consoleMethod = entry.type === 'error' ? console.error
        : entry.type === 'warn' ? console.warn
        : entry.type === 'debug' ? console.debug
        : console.log;
      const prefix = `[${entry.tag}]`;
      if (entry.data !== undefined) {
        consoleMethod(prefix, entry.message, entry.data);
      } else {
        consoleMethod(prefix, entry.message);
      }
    }

    if (batched) {
      logBuffer.push(entry);
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushLogs(serverUrl);
        }, batchInterval);
      }
    } else {
      sendSingleLog(serverUrl, entry);
    }
  };

  const createEntry = (type: LogEntry['type'], message: string, data?: unknown): LogEntry => ({
    type,
    message,
    tag,
    timestamp: new Date().toISOString(),
    ...(data !== undefined && { data: serializeData(data) }),
  });

  return {
    info: (message, data) => sendLog(createEntry('info', message, data)),
    warn: (message, data) => sendLog(createEntry('warn', message, data)),
    error: (message, data) => sendLog(createEntry('error', message, data)),
    debug: (message, data) => sendLog(createEntry('debug', message, data)),
    log: (message, data) => sendLog(createEntry('info', message, data)),
    flush: () => flushLogs(serverUrl),
  };
}

function serializeData(data: unknown): unknown {
  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
  }
  try {
    // Test if it's serializable
    JSON.stringify(data);
    return data;
  } catch {
    return String(data);
  }
}

async function sendSingleLog(serverUrl: string, entry: LogEntry): Promise<void> {
  try {
    await fetch(`${serverUrl}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch {
    // Silently fail - don't break the app if logging fails
  }
}

async function flushLogs(serverUrl: string): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (logBuffer.length === 0) return;

  const logs = [...logBuffer];
  logBuffer = [];

  try {
    await fetch(`${serverUrl}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs }),
    });
  } catch {
    // Silently fail - don't break the app if logging fails
  }
}

/**
 * Quick logging functions for one-off use.
 */
export const log = {
  info: (tag: string, message: string, data?: unknown) =>
    createLogger(tag).info(message, data),
  warn: (tag: string, message: string, data?: unknown) =>
    createLogger(tag).warn(message, data),
  error: (tag: string, message: string, data?: unknown) =>
    createLogger(tag).error(message, data),
  debug: (tag: string, message: string, data?: unknown) =>
    createLogger(tag).debug(message, data),
};

export default createLogger;
