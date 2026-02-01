# repack-logs-mcp

An MCP (Model Context Protocol) server for tailing Re.Pack/Rspack dev server logs. Enables AI assistants like Claude to query build logs, find errors, and monitor compilation status.

## How It Works

This package provides three components:
1. **RepackLogsPlugin** - An Rspack/Webpack plugin that writes build logs to a JSON file
2. **MCP Server** - Watches the log file and provides tools for AI assistants to query logs
3. **Client Logger** - A lightweight logger for React Native apps that sends runtime logs to the MCP server

## Installation

```bash
npm install -g repack-logs-mcp
# or use directly with npx
npx repack-logs-mcp /path/to/.repack-logs.json
```

## Setup

### Step 1: Add the Plugin to Your Rspack Config

Add the `RepackLogsPlugin` to your `rspack.config.mjs` (or `rspack.config.js`):

```js
import { RepackLogsPlugin } from 'repack-logs-mcp/plugin';

export default {
  // ... your existing config
  plugins: [
    // ... your existing plugins
    new RepackLogsPlugin({
      // Path to write logs (default: '.repack-logs.json')
      outputPath: '/absolute/path/to/.repack-logs.json',
      // Clear logs on each build start (default: true)
      clearOnStart: true,
    }),
  ],
};
```

**Example with Re.Pack:**

```js
import * as Repack from '@callstack/repack';
import { RepackLogsPlugin } from 'repack-logs-mcp/plugin';

export default Repack.defineRspackConfig({
  // ... your config
  plugins: [
    new Repack.RepackPlugin(),
    new RepackLogsPlugin({
      outputPath: '/Users/yourname/project/.repack-logs.json',
    }),
  ],
});
```

### Step 2: Add Runtime Logging (Optional)

To capture runtime logs (console.log from your app), you need to add a small client script that intercepts console calls and sends them to the MCP server.

**Step 2a: Create the client file**

Create a file called `mcp-client.js` in your React Native app's root directory (next to `index.js`):

```js
/**
 * MCP Console Capture Client
 * Intercepts console.log/warn/error and sends to MCP server
 */

var SERVER_URL = 'http://localhost:9090';
var logBuffer = [];
var flushTimer = null;
var BATCH_INTERVAL = 1000;
var originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
  info: console.info
};

function flushLogs() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (logBuffer.length === 0) return;

  var logs = logBuffer.slice();
  logBuffer = [];

  fetch(SERVER_URL + '/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logs: logs })
  }).catch(function() {});
}

function formatArg(arg) {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.name + ': ' + arg.message;
  try {
    return JSON.stringify(arg);
  } catch (e) {
    return String(arg);
  }
}

function createInterceptor(type, original) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    original.apply(console, args);

    var tag = 'console';
    var message = args.map(formatArg).join(' ');

    if (typeof args[0] === 'string') {
      var match = args[0].match(/^\[([^\]]+)\]/);
      if (match) tag = match[1];
    }

    var entry = {
      type: type,
      message: message,
      tag: tag,
      timestamp: new Date().toISOString()
    };

    if (args.length > 1) {
      try {
        entry.data = args.length === 2 ? args[1] : args.slice(1);
      } catch (e) {}
    }

    logBuffer.push(entry);
    if (!flushTimer) {
      flushTimer = setTimeout(flushLogs, BATCH_INTERVAL);
    }
  };
}

function enableConsoleCapture(options) {
  options = options || {};
  if (options.serverUrl) SERVER_URL = options.serverUrl;

  console.log = createInterceptor('info', originalConsole.log);
  console.info = createInterceptor('info', originalConsole.info);
  console.warn = createInterceptor('warn', originalConsole.warn);
  console.error = createInterceptor('error', originalConsole.error);
  console.debug = createInterceptor('debug', originalConsole.debug);
}

function disableConsoleCapture() {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
}

module.exports = {
  enableConsoleCapture: enableConsoleCapture,
  disableConsoleCapture: disableConsoleCapture
};
```

