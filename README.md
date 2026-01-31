# repack-logs-mcp

An MCP (Model Context Protocol) server for tailing Re.Pack/Rspack dev server logs. Enables AI assistants like Claude to query build logs, find errors, and monitor compilation status.

## How It Works

Re.Pack supports `--log-file <path>` which outputs JSON log entries to a file. This MCP server watches that file and provides tools to query the logs.

```bash
# Run your dev server with file logging
npx react-native start --log-file .repack-logs.json
```

## Installation

```bash
npm install -g repack-logs-mcp
# or use directly with npx
npx repack-logs-mcp /path/to/.repack-logs.json
```

## Tools Provided

| Tool | Description |
|------|-------------|
| `get_build_logs` | Get recent logs with filters (type, limit, time, issuer, search) |
| `get_errors` | Get only errors and warnings |
| `clear_logs` | Clear the in-memory buffer |
| `get_status` | Show watcher status and statistics |

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

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REPACK_LOG_FILE` | Path to the log file | `.repack-logs.json` |
| `REPACK_MAX_LOGS` | Maximum logs to keep in memory | `1000` |

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
