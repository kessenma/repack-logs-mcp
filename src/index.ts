#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getConfig } from './config.js';
import { LogStore } from './log-store.js';
import { LogWatcher } from './log-watcher.js';
import { RuntimeServer } from './runtime-server.js';
import type { LogType } from './types.js';

const config = getConfig();
const store = new LogStore(config.maxLogs);
const watcher = new LogWatcher(config.logFilePath, store);
const runtimeServer = new RuntimeServer({ port: config.runtimePort, store });

// Create MCP server
const server = new McpServer({
  name: 'repack-logs-mcp',
  version: '1.0.0',
});

// Tool: get_build_logs
server.tool(
  'get_build_logs',
  'Get recent Re.Pack build logs with optional filtering',
  {
    limit: z.number().optional().describe('Maximum number of logs to return (default: 50)'),
    types: z.array(z.enum(['info', 'warn', 'error', 'debug', 'success', 'progress']))
      .optional()
      .describe('Filter by log type(s)'),
    since: z.string().optional().describe('Only logs after this ISO timestamp'),
    issuer: z.string().optional().describe('Filter by issuer/source name'),
    search: z.string().optional().describe('Search in log messages'),
  },
  async (args) => {
    const logs = store.get({
      limit: args.limit ?? 50,
      types: args.types as LogType[] | undefined,
      since: args.since,
      issuer: args.issuer,
      search: args.search,
    });

    if (logs.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No logs found matching the criteria.',
        }],
      };
    }

    const formatted = logs.map(log => {
      const parts = [
        `[${log.timestamp}]`,
        `[${log.type.toUpperCase()}]`,
      ];
      if (log.issuer) parts.push(`[${log.issuer}]`);
      parts.push(log.message);
      if (log.file) parts.push(`\n  File: ${log.file}`);
      if (log.stack) parts.push(`\n  Stack: ${log.stack}`);
      return parts.join(' ');
    }).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${logs.length} log(s):\n\n${formatted}`,
      }],
    };
  }
);

// Tool: get_errors
server.tool(
  'get_errors',
  'Get only errors and warnings from Re.Pack build logs',
  {
    limit: z.number().optional().describe('Maximum number of errors to return (default: 20)'),
  },
  async (args) => {
    const errors = store.getErrors(args.limit ?? 20);

    if (errors.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No errors or warnings found.',
        }],
      };
    }

    const formatted = errors.map(log => {
      const icon = log.type === 'error' ? '❌' : '⚠️';
      const parts = [
        `${icon} [${log.timestamp}]`,
        `[${log.type.toUpperCase()}]`,
      ];
      if (log.issuer) parts.push(`[${log.issuer}]`);
      parts.push(log.message);
      if (log.file) parts.push(`\n   File: ${log.file}`);
      if (log.stack) parts.push(`\n   Stack: ${log.stack}`);
      return parts.join(' ');
    }).join('\n\n');

    const errorCount = errors.filter(e => e.type === 'error').length;
    const warnCount = errors.filter(e => e.type === 'warn').length;

    return {
      content: [{
        type: 'text',
        text: `Found ${errorCount} error(s) and ${warnCount} warning(s):\n\n${formatted}`,
      }],
    };
  }
);

// Tool: clear_logs
server.tool(
  'clear_logs',
  'Clear all logs from the in-memory buffer',
  {},
  async () => {
    const count = store.count;
    store.clear();

    return {
      content: [{
        type: 'text',
        text: `Cleared ${count} log(s) from buffer.`,
      }],
    };
  }
);

// Tool: get_runtime_logs
server.tool(
  'get_runtime_logs',
  'Get runtime logs from the React Native app (console.log output)',
  {
    limit: z.number().optional().describe('Maximum number of logs to return (default: 50)'),
    tag: z.string().optional().describe('Filter by log tag/component name'),
    types: z.array(z.enum(['info', 'warn', 'error', 'debug']))
      .optional()
      .describe('Filter by log type(s)'),
    search: z.string().optional().describe('Search in log messages'),
  },
  async (args) => {
    // Filter out build logs (webpack, repack issuers)
    const buildIssuers = ['webpack', 'repack', 'watcher'];
    const allLogs = store.get({ limit: 1000 });
    let runtimeLogs = allLogs.filter(log => !buildIssuers.includes(log.issuer ?? ''));

    // Apply additional filters
    if (args.tag) {
      runtimeLogs = runtimeLogs.filter(log => log.issuer === args.tag);
    }
    if (args.types) {
      runtimeLogs = runtimeLogs.filter(log => args.types!.includes(log.type as any));
    }
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      runtimeLogs = runtimeLogs.filter(log =>
        log.message.toLowerCase().includes(searchLower)
      );
    }

    // Apply limit
    runtimeLogs = runtimeLogs.slice(0, args.limit ?? 50);

    if (runtimeLogs.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No runtime logs found. Make sure your app is using the repack-logs-mcp client.\n\nSetup:\n1. Import: import { createLogger } from \'repack-logs-mcp/client\';\n2. Create: const log = createLogger(\'MyComponent\');\n3. Use: log.info(\'message\'), log.error(\'message\', data)',
        }],
      };
    }

    const formatted = runtimeLogs.map(log => {
      const parts = [
        `[${log.timestamp}]`,
        `[${log.type.toUpperCase()}]`,
      ];
      if (log.issuer) parts.push(`[${log.issuer}]`);
      parts.push(log.message);
      if (log.file) parts.push(`\n  File: ${log.file}`);
      if ((log as any).data) parts.push(`\n  Data: ${JSON.stringify((log as any).data, null, 2)}`);
      return parts.join(' ');
    }).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${runtimeLogs.length} runtime log(s):\n\n${formatted}`,
      }],
    };
  }
);

