import type { LogEntry, LogFilter, LogType } from './types.js';

/**
 * In-memory circular buffer for storing log entries.
 */
export class LogStore {
  private logs: LogEntry[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Add a log entry to the store.
   * Removes oldest entries if buffer is full.
   */
  add(entry: LogEntry): void {
    this.logs.push(entry);

    // Trim if over max size
    if (this.logs.length > this.maxSize) {
      this.logs = this.logs.slice(-this.maxSize);
    }
  }

  /**
   * Add multiple log entries at once.
   */
  addMany(entries: LogEntry[]): void {
    for (const entry of entries) {
      this.add(entry);
    }
  }

  /**
   * Get logs with optional filtering.
   */
  get(filter?: LogFilter): LogEntry[] {
    let result = [...this.logs];

    if (filter?.types && filter.types.length > 0) {
      result = result.filter(log => filter.types!.includes(log.type));
    }

    if (filter?.since) {
      const sinceDate = new Date(filter.since);
      result = result.filter(log => new Date(log.timestamp) >= sinceDate);
    }

    if (filter?.issuer) {
      const issuerLower = filter.issuer.toLowerCase();
      result = result.filter(log =>
        log.issuer?.toLowerCase().includes(issuerLower)
      );
    }

    if (filter?.search) {
      const searchLower = filter.search.toLowerCase();
      result = result.filter(log =>
        log.message.toLowerCase().includes(searchLower) ||
        log.file?.toLowerCase().includes(searchLower) ||
        log.request?.toLowerCase().includes(searchLower)
      );
    }

    if (filter?.limit && filter.limit > 0) {
      // Return most recent logs
      result = result.slice(-filter.limit);
    }

    return result;
  }

  /**
   * Get only errors and warnings.
   */
  getErrors(limit?: number): LogEntry[] {
    return this.get({
      types: ['error', 'warn'],
      limit,
    });
  }

  /**
   * Count logs by type.
   */
  countByType(type: LogType): number {
    return this.logs.filter(log => log.type === type).length;
  }

  /**
   * Get total log count.
   */
  get count(): number {
    return this.logs.length;
  }

  /**
   * Get the timestamp of the most recent log.
   */
  get lastTimestamp(): string | null {
    if (this.logs.length === 0) return null;
    return this.logs[this.logs.length - 1].timestamp;
  }

  /**
   * Clear all logs from the store.
   */
  clear(): void {
    this.logs = [];
  }
}
