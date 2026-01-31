import { resolve } from 'path';

export interface Config {
  logFilePath: string;
  maxLogs: number;
  runtimePort: number;
}

const DEFAULT_LOG_FILE = '.repack-logs.json';
const DEFAULT_MAX_LOGS = 1000;
const DEFAULT_RUNTIME_PORT = 9090;

/**
 * Parse configuration from CLI args and environment variables.
 *
 * Priority:
 * 1. CLI argument (first positional arg)
 * 2. REPACK_LOG_FILE environment variable
 * 3. Default: .repack-logs.json in current directory
 */
export function getConfig(): Config {
  const args = process.argv.slice(2);

  // First positional argument is the log file path
  const cliPath = args.find(arg => !arg.startsWith('-'));

  const logFilePath = cliPath
    ?? process.env.REPACK_LOG_FILE
    ?? DEFAULT_LOG_FILE;

  const maxLogs = process.env.REPACK_MAX_LOGS
    ? parseInt(process.env.REPACK_MAX_LOGS, 10)
    : DEFAULT_MAX_LOGS;

  const runtimePort = process.env.REPACK_RUNTIME_PORT
    ? parseInt(process.env.REPACK_RUNTIME_PORT, 10)
    : DEFAULT_RUNTIME_PORT;

  return {
    logFilePath: resolve(logFilePath),
    maxLogs,
    runtimePort,
  };
}