// Tool: get_status
server.tool(
  'get_status',
  'Get the current status of the log watcher and runtime server',
  {},
  async () => {
    const buildIssuers = ['webpack', 'repack', 'watcher'];
    const allLogs = store.get({ limit: 10000 });
    const buildLogs = allLogs.filter(log => buildIssuers.includes(log.issuer ?? ''));
    const runtimeLogs = allLogs.filter(log => !buildIssuers.includes(log.issuer ?? ''));

    const status = {
      watching: watcher.isWatching,
      filePath: watcher.path,
      fileExists: watcher.fileExists,
      logCount: store.count,
      buildLogCount: buildLogs.length,
      runtimeLogCount: runtimeLogs.length,
      errorCount: store.countByType('error'),
      warningCount: store.countByType('warn'),
      lastUpdate: store.lastTimestamp,
      runtimeServerPort: runtimeServer.activePort,
    };

    const lines = [
      `Build Log Watcher:`,
      `  Watching: ${status.watching ? 'Yes' : 'No'}`,
      `  Log File: ${status.filePath}`,
      `  File Exists: ${status.fileExists ? 'Yes' : 'No'}`,
      ``,
      `Runtime Log Server:`,
      `  Port: ${status.runtimeServerPort}`,
      `  URL: http://localhost:${status.runtimeServerPort}`,
      ``,
      `Log Statistics:`,
      `  Total Logs: ${status.logCount}`,
      `  Build Logs: ${status.buildLogCount}`,
      `  Runtime Logs: ${status.runtimeLogCount}`,
      `  Errors: ${status.errorCount}`,
      `  Warnings: ${status.warningCount}`,
      `  Last Update: ${status.lastUpdate ?? 'Never'}`,
    ];

    return {
      content: [{
        type: 'text',
        text: lines.join('\n'),
      }],
    };
  }
);

// Start the server
async function main() {
  // Start watching the log file
  await watcher.start();

  // Start the runtime log HTTP server
  await runtimeServer.start();

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle shutdown
  process.on('SIGINT', async () => {
    await watcher.stop();
    await runtimeServer.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await watcher.stop();
    await runtimeServer.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
