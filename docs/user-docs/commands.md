# Commands Reference

## Session Commands

| Command | Description |
|---------|-------------|
| `/sf` | Step mode — execute one unit at a time, pause between each |
| `/sf next` | Explicit step mode (same as `/sf`) |
| `/sf auto` | Autonomous mode — research, plan, execute, commit, repeat |
| `/sf quick` | Execute a quick task with SF guarantees (atomic commits, state tracking) without full planning overhead |
| `/sf stop` | Stop auto mode gracefully |
| `/sf pause` | Pause auto-mode (preserves state, `/sf auto` to resume) |
| `/sf steer` | Hard-steer plan documents during execution |
| `/sf discuss` | Discuss architecture and decisions (works alongside auto mode) |
| `/sf status` | Progress dashboard |
| `/sf widget` | Cycle dashboard widget: full / small / min / off |
| `/sf queue` | Queue and reorder future milestones (safe during auto mode) |
| `/sf capture` | Fire-and-forget thought capture (works during auto mode) |
| `/sf triage` | Manually trigger triage of pending captures |
| `/sf dispatch` | Dispatch a specific phase directly (research, plan, execute, complete, reassess, uat, replan) |
| `/sf history` | View execution history (supports `--cost`, `--phase`, `--model` filters) |
| `/sf forensics` | Full-access SF debugger — structured anomaly detection, unit traces, and LLM-guided root-cause analysis for auto-mode failures |
| `/sf cleanup` | Clean up SF state files and stale worktrees |
| `/sf visualize` | Open workflow visualizer (progress, deps, metrics, timeline) |
| `/sf export --html` | Generate self-contained HTML report for current or completed milestone |
| `/sf export --html --all` | Generate retrospective reports for all milestones at once |
| `/sf update` | Update SF to the latest version in-session |
| `/sf knowledge` | Add persistent project knowledge (rule, pattern, or lesson) |
| `/sf fast` | Toggle service tier for supported models (prioritized API routing) |
| `/sf rate` | Rate last unit's model tier (over/ok/under) — improves adaptive routing |
| `/sf changelog` | Show categorized release notes |
| `/sf logs` | Browse activity logs, debug logs, and metrics |
| `/sf remote` | Control remote auto-mode |
| `/sf help` | Categorized command reference with descriptions for all SF subcommands |

## Configuration & Diagnostics

| Command | Description |
|---------|-------------|
| `/sf prefs` | Model selection, timeouts, budget ceiling |
| `/sf mode` | Switch workflow mode (solo/team) with coordinated defaults for milestone IDs, git commit behavior, and documentation |
| `/sf config` | Re-run the provider setup wizard (LLM provider + tool keys) |
| `/sf keys` | API key manager — list, add, remove, test, rotate, doctor |
| `/sf doctor` | Runtime health checks with auto-fix — issues surface in real time across widget, visualizer, and HTML reports (v2.40) |
| `/sf inspect` | Show SQLite DB diagnostics |
| `/sf init` | Project init wizard — detect, configure, bootstrap `.sf/` |
| `/sf setup` | Global setup status and configuration |
| `/sf skill-health` | Skill lifecycle dashboard — usage stats, success rates, token trends, staleness warnings |
| `/sf skill-health <name>` | Detailed view for a single skill |
| `/sf skill-health --declining` | Show only skills flagged for declining performance |
| `/sf skill-health --stale N` | Show skills unused for N+ days |
| `/sf hooks` | Show configured post-unit and pre-dispatch hooks |
| `/sf run-hook` | Manually trigger a specific hook |
| `/sf migrate` | Migrate a v1 `.planning` directory to `.sf` format |

## Milestone Management

| Command | Description |
|---------|-------------|
| `/sf new-milestone` | Create a new milestone |
| `/sf skip` | Prevent a unit from auto-mode dispatch |
| `/sf undo` | Revert last completed unit |
| `/sf undo-task` | Reset a specific task's completion state (DB + markdown) |
| `/sf reset-slice` | Reset a slice and all its tasks (DB + markdown) |
| `/sf park` | Park a milestone — skip without deleting |
| `/sf unpark` | Reactivate a parked milestone |
| Discard milestone | Available via `/sf` wizard → "Milestone actions" → "Discard" |

## Parallel Orchestration

| Command | Description |
|---------|-------------|
| `/sf parallel start` | Analyze eligibility, confirm, and start workers |
| `/sf parallel status` | Show all workers with state, progress, and cost |
| `/sf parallel stop [MID]` | Stop all workers or a specific milestone's worker |
| `/sf parallel pause [MID]` | Pause all workers or a specific one |
| `/sf parallel resume [MID]` | Resume paused workers |
| `/sf parallel merge [MID]` | Merge completed milestones back to main |

