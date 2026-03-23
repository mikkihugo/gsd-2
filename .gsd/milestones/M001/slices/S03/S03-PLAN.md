# S03: replan_slice + reassess_roadmap with structural enforcement

**Goal:** `gsd_replan_slice` rejects mutations to completed tasks, `gsd_reassess_roadmap` rejects mutations to completed slices. Both write to DB tables (replan_history, assessments), render REPLAN.md/ASSESSMENT.md from DB, and re-render PLAN.md/ROADMAP.md after mutations.
**Demo:** Tests prove that calling replan with a completed task ID returns a structural rejection error, while modifying only incomplete tasks succeeds. Similarly, calling reassess with a completed slice ID returns a rejection error, while modifying only pending slices succeeds. Rendered REPLAN.md and ASSESSMENT.md artifacts exist on disk. Prompts name `gsd_replan_slice` and `gsd_reassess_roadmap` as the canonical tool paths.

## Must-Haves

- `handleReplanSlice` structurally rejects mutations (update or remove) to completed tasks
- `handleReplanSlice` writes `replan_history` row, applies task mutations, re-renders PLAN.md + task plans, renders REPLAN.md
- `handleReassessRoadmap` structurally rejects mutations (modify or remove) to completed slices
- `handleReassessRoadmap` writes `assessments` row, applies slice mutations, re-renders ROADMAP.md, renders ASSESSMENT.md
- Both handlers follow validate → enforce → transaction → render → invalidate pattern
- Both handlers invalidate state cache and parse cache after success
- `replan-slice.md` and `reassess-roadmap.md` prompts name the new tools as canonical write path
- Prompt contract tests assert tool name presence in both prompts
- DB helper functions: `insertReplanHistory()`, `insertAssessment()`, `deleteTask()`, `deleteSlice()`
- Renderers: `renderReplanFromDb()`, `renderAssessmentFromDb()`

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

```bash
# Primary proof — replan handler: validation, structural enforcement, DB writes, rendering
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/replan-handler.test.ts

# Primary proof — reassess handler: validation, structural enforcement, DB writes, rendering
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/reassess-handler.test.ts

# Prompt contracts — verify prompts reference new tool names
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/prompt-contracts.test.ts

# Full regression — existing tests still pass
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/plan-milestone.test.ts src/resources/extensions/gsd/tests/plan-slice.test.ts src/resources/extensions/gsd/tests/plan-task.test.ts src/resources/extensions/gsd/tests/markdown-renderer.test.ts src/resources/extensions/gsd/tests/rogue-file-detection.test.ts

# Diagnostic — verify structured error payloads name specific task/slice IDs in rejection messages
# (covered by replan-handler.test.ts "structured error payloads" and reassess-handler.test.ts equivalents)
grep -c "structured error payloads" src/resources/extensions/gsd/tests/replan-handler.test.ts src/resources/extensions/gsd/tests/reassess-handler.test.ts
```

## Observability / Diagnostics

- Runtime signals: Handler error payloads include structured rejection messages naming the specific completed task/slice IDs that blocked the mutation
- Inspection surfaces: `replan_history` and `assessments` DB tables can be queried directly; rendered REPLAN.md and ASSESSMENT.md artifacts on disk
- Failure visibility: Validation errors, structural rejection errors, render failures all return distinct `{ error: string }` payloads with actionable messages

## Integration Closure

- Upstream surfaces consumed: `gsd-db.ts` query functions (`getSliceTasks`, `getTask`, `getSlice`, `getMilestoneSlices`, `getMilestone`), `gsd-db.ts` mutation functions (`upsertTaskPlanning`, `upsertSlicePlanning`, `insertTask`, `insertSlice`, `transaction`), `markdown-renderer.ts` renderers (`renderPlanFromDb`, `renderRoadmapFromDb`, `writeAndStore` pattern), `files.ts` (`clearParseCache`), `state.ts` (`invalidateStateCache`)
- New wiring introduced in this slice: `tools/replan-slice.ts` and `tools/reassess-roadmap.ts` handler modules, tool registrations in `db-tools.ts`, prompt template references to `gsd_replan_slice` and `gsd_reassess_roadmap`
- What remains before the milestone is truly usable end-to-end: S04 hot-path caller migration, S05 flag file migration, S06 parser deprecation

## Tasks

- [x] **T01: Implement replan_slice handler with structural enforcement** `est:1h`
  - Why: Delivers R005 — the core replan handler that queries DB for completed tasks and structurally rejects mutations to them. Also adds required DB helpers (`insertReplanHistory`, `deleteTask`, `deleteSlice`) and the REPLAN.md renderer that all downstream work depends on.
  - Files: `src/resources/extensions/gsd/gsd-db.ts`, `src/resources/extensions/gsd/tools/replan-slice.ts`, `src/resources/extensions/gsd/markdown-renderer.ts`, `src/resources/extensions/gsd/tests/replan-handler.test.ts`
  - Do: (1) Add `insertReplanHistory()`, `insertAssessment()`, `deleteTask()`, `deleteSlice()` to `gsd-db.ts`. `deleteTask` must first delete from `verification_evidence` (FK constraint) before deleting the task row. `deleteSlice` must delete all child tasks' evidence, then child tasks, then the slice. (2) Add `renderReplanFromDb()` and `renderAssessmentFromDb()` to `markdown-renderer.ts` — both use `writeAndStore()` pattern. REPLAN.md should contain the blocker description, what changed, and the updated task list. ASSESSMENT.md should contain the verdict, assessment text, and slice changes. (3) Create `tools/replan-slice.ts` with `handleReplanSlice()`. Params: milestoneId, sliceId, blockerTaskId, blockerDescription, whatChanged, updatedTasks array (taskId, title, description, estimate, files, verify, inputs, expectedOutput), removedTaskIds array. Validate flat params. Query `getSliceTasks()` for completed tasks (status === 'complete' or 'done'). Reject if any updatedTasks[].taskId or removedTaskIds element matches a completed task. In transaction: write replan_history row, apply task mutations (upsert updated tasks via insertTask+upsertTaskPlanning, delete removed tasks), insert new tasks. After transaction: re-render PLAN.md via `renderPlanFromDb()`, render REPLAN.md via `renderReplanFromDb()`, invalidate caches. (4) Write `tests/replan-handler.test.ts` using `node:test` and the same pattern as `plan-slice.test.ts`. Tests must prove: validation failures, structural rejection of completed task update, structural rejection of completed task removal, successful replan modifying only incomplete tasks, replan_history row persistence, re-rendered PLAN.md correctness, REPLAN.md existence, cache invalidation via parse-visible state.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/replan-handler.test.ts`
  - Done when: All replan handler tests pass, including structural rejection of completed-task mutations and successful replan of incomplete tasks with DB persistence and rendered artifacts.

