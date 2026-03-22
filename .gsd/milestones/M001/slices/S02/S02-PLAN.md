# S02: Dev Engine Wrapper + Kill Switch

**Goal:** Auto-mode runs through `DevWorkflowEngine` + `DevExecutionPolicy` wrappers that delegate to existing GSD logic; `GSD_ENGINE_BYPASS=1` skips the engine layer entirely.
**Demo:** `resolveEngine({ activeEngineId: null })` returns a working dev engine/policy pair; all ~214 existing test files pass unchanged; setting `GSD_ENGINE_BYPASS=1` causes `resolveEngine()` to throw with a descriptive bypass message.

## Must-Haves

- `DevWorkflowEngine` implements `WorkflowEngine` — `deriveState()` delegates to `state.ts`, `resolveDispatch()` delegates to `auto-dispatch.ts` with `bridgeDispatchAction()` mapping
- `DevExecutionPolicy` implements `ExecutionPolicy` — all five methods are safe stubs returning defaults
- `engine-resolver.ts` routes `null` and `"dev"` engine IDs to the dev engine/policy pair, throws for unknown IDs
- `GSD_ENGINE_BYPASS=1` causes `resolveEngine()` to throw with a descriptive message
- `auto.ts` exports `setActiveEngineId()` and `getActiveEngineId()` wrapping `s.activeEngineId`
- All existing auto-mode tests pass unchanged (R017 gate)

## Proof Level

- This slice proves: contract + integration (wrapper delegates correctly, resolver routes correctly, existing behavior is untouched)
- Real runtime required: yes (contract tests call real `deriveState` and `resolveDispatch` with temp directories)
- Human/UAT required: no

## Verification

- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/dev-engine-wrapper.test.ts` — all contract tests pass
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts` — S01 contract tests still pass (resolver behavior changed)
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/*.test.ts` — full test suite passes with 0 new failures

## Integration Closure

- Upstream surfaces consumed: `engine-types.ts`, `workflow-engine.ts`, `execution-policy.ts`, `engine-resolver.ts` (all from S01)
- New wiring introduced in this slice: `resolveEngine()` returns real dev engine pair instead of throwing; `auto.ts` exposes engine ID accessors
- What remains before the milestone is truly usable end-to-end: S04 modifies `phases.ts` to branch on `activeEngineId` and route through the engine interfaces; S03 provides YAML definitions and DAG graph

## Tasks

- [x] **T01: Implement DevWorkflowEngine, DevExecutionPolicy, resolver wiring, and auto.ts exports** `est:25m`
  - Why: Creates the four source files that make the dev engine available through the resolver, proving the S01 interfaces can be implemented and the existing code delegates correctly
  - Files: `src/resources/extensions/gsd/dev-workflow-engine.ts`, `src/resources/extensions/gsd/dev-execution-policy.ts`, `src/resources/extensions/gsd/engine-resolver.ts`, `src/resources/extensions/gsd/auto.ts`
  - Do: (1) Create `dev-workflow-engine.ts` implementing `WorkflowEngine` — `engineId: "dev"`, `deriveState()` delegates to `state.ts::deriveState()` and maps `GSDState` to `EngineState`, `resolveDispatch()` loads preferences and builds `DispatchContext` then delegates to `auto-dispatch.ts::resolveDispatch()` with `bridgeDispatchAction()` mapping the result, `reconcile()` returns `{ outcome: "continue" }` for non-complete state, `getDisplayMetadata()` maps GSD state to `DisplayMetadata`. (2) Create `dev-execution-policy.ts` implementing `ExecutionPolicy` — all stubs: `prepareWorkspace` is no-op, `selectModel` returns `null`, `verify` returns `"continue"`, `recover` returns `{ outcome: "retry" }`, `closeout` returns `{ committed: false, artifacts: [] }`. (3) Update `engine-resolver.ts` — import dev classes, check `GSD_ENGINE_BYPASS` first (throw if set), route `null`/`"dev"` to dev engine pair, throw for unknown IDs. (4) Add two one-line exports to `auto.ts`: `setActiveEngineId(id)` and `getActiveEngineId()` using `s.activeEngineId`.
  - Verify: `node --experimental-strip-types -e "import('./src/resources/extensions/gsd/engine-resolver.ts').then(m => { const r = m.resolveEngine({activeEngineId: null}); console.log(r.engine.engineId) })"` prints `"dev"`
  - Done when: all four files exist, resolver returns dev engine for `null`/`"dev"`, throws for bypass and unknown IDs

- [x] **T02: Contract tests and full regression suite** `est:20m`
  - Why: Proves the wrapper delegates correctly (contract tests) and that adding these files causes zero regressions in the existing ~214 test files (R017 gate)
  - Files: `src/resources/extensions/gsd/tests/dev-engine-wrapper.test.ts`, `src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts`
  - Do: (1) Create `dev-engine-wrapper.test.ts` with test groups: `bridgeDispatchAction()` maps dispatch/stop/skip variants correctly; `DevWorkflowEngine.engineId` equals `"dev"`; `DevWorkflowEngine.deriveState()` with a temp `.gsd/` directory returns an `EngineState` with expected fields; `DevWorkflowEngine.reconcile()` returns `{ outcome: "continue" }` for non-complete state; `DevExecutionPolicy` stubs return expected defaults; `resolveEngine({ activeEngineId: null })` returns `{ engine, policy }` with `engine.engineId === "dev"`; `resolveEngine({ activeEngineId: "dev" })` same; `resolveEngine({ activeEngineId: "unknown" })` throws; `GSD_ENGINE_BYPASS=1` causes `resolveEngine()` to throw with bypass message; `setActiveEngineId`/`getActiveEngineId` round-trip. (2) Update `engine-interfaces-contract.test.ts` — the S01 resolver tests expected "No engines registered" throws; now the resolver returns real engines for `null` and `"dev"` — update those two assertions to expect success instead of throws. (3) Run the full test suite and confirm 0 new failures.
  - Verify: `node --experimental-strip-types --test src/resources/extensions/gsd/tests/dev-engine-wrapper.test.ts` passes; `node --experimental-strip-types --test src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts` passes; full suite passes
  - Done when: all contract tests pass, S01 contract tests pass with updated resolver assertions, full test suite shows 0 new failures

## Files Likely Touched

- `src/resources/extensions/gsd/dev-workflow-engine.ts` (new)
- `src/resources/extensions/gsd/dev-execution-policy.ts` (new)
- `src/resources/extensions/gsd/engine-resolver.ts` (modify)
- `src/resources/extensions/gsd/auto.ts` (modify — add 2 exports)
- `src/resources/extensions/gsd/tests/dev-engine-wrapper.test.ts` (new)
- `src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts` (modify — update resolver assertions)

## Observability / Diagnostics

- **Engine resolution**: `resolveEngine()` throws with descriptive messages for bypass (`GSD_ENGINE_BYPASS=1`) and unknown engine IDs — error messages include the attempted engine ID and the bypass flag state.
- **Engine identity**: `engine.engineId` returns `"dev"` — inspectable at runtime via `resolveEngine({activeEngineId: null}).engine.engineId`.
- **Session state**: `getActiveEngineId()` / `setActiveEngineId()` expose the current engine ID on the session singleton; `AutoSession.toJSON()` already includes `activeEngineId` for diagnostic snapshots.
- **Display metadata**: `DevWorkflowEngine.getDisplayMetadata()` returns `engineLabel: "GSD Dev"` and a `progressSummary` string showing milestone/slice/task IDs — consumable by future dashboard surfaces.
- **Failure visibility**: If `deriveState()` or `resolveDispatch()` throws, the error propagates unmodified through the engine wrapper — no swallowed exceptions.
- **Redaction**: No secrets or user data flow through these surfaces; engine ID and phase metadata are safe to log.