See [Parallel Orchestration](./parallel-orchestration.md) for full documentation.

## Workflow Templates (v2.42)

| Command | Description |
|---------|-------------|
| `/sf start` | Start a workflow template (bugfix, spike, feature, hotfix, refactor, security-audit, dep-upgrade, full-project) |
| `/sf start resume` | Resume an in-progress workflow |
| `/sf templates` | List available workflow templates |
| `/sf templates info <name>` | Show detailed template info |

## Custom Workflows (v2.42)

| Command | Description |
|---------|-------------|
| `/sf workflow new` | Create a new workflow definition (via skill) |
| `/sf workflow run <name>` | Create a run and start auto-mode |
| `/sf workflow list` | List workflow runs |
| `/sf workflow validate <name>` | Validate a workflow definition YAML |
| `/sf workflow pause` | Pause custom workflow auto-mode |
| `/sf workflow resume` | Resume paused custom workflow auto-mode |

## Extensions

| Command | Description |
|---------|-------------|
| `/sf extensions list` | List all extensions and their status |
| `/sf extensions enable <id>` | Enable a disabled extension |
| `/sf extensions disable <id>` | Disable an extension |
| `/sf extensions info <id>` | Show extension details |

## cmux Integration

| Command | Description |
|---------|-------------|
| `/sf cmux status` | Show cmux detection, prefs, and capabilities |
| `/sf cmux on` | Enable cmux integration |
| `/sf cmux off` | Disable cmux integration |
| `/sf cmux notifications on/off` | Toggle cmux desktop notifications |
| `/sf cmux sidebar on/off` | Toggle cmux sidebar metadata |
| `/sf cmux splits on/off` | Toggle cmux visual subagent splits |

## GitHub Sync (v2.39)

| Command | Description |
|---------|-------------|
| `/github-sync bootstrap` | Initial setup — creates GitHub Milestones, Issues, and draft PRs from current `.sf/` state |
| `/github-sync status` | Show sync mapping counts (milestones, slices, tasks) |

Enable with `github.enabled: true` in preferences. Requires `gh` CLI installed and authenticated. Sync mapping is persisted in `.sf/.github-sync.json`.

## Git Commands

| Command | Description |
|---------|-------------|
| `/worktree` (`/wt`) | Git worktree lifecycle — create, switch, merge, remove |

## Session Management

| Command | Description |
|---------|-------------|
| `/clear` | Start a new session (alias for `/new`) |
| `/exit` | Graceful shutdown — saves session state before exiting |
| `/kill` | Kill SF process immediately |
| `/model` | Switch the active model |
| `/login` | Log in to an LLM provider |
| `/thinking` | Toggle thinking level during sessions |
| `/voice` | Toggle real-time speech-to-text (macOS, Linux) |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+G` | Toggle dashboard overlay |
| `Ctrl+Alt+V` | Toggle voice transcription |
| `Ctrl+Alt+B` | Show background shell processes |
| `Ctrl+V` / `Alt+V` | Paste image from clipboard (screenshot → vision input) |
| `Escape` | Pause auto mode (preserves conversation) |

> **Note:** In terminals without Kitty keyboard protocol support (macOS Terminal.app, JetBrains IDEs), slash-command fallbacks are shown instead of `Ctrl+Alt` shortcuts.
>
> **Tip:** If `Ctrl+V` is intercepted by your terminal (e.g. Warp), use `Alt+V` instead for clipboard image paste.

## CLI Flags

| Flag | Description |
|------|-------------|
| `sf` | Start a new interactive session |
| `sf --continue` (`-c`) | Resume the most recent session for the current directory |
| `sf --model <id>` | Override the default model for this session |
| `sf --print "msg"` (`-p`) | Single-shot prompt mode (no TUI) |
| `sf --mode <text\|json\|rpc\|mcp>` | Output mode for non-interactive use |
| `sf --list-models [search]` | List available models and exit |
| `sf --web [path]` | Start browser-based web interface (optional project path) |
| `sf --worktree` (`-w`) [name] | Start session in a git worktree (auto-generates name if omitted) |
| `sf --no-session` | Disable session persistence |
| `sf --extension <path>` | Load an additional extension (can be repeated) |
| `sf --append-system-prompt <text>` | Append text to the system prompt |
| `sf --tools <list>` | Comma-separated list of tools to enable |
| `sf --version` (`-v`) | Print version and exit |
| `sf --help` (`-h`) | Print help and exit |
| `sf sessions` | Interactive session picker — list all saved sessions for the current directory and choose one to resume |
| `sf --debug` | Enable structured JSONL diagnostic logging for troubleshooting dispatch and state issues |
| `sf config` | Set up global API keys for search and docs tools (saved to `~/.sf/agent/auth.json`, applies to all projects). See [Global API Keys](./configuration.md#global-api-keys-sf-config). |
| `sf update` | Update SF to the latest version |
| `sf headless new-milestone` | Create a new milestone from a context file (headless — no TUI required) |

## Headless Mode

`sf headless` runs `/sf` commands without a TUI — designed for CI, cron jobs, and scripted automation. It spawns a child process in RPC mode, auto-responds to interactive prompts, detects completion, and exits with meaningful exit codes.

```bash
# Run auto mode (default)
sf headless

