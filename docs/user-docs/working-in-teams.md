# Working in Teams

SF supports multi-user workflows where several developers work on the same repository concurrently.

## Setup

### 1. Set Team Mode

The simplest way to configure SF for team use is to set `mode: team` in your project preferences. This enables unique milestone IDs, push branches, and pre-merge checks in one setting:

```yaml
# .sf/PREFERENCES.md (project-level, committed to git)
---
version: 1
mode: team
---
```

This is equivalent to manually setting `unique_milestone_ids: true`, `git.push_branches: true`, `git.pre_merge_check: true`, and other team-appropriate defaults. You can still override individual settings — for example, adding `git.auto_push: true` on top of `mode: team` if your team prefers auto-push.

Alternatively, you can configure each setting individually without using a mode (see [Git Strategy](git-strategy.md) for details).

### 2. Configure `.gitignore`

Share planning artifacts (milestones, roadmaps, decisions) while keeping runtime files local:

```bash
# ── SF: Runtime / Ephemeral (per-developer, per-session) ──────
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
- Lock files, metrics, state cache, runtime records, worktrees, activity logs

### 3. Commit the Preferences

```bash
git add .sf/PREFERENCES.md
git commit -m "chore: enable SF team workflow"
```

## `commit_docs: false`

For teams where only some members use SF, or when company policy requires a clean repo:

```yaml
git:
  commit_docs: false
```

This adds `.sf/` to `.gitignore` entirely and keeps all artifacts local. The developer gets the benefits of structured planning without affecting teammates who don't use SF.

## Migrating an Existing Project

If you have an existing project with `.sf/` blanket-ignored:

1. Ensure no milestones are in progress (clean state)
2. Update `.gitignore` to use the selective pattern above
3. Add `unique_milestone_ids: true` to `.sf/PREFERENCES.md`
4. Optionally rename existing milestones to use unique IDs:
   ```
   I have turned on unique milestone ids, please update all old milestone
   ids to use this new format e.g. M001-abc123 where abc123 is a random
   6 char lowercase alpha numeric string. Update all references in all
   .sf file contents, file names and directory names. Validate your work
   once done to ensure referential integrity.
   ```
5. Commit

## Parallel Development

Multiple developers can run auto mode simultaneously on different milestones. Each developer:

- Gets their own worktree (`.sf/worktrees/<MID>/`, gitignored)
- Works on a unique `milestone/<MID>` branch
- Squash-merges to main independently

Milestone dependencies can be declared in `M00X-CONTEXT.md` frontmatter:

```yaml
---
depends_on: [M001-eh88as]
---
```

SF enforces that dependent milestones complete before starting downstream work.
