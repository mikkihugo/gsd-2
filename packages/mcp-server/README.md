# @sf-build/mcp-server

MCP server exposing SF orchestration tools for Claude Code, Cursor, and other MCP-compatible clients.

Start SF auto-mode sessions, poll progress, resolve blockers, and retrieve results — all through the [Model Context Protocol](https://modelcontextprotocol.io/).

This package now exposes two tool surfaces:

- session/read tools for starting and inspecting SF sessions
- MCP-native interactive tools for structured user input
- headless-safe workflow tools for planning, completion, validation, reassessment, metadata persistence, and journal reads

## Installation

```bash
npm install @sf-build/mcp-server
```

Or with the monorepo workspace:

```bash
# Already available as a workspace package
npx sf-mcp-server
```

## Configuration

### Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "sf": {
      "command": "npx",
      "args": ["sf-mcp-server"],
      "env": {
        "SF_CLI_PATH": "/path/to/sf"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "sf": {
      "command": "sf-mcp-server"
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sf": {
      "command": "npx",
      "args": ["sf-mcp-server"],
      "env": {
        "SF_CLI_PATH": "/path/to/sf"
      }
    }
  }
}
```

## Tools

### Workflow tools

The workflow MCP surface includes:

- `sf_decision_save`
- `sf_save_decision`
- `sf_requirement_update`
- `sf_update_requirement`
- `sf_requirement_save`
- `sf_save_requirement`
- `sf_milestone_generate_id`
- `sf_generate_milestone_id`
- `sf_plan_milestone`
- `sf_plan_slice`
- `sf_plan_task`
- `sf_task_plan`
- `sf_replan_slice`
- `sf_slice_replan`
- `sf_task_complete`
- `sf_complete_task`
- `sf_slice_complete`
- `sf_complete_slice`
- `sf_skip_slice`
- `sf_validate_milestone`
- `sf_milestone_validate`
- `sf_complete_milestone`
- `sf_milestone_complete`
- `sf_reassess_roadmap`
- `sf_roadmap_reassess`
- `sf_save_gate_result`
- `sf_summary_save`
- `sf_milestone_status`
- `sf_journal_query`

These tools use the same SF workflow handlers as the native in-process tool path wherever a shared handler exists.

### Interactive tools

The packaged server now exposes `ask_user_questions` through MCP form elicitation. This keeps the existing SF answer payload shape while allowing Claude Code CLI and other elicitation-capable clients to surface structured user choices.

`secure_env_collect` is still not exposed by this package. That path needs MCP URL elicitation or an equivalent secure bridge because secrets should not flow through form elicitation.

Current support boundary:

- when running inside the SF monorepo checkout, the MCP server auto-discovers the shared workflow executor module
- outside the monorepo, set `SF_WORKFLOW_EXECUTORS_MODULE` to an importable `workflow-tool-executors` module path if you want the mutation tools enabled
- `ask_user_questions` requires an MCP client that supports form elicitation
- session/read tools do not depend on this bridge

If the executor bridge cannot be loaded, workflow mutation calls will fail with a precise configuration error instead of silently degrading.

### `sf_execute`

Start a SF auto-mode session for a project directory.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectDir` | `string` | ✅ | Absolute path to the project directory |
| `command` | `string` | | Command to send (default: `"/sf auto"`) |
| `model` | `string` | | Model ID override |
| `bare` | `boolean` | | Run in bare mode (skip user config) |

**Returns:** `{ sessionId, status: "started" }`

### `sf_status`

Poll the current status of a running SF session.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | `string` | ✅ | Session ID from `sf_execute` |

**Returns:**

```json
{
  "status": "running",
  "progress": { "eventCount": 42, "toolCalls": 15 },
  "recentEvents": [ ... ],
  "pendingBlocker": null,
  "cost": { "totalCost": 0.12, "tokens": { "input": 5000, "output": 2000, "cacheRead": 1000, "cacheWrite": 500 } },
  "durationMs": 45000
}
```

### `sf_result`

Get the accumulated result of a session. Works for both running (partial) and completed sessions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | `string` | ✅ | Session ID from `sf_execute` |

**Returns:**

```json
{
  "sessionId": "abc-123",
  "projectDir": "/path/to/project",
  "status": "completed",
  "durationMs": 120000,
  "cost": { ... },
  "recentEvents": [ ... ],
  "pendingBlocker": null,
  "error": null
}
```

### `sf_cancel`

Cancel a running session. Aborts the current operation and stops the agent process.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | `string` | ✅ | Session ID from `sf_execute` |

**Returns:** `{ cancelled: true }`

### `sf_query`

Query SF project state from the filesystem without an active session. Returns STATE.md, PROJECT.md, requirements, and milestone listing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectDir` | `string` | ✅ | Absolute path to the project directory |
| `query` | `string` | ✅ | What to query (e.g. `"status"`, `"milestones"`) |

**Returns:**

```json
{
  "projectDir": "/path/to/project",
  "state": "...",
  "project": "...",
  "requirements": "...",
  "milestones": [
    { "id": "M001", "hasRoadmap": true, "hasSummary": false }
  ]
}
```

### `sf_resolve_blocker`

Resolve a pending blocker in a session by sending a response to the blocked UI request.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | `string` | ✅ | Session ID from `sf_execute` |
| `response` | `string` | ✅ | Response to send for the pending blocker |

**Returns:** `{ resolved: true }`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SF_CLI_PATH` | Absolute path to the SF CLI binary. If not set, the server resolves `sf` via `which`. |
| `SF_WORKFLOW_EXECUTORS_MODULE` | Optional absolute path or `file:` URL for the shared SF workflow executor module used by workflow mutation tools. |

The server also hydrates supported model-provider and tool credentials from `~/.sf/agent/auth.json` on startup. Keys saved through `/sf config` or `/sf keys` become available to the MCP server process automatically, and any explicitly-set environment variable still wins.

## Architecture

```
┌─────────────────┐     stdio      ┌──────────────────┐
│  MCP Client     │ ◄────────────► │  @sf-build/mcp-server │
│  (Claude Code,  │    JSON-RPC    │                  │
│   Cursor, etc.) │                │  SessionManager  │
└─────────────────┘                │       │          │
                                   │       ▼          │
                                   │  @sf-build/rpc-client │
                                   │       │          │
                                   │       ▼          │
                                   │  SF CLI (child  │
                                   │  process via RPC)│
                                   └──────────────────┘
```

- **@sf-build/mcp-server** — MCP protocol adapter. Translates MCP tool calls into SessionManager operations.
- **SessionManager** — Manages RpcClient lifecycle. One session per project directory. Tracks events in a ring buffer (last 50), detects blockers, accumulates cost.
- **@sf-build/rpc-client** — Low-level RPC client that spawns and communicates with the SF CLI process via JSON-RPC over stdio.

## License

MIT