- [x] **T02: Implement reassess_roadmap handler with structural enforcement** `est:45m`
  - Why: Delivers R006 — the reassess handler that queries DB for completed slices and structurally rejects mutations to them. Reuses DB helpers from T01 and the ASSESSMENT.md renderer.
  - Files: `src/resources/extensions/gsd/tools/reassess-roadmap.ts`, `src/resources/extensions/gsd/tests/reassess-handler.test.ts`
  - Do: (1) Create `tools/reassess-roadmap.ts` with `handleReassessRoadmap()`. Params: milestoneId, completedSliceId (the slice that just finished), verdict, assessment (text), sliceChanges object with: modified array (sliceId, title, risk, depends, demo), added array (same shape), removed array (sliceId strings). Validate flat params. Query `getMilestoneSlices()` for completed slices (status === 'complete' or 'done'). Reject if any modified[].sliceId or removed[] element matches a completed slice. In transaction: write assessments row (path as PK = ASSESSMENT.md artifact path, milestone_id, status=verdict, scope='roadmap', full_content=assessment text), apply slice mutations (upsert modified via `upsertSlicePlanning`, insert added via `insertSlice`, delete removed via `deleteSlice`). After transaction: re-render ROADMAP.md via `renderRoadmapFromDb()`, render ASSESSMENT.md via `renderAssessmentFromDb()`, invalidate caches. (2) Write `tests/reassess-handler.test.ts` using `node:test`. Tests must prove: validation failures, structural rejection of completed slice modification, structural rejection of completed slice removal, successful reassess modifying only pending slices, assessments row persistence, re-rendered ROADMAP.md correctness, ASSESSMENT.md existence, cache invalidation.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/reassess-handler.test.ts`
  - Done when: All reassess handler tests pass, including structural rejection of completed-slice mutations and successful reassess with DB persistence and rendered artifacts.

- [x] **T03: Register tools in db-tools.ts + update prompts + prompt contract tests** `est:30m`
  - Why: Connects the handlers to the tool system so auto-mode dispatch can invoke them, and updates prompts to name the tools as canonical write paths. Extends prompt contract tests to catch regressions.
  - Files: `src/resources/extensions/gsd/bootstrap/db-tools.ts`, `src/resources/extensions/gsd/prompts/replan-slice.md`, `src/resources/extensions/gsd/prompts/reassess-roadmap.md`, `src/resources/extensions/gsd/tests/prompt-contracts.test.ts`
  - Do: (1) Register `gsd_replan_slice` in `db-tools.ts` following the exact pattern of `gsd_plan_slice` — ensureDbOpen check, dynamic import of `../tools/replan-slice.js`, call `handleReplanSlice(params, process.cwd())`, return structured content/details. TypeBox schema matches handler params. Register alias `gsd_slice_replan`. (2) Register `gsd_reassess_roadmap` with alias `gsd_roadmap_reassess` — same pattern, dynamic import of `../tools/reassess-roadmap.js`, call `handleReassessRoadmap(params, process.cwd())`. (3) Update `replan-slice.md` prompt: add a step before the existing file-write instructions that says to use `gsd_replan_slice` tool as the canonical write path when DB-backed tools are available. Position the existing file-write instructions as degraded fallback. Name the specific tool and its parameters. (4) Update `reassess-roadmap.md` prompt: similarly add `gsd_reassess_roadmap` as canonical path. The prompt already has "Do not bypass state with manual roadmap-only edits" — strengthen by naming the specific tool. (5) Add prompt contract tests in `prompt-contracts.test.ts`: assert `replan-slice.md` contains `gsd_replan_slice`, assert `reassess-roadmap.md` contains `gsd_reassess_roadmap`.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/prompt-contracts.test.ts`
  - Done when: Both tools are registered with aliases, both prompts name the canonical tools, and prompt contract tests pass.

## Files Likely Touched

- `src/resources/extensions/gsd/gsd-db.ts`
- `src/resources/extensions/gsd/markdown-renderer.ts`
- `src/resources/extensions/gsd/tools/replan-slice.ts` (new)
- `src/resources/extensions/gsd/tools/reassess-roadmap.ts` (new)
- `src/resources/extensions/gsd/bootstrap/db-tools.ts`
- `src/resources/extensions/gsd/prompts/replan-slice.md`
- `src/resources/extensions/gsd/prompts/reassess-roadmap.md`
- `src/resources/extensions/gsd/tests/replan-handler.test.ts` (new)
- `src/resources/extensions/gsd/tests/reassess-handler.test.ts` (new)
- `src/resources/extensions/gsd/tests/prompt-contracts.test.ts`
