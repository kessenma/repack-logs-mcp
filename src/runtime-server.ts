import http from 'node:http';
import type { LogStore } from './log-store.js';
import type { LogEntry, LogType } from './types.js';

export interface RuntimeServerOptions {
  port: number;
  store: LogStore;
}

/**
 * HTTP server that accepts runtime logs from the React Native app.
 * Logs are posted to POST /log with JSON body.
 */
export class RuntimeServer {
  private server: http.Server | null = null;
  private port: number;
  private store: LogStore;

  constructor(options: RuntimeServerOptions) {
    this.port = options.port;
    this.store = options.store;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // CORS headers for React Native
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.method === 'POST' && req.url === '/log') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              this.handleLog(data);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        if (req.method === 'POST' && req.url === '/logs') {
          // Batch endpoint
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (Array.isArray(data.logs)) {
                for (const log of data.logs) {
                  this.handleLog(log);
                }
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, count: data.logs?.length ?? 0 }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        if (req.method === 'GET' && req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', logs: this.store.count }));
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Port in use, try next port
          this.port++;
          this.server?.close();
          this.start().then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        resolve();
      });
    });
  }

  private handleLog(data: {
    type?: string;
    message?: string;
    tag?: string;
    file?: string;
    line?: number;
    data?: unknown;
  }): void {
    const logType = this.parseLogType(data.type);

    const entry = {
      timestamp: new Date().toISOString(),
      type: logType,
      message: data.message ?? String(data),
      issuer: data.tag ?? 'app',
      file: data.file,
      ...(data.line ? { line: data.line } : {}),
      ...(data.data ? { data: data.data } : {}),
    } as LogEntry;

    this.store.add(entry);
  }

  private parseLogType(type?: string): LogType {
    switch (type?.toLowerCase()) {
      case 'error':
        return 'error';
      case 'warn':
      case 'warning':
        return 'warn';
      case 'debug':
        return 'debug';
      case 'success':
        return 'success';
      default:
        return 'info';
    }
  }

  get activePort(): number {
    return this.port;
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
