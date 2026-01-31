import { watch, type FSWatcher } from 'chokidar';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import type { LogEntry } from './types.js';
import { LogStore } from './log-store.js';

/**
 * Watches a Re.Pack log file and streams entries to a LogStore.
 */
export class LogWatcher {
  private filePath: string;
  private store: LogStore;
  private watcher: FSWatcher | null = null;
  private lastPosition: number = 0;
  private watching: boolean = false;

  constructor(filePath: string, store: LogStore) {
    this.filePath = filePath;
    this.store = store;
  }

  /**
   * Start watching the log file.
   */
  async start(): Promise<void> {
    if (this.watching) return;

    // Read existing content first
    await this.readNewContent();

    // Watch for changes
    this.watcher = watch(this.filePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('change', async () => {
      await this.readNewContent();
    });

    this.watcher.on('add', async () => {
      // File was created, reset position and read
      this.lastPosition = 0;
      await this.readNewContent();
    });

    this.watcher.on('unlink', () => {
      // File was deleted, reset position
      this.lastPosition = 0;
    });

    this.watching = true;
  }

  /**
   * Stop watching the log file.
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.watching = false;
  }

  /**
   * Read new content from the log file since last position.
   */
  private async readNewContent(): Promise<void> {
    if (!existsSync(this.filePath)) {
      return;
    }

    try {
      const stats = await stat(this.filePath);

      // If file was truncated, reset position
      if (stats.size < this.lastPosition) {
        this.lastPosition = 0;
      }

      // Read only new content
      const content = await readFile(this.filePath, 'utf-8');
      const newContent = content.slice(this.lastPosition);

      if (newContent.length === 0) return;

      // Update position
      this.lastPosition = content.length;

      // Parse JSON lines
      const lines = newContent.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const entry = this.parseLine(line);
          if (entry) {
            this.store.add(entry);
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // File might not exist yet or be inaccessible
    }
  }

  /**
   * Parse a single log line into a LogEntry.
   */
  private parseLine(line: string): LogEntry | null {
    try {
      const parsed = JSON.parse(line);

      // Ensure required fields exist
      if (!parsed.message && !parsed.msg) {
        return null;
      }

      return {
        timestamp: parsed.timestamp ?? parsed.time ?? new Date().toISOString(),
        type: this.normalizeType(parsed.type ?? parsed.level ?? 'info'),
        message: parsed.message ?? parsed.msg ?? '',
        issuer: parsed.issuer ?? parsed.source ?? parsed.name,
        request: parsed.request,
        file: parsed.file ?? parsed.filename,
        loader: parsed.loader,
        stack: parsed.stack,
        duration: parsed.duration,
        ...parsed,
      };
    } catch {
      return null;
    }
  }

  /**
   * Normalize various log level formats to our LogType.
   */
  private normalizeType(type: string): LogEntry['type'] {
    const normalized = type.toLowerCase();

    if (normalized.includes('error') || normalized === 'err') {
      return 'error';
    }
    if (normalized.includes('warn')) {
      return 'warn';
    }
    if (normalized.includes('debug') || normalized === 'trace') {
      return 'debug';
    }
    if (normalized.includes('success') || normalized === 'done') {
      return 'success';
    }
    if (normalized.includes('progress')) {
      return 'progress';
    }
    return 'info';
  }

  /**
   * Check if the watcher is currently active.
   */
  get isWatching(): boolean {
    return this.watching;
  }

  /**
   * Check if the log file exists.
   */
  get fileExists(): boolean {
    return existsSync(this.filePath);
  }

  /**
   * Get the path being watched.
   */
  get path(): string {
    return this.filePath;
  }
}
