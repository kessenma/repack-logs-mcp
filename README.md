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

To capture runtime logs (console.log from your app), add the client logger:

```js
// In your React Native app
import { createLogger } from 'repack-logs-mcp/client';

// Create a tagged logger for your component/module
const log = createLogger('MyComponent');

// Use it like console.log
log.info('Component mounted');
log.warn('Something looks wrong', { details: data });
log.error('Failed to fetch', error);
log.debug('Debug info', { state });
```

The logger automatically:
- Sends logs to the MCP server (default: http://localhost:9090)
- Also calls console.log so you see logs in Metro
- Batches logs for efficiency
- Handles errors gracefully (won't crash your app)

**Configuration:**

```js
import { configure, createLogger } from 'repack-logs-mcp/client';

// Global configuration
configure({
  serverUrl: 'http://localhost:9090',  // MCP runtime server
  passthrough: true,                    // Also call console.log
  enabled: __DEV__,                     // Only in development
});

const log = createLogger('MyComponent');
```

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
