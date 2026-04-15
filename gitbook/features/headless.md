# Headless & CI Mode

`sf headless` runs SF commands without a terminal UI — designed for CI pipelines, cron jobs, and scripted automation.

## Basic Usage

```bash
# Run auto mode
sf headless

# Run a single unit
sf headless next

# With timeout for CI
sf headless --timeout 600000 auto

# Force a specific phase
sf headless dispatch plan

# Stream all events as JSONL
sf headless --json auto
```

## Creating Milestones Headlessly

```bash
# From a context file
sf headless new-milestone --context brief.md --auto

# From inline text
sf headless new-milestone --context-text "Build a REST API with auth"

# Pipe from stdin
echo "Build a CLI tool" | sf headless new-milestone --context -
```

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--timeout N` | 300000 (5 min) | Overall timeout in milliseconds |
| `--max-restarts N` | 3 | Auto-restart on crash (0 to disable) |
| `--json` | — | Stream events as JSONL to stdout |
| `--model ID` | — | Override model for this session |
| `--context <file>` | — | Context file for `new-milestone` (use `-` for stdin) |
| `--context-text <text>` | — | Inline context for `new-milestone` |
| `--auto` | — | Chain into auto mode after milestone creation |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Complete |
| `1` | Error or timeout |
| `2` | Blocked |

## Instant State Query

`sf headless query` returns a JSON snapshot of project state — no AI session, instant response (~50ms):

```bash
sf headless query | jq '.state.phase'
# "executing"

sf headless query | jq '.next'
# {"action":"dispatch","unitType":"execute-task","unitId":"M001/S01/T03"}

sf headless query | jq '.cost.total'
# 4.25
```

Any `/sf` subcommand works as a positional argument: `sf headless status`, `sf headless doctor`, etc.

## MCP Server Mode

`sf --mode mcp` runs SF as a Model Context Protocol server over stdin/stdout, exposing all SF tools to external AI clients:

```bash
sf --mode mcp
```

Compatible with Claude Desktop, VS Code Copilot, and any MCP host.

## Auto-Restart

In headless mode, crashes trigger automatic restart with exponential backoff (5s → 10s → 30s cap, default 3 attempts). SIGINT/SIGTERM bypasses restart. Combined with crash recovery, this enables true overnight unattended execution.
