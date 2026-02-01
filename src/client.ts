/**
 * Client-side logger for React Native apps.
 * Sends logs to the repack-logs-mcp server for debugging with AI assistants.
 *
 * EASY SETUP - Just call enableConsoleCapture() once at app startup:
 *   import { enableConsoleCapture } from 'repack-logs-mcp/client';
 *   enableConsoleCapture(); // All console.log/warn/error now sent to MCP
 *
 * MANUAL USAGE - For tagged loggers:
 *   import { createLogger } from 'repack-logs-mcp/client';
 *   const log = createLogger('MyComponent');
 *   log.info('Hello world');
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

// Store original console methods
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
  info: console.info,
};

let consoleCapureEnabled = false;

export interface ConsoleCaptureOptions {
  /** Server URL (default: http://localhost:9090) */
  serverUrl?: string;
  /** Whether capture is enabled (default: __DEV__ if available, otherwise true) */
  enabled?: boolean;
  /** Tag patterns to capture (regex). If not set, captures all. */
  includePatterns?: RegExp[];
  /** Tag patterns to exclude (regex). */
  excludePatterns?: RegExp[];
}

/**
 * Enable automatic capture of all console.log/warn/error calls.
 * Call this once at app startup (e.g., in index.js or App.tsx).
 *
 * @example
 * // In your app's entry point:
 * import { enableConsoleCapture } from 'repack-logs-mcp/client';
 * enableConsoleCapture();
 *
 * // Now all console.log calls are automatically sent to MCP:
 * console.log('[MyComponent] Hello world'); // Sent to MCP with tag "MyComponent"
 * console.error('Something failed', error); // Sent to MCP with tag "console"
 */
export function enableConsoleCapture(options: ConsoleCaptureOptions = {}): void {
  if (consoleCapureEnabled) {
    return; // Already enabled
  }

  const serverUrl = options.serverUrl ?? globalServerUrl;
  const enabled = options.enabled ?? globalEnabled;
  const includePatterns = options.includePatterns;
  const excludePatterns = options.excludePatterns;

  if (!enabled) {
    return;
  }

  const createInterceptor = (
    type: 'info' | 'warn' | 'error' | 'debug',
    original: (...args: unknown[]) => void
  ) => {
    return (...args: unknown[]) => {
      // Always call original console method
      original.apply(console, args);

      // Extract tag from message if it matches [Tag] pattern
      let tag = 'console';
      let message = args.map(arg => formatArg(arg)).join(' ');
      let data: unknown = undefined;

      // Check for [Tag] pattern at start of first argument
      if (typeof args[0] === 'string') {
        const tagMatch = args[0].match(/^\[([^\]]+)\]/);
        if (tagMatch) {
          tag = tagMatch[1];
        }
      }

      // If there are multiple args, treat extras as data
      if (args.length > 1) {
        const firstArg = args[0];
        if (typeof firstArg === 'string') {
          message = firstArg;
          data = args.length === 2 ? args[1] : args.slice(1);
        }
      }

      // Check include/exclude patterns
      if (includePatterns && includePatterns.length > 0) {
        const matches = includePatterns.some(p => p.test(tag) || p.test(message));
        if (!matches) return;
      }
      if (excludePatterns && excludePatterns.length > 0) {
        const excluded = excludePatterns.some(p => p.test(tag) || p.test(message));
        if (excluded) return;
      }

      // Send to MCP server
      const entry: LogEntry = {
        type,
        message,
        tag,
        timestamp: new Date().toISOString(),
        ...(data !== undefined && { data: serializeData(data) }),
      };

      logBuffer.push(entry);
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushLogs(serverUrl);
        }, batchInterval);
      }
    };
  };

  // Monkey-patch console methods
  console.log = createInterceptor('info', originalConsole.log);
  console.info = createInterceptor('info', originalConsole.info);
  console.warn = createInterceptor('warn', originalConsole.warn);
  console.error = createInterceptor('error', originalConsole.error);
  console.debug = createInterceptor('debug', originalConsole.debug);

  consoleCapureEnabled = true;
}

/**
 * Disable console capture and restore original console methods.
 */
export function disableConsoleCapture(): void {
  if (!consoleCapureEnabled) return;

  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;

  consoleCapureEnabled = false;
}

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export default createLogger;
