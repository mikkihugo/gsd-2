---
id: T03
parent: S03
milestone: M001
key_files:
  - src/resources/extensions/gsd/bootstrap/db-tools.ts
  - src/resources/extensions/gsd/prompts/replan-slice.md
  - src/resources/extensions/gsd/prompts/reassess-roadmap.md
  - src/resources/extensions/gsd/tests/prompt-contracts.test.ts
key_decisions:
  - Prompt updates position the DB-backed tool as canonical write path with direct file writes as degraded fallback — consistent with the pattern established for plan-slice and plan-milestone prompts
duration: ""
verification_result: passed
completed_at: 2026-03-23T16:36:49.549Z
blocker_discovered: false
---

# T03: Register gsd_replan_slice and gsd_reassess_roadmap tools in db-tools.ts, update prompts to name canonical tools, add prompt contract tests

**Register gsd_replan_slice and gsd_reassess_roadmap tools in db-tools.ts, update prompts to name canonical tools, add prompt contract tests**

## What Happened

Wired the two new handlers into the tool system and updated prompts to direct auto-mode dispatch through the canonical tool paths.

**Step 1 — Register `gsd_replan_slice` in `db-tools.ts`:** Added the full tool registration following the exact pattern of `gsd_plan_slice` — `ensureDbOpen()` guard, dynamic `import("../tools/replan-slice.js")`, call `handleReplanSlice(params, process.cwd())`, check for `error` in result, return structured `content`/`details` with `operation: "replan_slice"`. TypeBox schema mirrors `ReplanSliceParams` with all required fields including `updatedTasks` as `Type.Array(Type.Object({...}))` and `removedTaskIds` as `Type.Array(Type.String())`. Registered alias `gsd_slice_replan` → `gsd_replan_slice`. Description mentions structural enforcement of completed tasks. `promptGuidelines` describe the canonical name, alias, parameter list, and enforcement behavior.

**Step 2 — Register `gsd_reassess_roadmap` in `db-tools.ts`:** Same pattern. Dynamic import of `../tools/reassess-roadmap.js`, call `handleReassessRoadmap(params, process.cwd())`. TypeBox schema mirrors `ReassessRoadmapParams` with `sliceChanges` as a nested `Type.Object` containing `modified`, `added`, and `removed` arrays. Registered alias `gsd_roadmap_reassess` → `gsd_reassess_roadmap`.

**Step 3 — Update `replan-slice.md` prompt:** Added step 3 "Canonical write path — use `gsd_replan_slice`" before the existing file-write instructions, naming the tool and all its parameters, and explaining it as the canonical write path with structural enforcement. Repositioned existing file-write steps (4–5) as "Degraded fallback — direct file writes" with the condition "If the `gsd_replan_slice` tool is not available". Renumbered all subsequent steps. All existing hard constraints about completed tasks preserved.

**Step 4 — Update `reassess-roadmap.md` prompt:** Added `gsd_reassess_roadmap` as the canonical write path in both the "roadmap is still good" and "changes are needed" sections. Step 1 under changes needed is now "Canonical write path — use `gsd_reassess_roadmap`" with full parameter documentation. Step 2 is the degraded fallback, augmented with "when `gsd_reassess_roadmap` is available" on the bypass prohibition.

**Step 5 — Extend `prompt-contracts.test.ts`:** Added two new tests: "replan-slice prompt names gsd_replan_slice as canonical tool" asserts both the tool name and "canonical write path" text; "reassess-roadmap prompt names gsd_reassess_roadmap as canonical tool" does the same. Both tests pass alongside the existing 26 prompt contract tests (28 total).

## Verification

All slice-level verification checks pass:
- Prompt contract tests: 28/28 pass (including 2 new tool name assertions)
- Replan handler tests: 9/9 pass (no regressions from db-tools.ts changes)
- Reassess handler tests: 9/9 pass (no regressions)
- Full regression suite (plan-milestone, plan-slice, plan-task, markdown-renderer, rogue-file-detection): 25/25 pass
- Diagnostic grep: Both test files contain structured error payload assertions (1 each)
- grep -q checks: All 4 pass (gsd_replan_slice in prompt and db-tools, gsd_reassess_roadmap in prompt and db-tools)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/prompt-contracts.test.ts` | 0 | ✅ pass | 123ms |
| 2 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/replan-handler.test.ts` | 0 | ✅ pass | 324ms |
| 3 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/reassess-handler.test.ts` | 0 | ✅ pass | 314ms |
| 4 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/plan-milestone.test.ts src/resources/extensions/gsd/tests/plan-slice.test.ts src/resources/extensions/gsd/tests/plan-task.test.ts src/resources/extensions/gsd/tests/markdown-renderer.test.ts src/resources/extensions/gsd/tests/rogue-file-detection.test.ts` | 0 | ✅ pass | 676ms |
| 5 | `grep -c 'structured error payloads' src/resources/extensions/gsd/tests/replan-handler.test.ts src/resources/extensions/gsd/tests/reassess-handler.test.ts` | 0 | ✅ pass | 10ms |
| 6 | `grep -q 'gsd_replan_slice' src/resources/extensions/gsd/prompts/replan-slice.md` | 0 | ✅ pass | 5ms |
| 7 | `grep -q 'gsd_reassess_roadmap' src/resources/extensions/gsd/prompts/reassess-roadmap.md` | 0 | ✅ pass | 5ms |
| 8 | `grep -q 'gsd_replan_slice' src/resources/extensions/gsd/bootstrap/db-tools.ts` | 0 | ✅ pass | 5ms |
| 9 | `grep -q 'gsd_reassess_roadmap' src/resources/extensions/gsd/bootstrap/db-tools.ts` | 0 | ✅ pass | 5ms |


## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/bootstrap/db-tools.ts`
- `src/resources/extensions/gsd/prompts/replan-slice.md`
- `src/resources/extensions/gsd/prompts/reassess-roadmap.md`
- `src/resources/extensions/gsd/tests/prompt-contracts.test.ts`