# Run a single unit
sf headless next

# Instant JSON snapshot — no LLM, ~50ms
sf headless query

# With timeout for CI
sf headless --timeout 600000 auto

# Force a specific phase
sf headless dispatch plan

# Create a new milestone from a context file and start auto mode
sf headless new-milestone --context brief.md --auto

# Create a milestone from inline text
sf headless new-milestone --context-text "Build a REST API with auth"

# Pipe context from stdin
echo "Build a CLI tool" | sf headless new-milestone --context -
```

| Flag | Description |
|------|-------------|
| `--timeout N` | Overall timeout in milliseconds (default: 300000 / 5 min) |
| `--max-restarts N` | Auto-restart on crash with exponential backoff (default: 3). Set 0 to disable |
| `--json` | Stream all events as JSONL to stdout |
| `--model ID` | Override the model for the headless session |
| `--context <file>` | Context file for `new-milestone` (use `-` for stdin) |
| `--context-text <text>` | Inline context text for `new-milestone` |
| `--auto` | Chain into auto-mode after milestone creation |

**Exit codes:** `0` = complete, `1` = error or timeout, `2` = blocked.

Any `/sf` subcommand works as a positional argument — `sf headless status`, `sf headless doctor`, `sf headless dispatch execute`, etc.

### `sf headless query`

Returns a single JSON object with the full project snapshot — no LLM session, no RPC child, instant response (~50ms). This is the recommended way for orchestrators and scripts to inspect SF state.

```bash
sf headless query | jq '.state.phase'
# "executing"

sf headless query | jq '.next'
# {"action":"dispatch","unitType":"execute-task","unitId":"M001/S01/T03"}

sf headless query | jq '.cost.total'
# 4.25
```

**Output schema:**

```json
{
  "state": {
    "phase": "executing",
    "activeMilestone": { "id": "M001", "title": "..." },
    "activeSlice": { "id": "S01", "title": "..." },
    "activeTask": { "id": "T01", "title": "..." },
    "registry": [{ "id": "M001", "status": "active" }, ...],
    "progress": { "milestones": { "done": 0, "total": 2 }, "slices": { "done": 1, "total": 3 } },
    "blockers": []
  },
  "next": {
    "action": "dispatch",
    "unitType": "execute-task",
    "unitId": "M001/S01/T01"
  },
  "cost": {
    "workers": [{ "milestoneId": "M001", "cost": 1.50, "state": "running", ... }],
    "total": 1.50
  }
}
```

## MCP Server Mode

`sf --mode mcp` runs SF as a [Model Context Protocol](https://modelcontextprotocol.io) server over stdin/stdout. This exposes all SF tools (read, write, edit, bash, etc.) to external AI clients — Claude Desktop, VS Code Copilot, and any MCP-compatible host.

```bash
# Start SF as an MCP server
sf --mode mcp
```

The server registers all tools from the agent session and maps MCP `tools/list` and `tools/call` requests to SF tool definitions. It runs until the transport closes.

## In-Session Update

`/sf update` checks npm for a newer version of SF and installs it without leaving the session.

```bash
/sf update
# Current version: v2.36.0
# Checking npm registry...
# Updated to v2.37.0. Restart SF to use the new version.
```

If already up to date, it reports so and takes no action.

## Export

`/sf export` generates reports of milestone work.

```bash
# Generate HTML report for the active milestone
/sf export --html

# Generate retrospective reports for ALL milestones at once
/sf export --html --all
```

Reports are saved to `.sf/reports/` with a browseable `index.html` that links to all generated snapshots.
