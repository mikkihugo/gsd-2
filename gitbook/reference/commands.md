# Commands

## Session Commands

| Command | Description |
|---------|-------------|
| `/sf` | Step mode — execute one unit at a time |
| `/sf auto` | Autonomous mode — research, plan, execute, commit, repeat |
| `/sf quick` | Quick task with SF guarantees but no full planning |
| `/sf stop` | Stop auto mode gracefully |
| `/sf pause` | Pause auto mode (preserves state) |
| `/sf steer` | Modify plan documents during execution |
| `/sf discuss` | Discuss architecture and decisions |
| `/sf status` | Progress dashboard |
| `/sf widget` | Cycle dashboard widget: full / small / min / off |
| `/sf queue` | Queue and reorder future milestones |
| `/sf capture` | Fire-and-forget thought capture |
| `/sf triage` | Manually trigger capture triage |
| `/sf dispatch` | Dispatch a specific phase directly |
| `/sf history` | View execution history (supports `--cost`, `--phase`, `--model` filters) |
| `/sf forensics` | Full debugger for auto-mode failures |
| `/sf cleanup` | Clean up state files and stale worktrees |
| `/sf visualize` | Open workflow visualizer |
| `/sf export --html` | Generate HTML report for current milestone |
| `/sf export --html --all` | Generate reports for all milestones |
| `/sf update` | Update SF to the latest version |
| `/sf knowledge` | Add persistent project knowledge |
| `/sf fast` | Toggle service tier for supported models |
| `/sf rate` | Rate last unit's model tier (over/ok/under) |
| `/sf changelog` | Show release notes |
| `/sf logs` | Browse activity and debug logs |
| `/sf remote` | Control remote auto-mode |
| `/sf help` | Show all available commands |

## Configuration & Diagnostics

| Command | Description |
|---------|-------------|
| `/sf prefs` | Preferences wizard |
| `/sf mode` | Switch workflow mode (solo/team) |
| `/sf config` | Re-run provider setup wizard |
| `/sf keys` | API key manager |
| `/sf doctor` | Runtime health checks with auto-fix |
| `/sf inspect` | Show database diagnostics |
| `/sf init` | Project init wizard |
| `/sf setup` | Global setup status |
| `/sf skill-health` | Skill lifecycle dashboard |
| `/sf hooks` | Show configured hooks |
| `/sf migrate` | Migrate v1 `.planning` to `.sf` format |

## Milestone Management

| Command | Description |
|---------|-------------|
| `/sf new-milestone` | Create a new milestone |
| `/sf skip` | Prevent a unit from auto-mode dispatch |
| `/sf undo` | Revert last completed unit |
| `/sf undo-task` | Reset a specific task's completion state |
| `/sf reset-slice` | Reset a slice and all its tasks |
| `/sf park` | Park a milestone (skip without deleting) |
| `/sf unpark` | Reactivate a parked milestone |

## Parallel Orchestration

| Command | Description |
|---------|-------------|
| `/sf parallel start` | Analyze and start parallel workers |
| `/sf parallel status` | Show worker state and progress |
| `/sf parallel stop [MID]` | Stop workers |
| `/sf parallel pause [MID]` | Pause workers |
| `/sf parallel resume [MID]` | Resume workers |
| `/sf parallel merge [MID]` | Merge completed milestones |

## Workflow Templates

| Command | Description |
|---------|-------------|
| `/sf start` | Start a workflow template |
| `/sf start resume` | Resume an in-progress workflow |
| `/sf templates` | List available templates |
| `/sf templates info <name>` | Show template details |

## Custom Workflows

| Command | Description |
|---------|-------------|
| `/sf workflow new` | Create a workflow definition |
| `/sf workflow run <name>` | Start a workflow run |
| `/sf workflow list` | List workflow runs |
| `/sf workflow validate <name>` | Validate a workflow YAML |
| `/sf workflow pause` | Pause workflow auto-mode |
| `/sf workflow resume` | Resume paused workflow |

## Extensions

| Command | Description |
|---------|-------------|
| `/sf extensions list` | List all extensions |
| `/sf extensions enable <id>` | Enable an extension |
| `/sf extensions disable <id>` | Disable an extension |
| `/sf extensions info <id>` | Show extension details |

## GitHub Sync

| Command | Description |
|---------|-------------|
| `/github-sync bootstrap` | Initial GitHub sync setup |
| `/github-sync status` | Show sync mapping counts |

## Session Management

| Command | Description |
|---------|-------------|
| `/clear` | Start a new session |
| `/exit` | Graceful shutdown |
| `/model` | Switch the active model |
| `/login` | Log in to an LLM provider |
| `/thinking` | Toggle thinking level |
| `/voice` | Toggle speech-to-text |
| `/worktree` (`/wt`) | Git worktree management |

## In-Session Update

```
/sf update
```

Checks npm for a newer version and installs it without leaving the session.
