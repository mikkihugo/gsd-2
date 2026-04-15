# Working in Teams

SF supports multi-user workflows where several developers work on the same repository concurrently.

## Quick Setup

The simplest way: set team mode in your project preferences.

```yaml
# .sf/PREFERENCES.md (committed to git)
---
version: 1
mode: team
---
```

This enables unique milestone IDs, push branches, pre-merge checks, and other team-appropriate defaults in one setting.

## What Team Mode Does

| Setting | Effect |
|---------|--------|
| `unique_milestone_ids` | IDs like `M001-eh88as` instead of `M001` — no collisions |
| `git.push_branches` | Milestone branches are pushed to remote |
| `git.pre_merge_check` | Validation runs before merging |

You can override individual settings on top of `mode: team`.

## Configure `.gitignore`

Share planning artifacts while keeping runtime files local:

```bash
# Runtime files (per-developer, gitignore these)
.sf/auto.lock
.sf/completed-units.json
.sf/STATE.md
.sf/metrics.json
.sf/activity/
.sf/runtime/
.sf/worktrees/
.sf/milestones/**/continue.md
.sf/milestones/**/*-CONTINUE.md
```

**What gets shared** (committed to git):
- `.sf/PREFERENCES.md` — project preferences
- `.sf/PROJECT.md` — living project description
- `.sf/REQUIREMENTS.md` — requirement contract
- `.sf/DECISIONS.md` — architectural decisions
- `.sf/milestones/` — roadmaps, plans, summaries, research

**What stays local** (gitignored):
- Lock files, metrics, state, activity logs, worktrees

## Commit the Config

```bash
git add .sf/PREFERENCES.md
git commit -m "chore: enable SF team workflow"
```

## Keeping `.sf/` Local

For teams where only some members use SF:

```yaml
git:
  commit_docs: false
```

This gitignores `.sf/` entirely. You get structured planning without affecting teammates.

## Parallel Development

Multiple developers can run auto mode simultaneously on different milestones. Each developer:

- Gets their own worktree (`.sf/worktrees/<MID>/`)
- Works on a unique `milestone/<MID>` branch
- Squash-merges to main independently

Milestone dependencies can be declared:

```yaml
# In M00X-CONTEXT.md frontmatter
---
depends_on: [M001-eh88as]
---
```

SF enforces that dependent milestones complete before starting downstream work.
