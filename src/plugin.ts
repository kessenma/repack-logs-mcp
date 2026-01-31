import fs from 'node:fs';
import path from 'node:path';
import type { Compiler, Stats } from '@rspack/core';
import type { LogEntry, LogType } from './types.js';

export interface RepackLogsPluginOptions {
  /**
   * Path to the log file. Defaults to '.repack-logs.json' in the project root.
   */
  outputPath?: string;
  /**
   * Whether to clear the log file on each build start. Defaults to true.
   */
  clearOnStart?: boolean;
}

/**
 * Rspack/Webpack plugin that writes build logs to a JSON file
 * for consumption by the repack-logs-mcp server.
 */
export class RepackLogsPlugin {
  private outputPath: string;
  private clearOnStart: boolean;

  constructor(options: RepackLogsPluginOptions = {}) {
    this.outputPath = options.outputPath ?? '.repack-logs.json';
    this.clearOnStart = options.clearOnStart ?? true;
  }

  apply(compiler: Compiler): void {
    const pluginName = 'RepackLogsPlugin';

    // Ensure output directory exists
    const outputDir = path.dirname(this.outputPath);
    if (outputDir && outputDir !== '.') {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Clear log file on build start
    if (this.clearOnStart) {
      compiler.hooks.beforeCompile.tap(pluginName, () => {
        fs.writeFileSync(this.outputPath, '');
        this.writeLog({
          type: 'info',
          message: 'Starting Re.Pack bundler...',
          issuer: 'repack',
        });
      });
    }

    // Log compilation progress
    compiler.hooks.compilation.tap(pluginName, (compilation) => {
      this.writeLog({
        type: 'progress',
        message: 'Compilation started',
        issuer: 'webpack',
      });
    });

    // Log warnings and errors
    compiler.hooks.done.tap(pluginName, (stats: Stats) => {
      const info = stats.toJson({
        errors: true,
        warnings: true,
        timings: true,
      });

      // Log warnings
      if (info.warnings) {
        for (const warning of info.warnings) {
          this.writeLog({
            type: 'warn',
            message: typeof warning === 'string' ? warning : warning.message,
            file: typeof warning === 'object' ? warning.moduleName : undefined,
            issuer: 'webpack',
          });
        }
      }

      // Log errors
      if (info.errors) {
        for (const error of info.errors) {
          this.writeLog({
            type: 'error',
            message: typeof error === 'string' ? error : error.message,
            file: typeof error === 'object' ? error.moduleName : undefined,
            stack: typeof error === 'object' ? error.stack : undefined,
            issuer: 'webpack',
          });
        }
      }

      // Log completion
      const hasErrors = info.errors && info.errors.length > 0;
      this.writeLog({
        type: hasErrors ? 'error' : 'success',
        message: hasErrors
          ? `Compilation failed with ${info.errors?.length} error(s)`
          : `Compilation finished in ${info.time}ms`,
        duration: info.time,
        issuer: 'repack',
      });
    });

    // Log watch mode rebuilds
    compiler.hooks.invalid.tap(pluginName, (fileName) => {
      this.writeLog({
        type: 'info',
        message: `File changed: ${fileName || 'unknown'}`,
        file: fileName || undefined,
        issuer: 'watcher',
      });
    });
  }

  private writeLog(entry: Omit<LogEntry, 'timestamp'>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    } as LogEntry;

    try {
      fs.appendFileSync(this.outputPath, JSON.stringify(logEntry) + '\n');
    } catch (err) {
      console.error('[RepackLogsPlugin] Failed to write log:', err);
    }
  }
}

export default RepackLogsPlugin;
