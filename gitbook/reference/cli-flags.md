# CLI Flags

## Starting SF

| Flag | Description |
|------|-------------|
| `sf` | Start a new interactive session |
| `sf --continue` (`-c`) | Resume the most recent session |
| `sf --model <id>` | Override the default model for this session |
| `sf --web [path]` | Start browser-based web interface |
| `sf --worktree` (`-w`) [name] | Start in a git worktree |
| `sf --no-session` | Disable session persistence |
| `sf --extension <path>` | Load an additional extension (repeatable) |
| `sf --append-system-prompt <text>` | Append text to the system prompt |
| `sf --tools <list>` | Comma-separated tools to enable |
| `sf --version` (`-v`) | Print version and exit |
| `sf --help` (`-h`) | Print help and exit |
| `sf --debug` | Enable diagnostic logging |

## Non-Interactive Modes

| Flag | Description |
|------|-------------|
| `sf --print "msg"` (`-p`) | Single-shot prompt mode (no TUI) |
| `sf --mode <text\|json\|rpc\|mcp>` | Output mode for non-interactive use |

## Session Management

| Command | Description |
|---------|-------------|
| `sf sessions` | Interactive session picker — list and resume saved sessions |
| `sf --list-models [search]` | List available models and exit |

## Configuration

| Command | Description |
|---------|-------------|
| `sf config` | Set up global API keys |
| `sf update` | Update to the latest version |

## Headless Mode

| Flag | Description |
|------|-------------|
| `sf headless` | Run without TUI |
| `sf headless --timeout N` | Timeout in ms (default: 300000) |
| `sf headless --max-restarts N` | Auto-restart on crash (default: 3) |
| `sf headless --json` | Stream events as JSONL |
| `sf headless --model ID` | Override model |
| `sf headless --context <file>` | Context file for `new-milestone` |
| `sf headless --context-text <text>` | Inline context for `new-milestone` |
| `sf headless --auto` | Chain into auto mode after milestone creation |
| `sf headless query` | Instant JSON state snapshot (~50ms) |

## Web Interface

| Flag | Default | Description |
|------|---------|-------------|
| `--host` | `localhost` | Bind address |
| `--port` | `3000` | Port |
| `--allowed-origins` | (none) | CORS origins |
