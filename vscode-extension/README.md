# SF-2 — VS Code Extension

Control the [SF-2 coding agent](https://github.com/singularity-forge/sf-run) directly from VS Code. Run autonomous coding sessions, chat with `@sf`, monitor agent activity in real-time, review and accept/reject changes, and manage your workflow — all without leaving the editor.

![SF Extension Overview](docs/images/overview.png)

## Requirements

- **SF-2** installed globally: `npm install -g sf-pi`
- **Node.js** >= 22.0.0
- **Git** installed and on PATH
- **VS Code** >= 1.95.0

## Quick Start

1. Install SF: `npm install -g sf-pi`
2. Install this extension
3. Open a project folder in VS Code
4. Click the **SF icon** in the Activity Bar (left sidebar)
5. Click **Start Agent** or run `Ctrl+Shift+P` > **SF: Start Agent**
6. Start chatting with `@sf` in Chat or click **Auto** in the sidebar

---

## Features

### Sidebar Dashboard

Click the **SF icon** in the Activity Bar. The compact header shows connection status, model, session, message count, thinking level, context usage bar, and cost — all in two lines. Sections (Workflow, Stats, Actions, Settings) are collapsible and remember their state.

### Workflow Controls

One-click buttons for SF's core commands. All route through the Chat panel so you see the full response:

| Button | What it does |
|--------|-------------|
| **Auto** | Start autonomous mode — research, plan, execute |
| **Next** | Execute one unit of work, then pause |
| **Quick** | Quick task without planning (opens input) |
| **Capture** | Capture a thought for later triage |

### Chat Integration (`@sf`)

Use `@sf` in VS Code Chat (`Cmd+Shift+I`) to talk to the agent:

```
@sf refactor the auth module to use JWT
@sf /sf auto
@sf fix the errors in this file
```

- **Auto-starts** the agent if not running
- **File context** via `#file` references
- **Selection context** — automatically includes selected code
- **Diagnostic context** — auto-includes errors/warnings when you mention "fix" or "error"
- **Streaming** progress, file anchors, token usage footer

### Source Control Integration

Agent-modified files appear in a dedicated **"SF Agent"** section of the Source Control panel:

- **Click any file** to see a before/after diff in VS Code's native diff editor
- **Accept** or **Discard** changes per-file via inline buttons
- **Accept All** / **Discard All** via the SCM title bar
- Gutter diff indicators (green/red bars) show exactly what changed

### Line-Level Decorations

When the agent modifies a file, you'll see:
- **Green background** on newly added lines
- **Yellow background** on modified lines
- **Left border gutter indicator** on all agent-touched lines
- **Hover** any decorated line to see "Modified by SF Agent"

### Checkpoints & Rollback

Automatic checkpoints are created at the start of each agent turn. Use **Discard All** in the SCM panel to revert all agent changes to their original state, or discard individual files.

### Activity Feed

The **Activity** panel shows a real-time log of every tool the agent executes — Read, Write, Edit, Bash, Grep, Glob — with status icons (running/success/error), duration, and click-to-open for file operations.

### Sessions

The **Sessions** panel lists all past sessions for the current workspace. Click any session to switch to it. The current session is highlighted green. Sessions persist to disk automatically.

### Diagnostic Integration

- **Fix Errors** button in the sidebar reads the active file's diagnostics from the Problems panel and sends them to the agent
- **Fix All Problems** (`Cmd+Shift+P` > SF: Fix All Problems) collects errors/warnings across the workspace
- Works automatically in chat — mention "fix" or "error" and diagnostics are included

### Code Lens

Four inline actions above every function and class (TS/JS/Python/Go/Rust):

| Action | What it does |
|--------|-------------|
| **Ask SF** | Explain the function/class |
| **Refactor** | Improve clarity, performance, or structure |
| **Find Bugs** | Review for bugs and edge cases |
| **Tests** | Generate test coverage |

### Git Integration

- **Commit Agent Changes** — stages and commits modified files with your message
- **Create Branch** — create a new branch for agent work
- **Show Diff** — view git diff of agent changes

### Approval Modes

Control how much autonomy the agent has:

| Mode | Behavior |
|------|----------|
| **Auto-approve** | Agent runs freely (default) |
| **Ask** | Prompts before file writes and commands |
| **Plan-only** | Read-only — agent can analyze but not modify |

Change via Settings section or `Cmd+Shift+P` > **SF: Select Approval Mode**.

### Agent UI Requests

When the agent needs input (questions, confirmations, selections), VS Code dialogs appear automatically — no more hanging on `ask_user_questions`.

### Additional Features

- **Conversation History** — full message viewer with tool calls, thinking blocks, search, and fork-from-here
- **Slash Command Completion** — type `/` for auto-complete of `/sf` commands
- **File Decorations** — "G" badge on agent-modified files in the Explorer
- **Bash Terminal** — dedicated terminal for agent shell output
- **Context Window Warning** — notification when context exceeds threshold
- **Progress Notifications** — optional notification with cancel button (off by default)

---

## All Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| **SF: Start Agent** | | Connect to the SF agent |
| **SF: Stop Agent** | | Disconnect the agent |
| **SF: New Session** | `Cmd+Shift+G` `Cmd+Shift+N` | Start a fresh conversation |
| **SF: Send Message** | `Cmd+Shift+G` `Cmd+Shift+P` | Send a message to the agent |
| **SF: Abort** | `Cmd+Shift+G` `Cmd+Shift+A` | Interrupt the current operation |
| **SF: Steer Agent** | `Cmd+Shift+G` `Cmd+Shift+I` | Steering message mid-operation |
| **SF: Switch Model** | | Pick a model from QuickPick |
| **SF: Cycle Model** | `Cmd+Shift+G` `Cmd+Shift+M` | Rotate to the next model |
| **SF: Set Thinking Level** | | Choose off / low / medium / high |
| **SF: Cycle Thinking** | `Cmd+Shift+G` `Cmd+Shift+T` | Rotate through thinking levels |
| **SF: Compact Context** | | Trigger context compaction |
| **SF: Export HTML** | | Save session as HTML |
| **SF: Session Stats** | | Display token usage and cost |
| **SF: Run Bash** | | Execute a shell command |
| **SF: List Commands** | | Browse slash commands |
| **SF: Set Session Name** | | Rename current session |
| **SF: Copy Last Response** | | Copy to clipboard |
| **SF: Switch Session** | | Load a different session |
| **SF: Show History** | | Open conversation viewer |
| **SF: Fork Session** | | Fork from a previous message |
| **SF: Fix Problems in File** | | Send file diagnostics to agent |
| **SF: Fix All Problems** | | Send workspace errors to agent |
| **SF: Commit Agent Changes** | | Git commit modified files |
| **SF: Create Branch** | | Create branch for agent work |
| **SF: Show Agent Diff** | | View git diff |
| **SF: Accept All Changes** | | Accept all SCM changes |
| **SF: Discard All Changes** | | Revert all agent modifications |
| **SF: Select Approval Mode** | | Choose auto-approve/ask/plan-only |
| **SF: Cycle Approval Mode** | | Rotate through approval modes |
| **SF: Code Lens** actions | | Ask, Refactor, Find Bugs, Tests |

> On Windows/Linux, replace `Cmd` with `Ctrl`.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `sf.binaryPath` | `"sf"` | Path to the SF binary |
| `sf.autoStart` | `false` | Start agent on extension activation |
| `sf.autoCompaction` | `true` | Automatic context compaction |
| `sf.codeLens` | `true` | Code lens above functions/classes |
| `sf.showProgressNotifications` | `false` | Progress notification (off — Chat shows progress) |
| `sf.activityFeedMaxItems` | `100` | Max items in Activity feed |
| `sf.showContextWarning` | `true` | Warn when context exceeds threshold |
| `sf.contextWarningThreshold` | `80` | Context % that triggers warning |
| `sf.approvalMode` | `"auto-approve"` | Agent permission mode |

## How It Works

The extension spawns `sf --mode rpc` and communicates over JSON-RPC via stdin/stdout. Agent events stream in real-time. The change tracker captures file state before modifications for SCM diffs and rollback. UI requests from the agent (questions, confirmations) are handled via VS Code dialogs.

## Links

- [SF Documentation](https://github.com/singularity-forge/sf-run/tree/main/docs)
- [Getting Started](https://github.com/singularity-forge/sf-run/blob/main/docs/getting-started.md)
- [Issue Tracker](https://github.com/singularity-forge/sf-run/issues)