**Step 2b: Enable capture in your app**

Add this to your `index.js` (before `AppRegistry.registerComponent`):

```js
// Enable console.log capture for MCP debugging (only in dev)
if (__DEV__) {
  try {
    const { enableConsoleCapture } = require('./mcp-client');
    enableConsoleCapture();
  } catch (e) {
    // MCP client not available, skip
  }
}
```

**Step 2c: Check the runtime server port**

Run `get_status` to see which port the runtime server is using:

```
Runtime Log Server:
  Port: 9090
  URL: http://localhost:9090
```

If the port is different from 9090 (e.g., 9093), update `SERVER_URL` in `mcp-client.js` to match.

**That's it!** Now ALL your existing `console.log` calls are automatically sent to the MCP server.

The capture:
- Intercepts console.log, console.warn, console.error, console.debug
- Extracts tags from `[TagName]` patterns (e.g., `console.log('[MyComponent] hello')`)
- Still outputs to Metro console (so you see logs there too)
- Batches logs for efficiency (sends every 1 second)
- Only runs in development mode

### Step 3: Configure the MCP Server

Point the MCP server to the same log file path used in your plugin config.

## Tools Provided

| Tool | Description |
|------|-------------|
| `get_build_logs` | Get recent build logs with filters (type, limit, time, issuer, search) |
| `get_runtime_logs` | Get runtime logs from the React Native app (console.log output) |
| `get_errors` | Get only errors and warnings |
| `clear_logs` | Clear the in-memory buffer |
| `get_status` | Show watcher status, runtime server port, and statistics |

## Configuration

The log file path can be set via:

1. **CLI argument** (highest priority):
   ```bash
   npx repack-logs-mcp /path/to/.repack-logs.json
   ```

2. **Environment variable**:
   ```bash
   REPACK_LOG_FILE=/path/to/.repack-logs.json npx repack-logs-mcp
   ```

3. **Default**: `.repack-logs.json` in current directory

### Plugin Options

| Option | Description | Default |
|--------|-------------|---------|
| `outputPath` | Path to the log file | `.repack-logs.json` |
| `clearOnStart` | Clear log file on each build start | `true` |

### Environment Variables (MCP Server)

| Variable | Description | Default |
|----------|-------------|---------|
| `REPACK_LOG_FILE` | Path to the build log file | `.repack-logs.json` |
| `REPACK_MAX_LOGS` | Maximum logs to keep in memory | `1000` |
| `REPACK_RUNTIME_PORT` | HTTP port for runtime log server | `9090` |

## Claude Code Integration

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project settings):

```json
{
  "mcpServers": {
    "repack-logs": {
      "command": "npx",
      "args": ["repack-logs-mcp", "/path/to/your/project/.repack-logs.json"]
    }
  }
}
```

Then ask Claude things like:
- "What are the recent build logs?"
- "Show me the runtime logs"
- "Are there any build errors?"
- "Show me warnings from the last build"
- "What's the status of the log watcher?"

## Usage Examples

### Get recent logs
```
Tool: get_build_logs
Args: { "limit": 10 }
```

### Filter by type
```
Tool: get_build_logs
Args: { "types": ["error", "warn"], "limit": 20 }
```

### Search logs
```
Tool: get_build_logs
Args: { "search": "Cannot find module" }
```

### Get errors only
```
Tool: get_errors
Args: { "limit": 10 }
```

### Get runtime logs
```
Tool: get_runtime_logs
Args: { "limit": 50 }
```

### Filter runtime logs by tag
```
Tool: get_runtime_logs
Args: { "tag": "MyComponent", "limit": 20 }
```

### Search runtime logs
```
Tool: get_runtime_logs
Args: { "search": "error", "types": ["error", "warn"] }
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js .repack-logs.json
```

## License

MIT
