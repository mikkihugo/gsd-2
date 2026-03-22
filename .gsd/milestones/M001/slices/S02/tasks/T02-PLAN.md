---
estimated_steps: 4
estimated_files: 2
skills_used:
  - test
---

# T02: Contract tests and full regression suite

**Slice:** S02 — Dev Engine Wrapper + Kill Switch
**Milestone:** M001

## Description

Write the contract test suite for the dev engine wrapper and kill switch, update the S01 contract tests to reflect the resolver's new behavior (no longer throws for `null`/`"dev"`), and run the full existing test suite (~214 files) to prove zero regressions.

The contract test file (`dev-engine-wrapper.test.ts`) tests `bridgeDispatchAction()` mapping, `DevWorkflowEngine` delegation, `DevExecutionPolicy` stubs, resolver routing, kill switch, and the `auto.ts` engine ID accessors. Some tests need a temp `.gsd/` directory with minimal milestone files to exercise `deriveState()`.

The S01 contract test file (`engine-interfaces-contract.test.ts`) has two tests in the "Resolver stub behavior" describe group that assert `resolveEngine()` throws for `null` and `"dev"` — these need updating because the resolver now returns real engines for those inputs.

## Steps

1. **Create `dev-engine-wrapper.test.ts`** with these test groups:
   - **`bridgeDispatchAction` mapping**: Test all three variants:
     - dispatch: input `{ action: "dispatch", unitType: "execute-task", unitId: "T01", prompt: "do stuff", matchedRule: "foo" }` → output has `action: "dispatch"` with `step.unitType === "execute-task"`, `step.unitId === "T01"`, `step.prompt === "do stuff"`
     - stop: input `{ action: "stop", reason: "done", level: "info", matchedRule: "bar" }` → output has `action: "stop"`, `reason: "done"`, `level: "info"`
     - skip: input `{ action: "skip", matchedRule: "baz" }` → output has `action: "skip"`
   - **`DevWorkflowEngine.engineId`**: assert equals `"dev"`
   - **`DevWorkflowEngine.deriveState()`**: create a temp dir with a minimal `.gsd/` structure (just enough for `deriveState` to return without error — an empty `.gsd/milestones/` dir suffices), call `deriveState()`, assert result has `phase` (string), `currentMilestoneId`, `activeSliceId`, `activeTaskId`, `isComplete` (boolean), `raw` fields
   - **`DevWorkflowEngine.reconcile()`**: for non-complete state (`isComplete: false`) returns `{ outcome: "continue" }`; for complete state (`isComplete: true`) returns `{ outcome: "milestone-complete" }`
   - **`DevWorkflowEngine.getDisplayMetadata()`**: returns object with `engineLabel`, `currentPhase`, `progressSummary`, `stepCount` fields
   - **`DevExecutionPolicy` stubs**: `verify()` returns `"continue"`, `selectModel()` returns `null`, `recover()` returns `{ outcome: "retry" }`, `closeout()` returns `{ committed: false, artifacts: [] }`, `prepareWorkspace()` resolves without error
   - **Resolver routing**: `resolveEngine({ activeEngineId: null })` returns `{ engine, policy }` with `engine.engineId === "dev"`; same for `{ activeEngineId: "dev" }`; `{ activeEngineId: "unknown" }` throws with message matching `/Unknown engine/`
   - **Kill switch**: set `process.env.GSD_ENGINE_BYPASS = "1"`, call `resolveEngine({ activeEngineId: null })`, assert throws with message matching `/bypassed/i`; clean up env var in `after()` or finally block
   - **auto.ts engine ID accessors**: import `setActiveEngineId`/`getActiveEngineId` from `../auto.ts`, verify round-trip: set `"dev"` then get returns `"dev"`, set `null` then get returns `null`

2. **Update `engine-interfaces-contract.test.ts`**
   - In the "Resolver stub behavior" describe group:
     - Change the test `"resolveEngine throws for null activeEngineId"` → `"resolveEngine returns dev engine for null activeEngineId"` — assert it does NOT throw, and the returned `engine.engineId === "dev"`
     - Change the test `"resolveEngine throws for non-null activeEngineId"` → `"resolveEngine returns dev engine for 'dev' activeEngineId"` — assert it does NOT throw, and `engine.engineId === "dev"`
     - Add a new test: `"resolveEngine throws for unknown activeEngineId"` — assert `resolveEngine({ activeEngineId: "custom-xyz" })` throws with `/Unknown engine/`

3. **Run the new contract tests**
   - `node --experimental-strip-types --test src/resources/extensions/gsd/tests/dev-engine-wrapper.test.ts`
   - `node --experimental-strip-types --test src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts`

4. **Run the full existing test suite** — `node --experimental-strip-types --test src/resources/extensions/gsd/tests/*.test.ts`
   - This is the R017 gate — must pass with 0 new failures
   - If any test fails, investigate whether the failure is caused by S02 changes or is a pre-existing flake

## Must-Haves

- [ ] `dev-engine-wrapper.test.ts` covers `bridgeDispatchAction` mapping (3 variants), `DevWorkflowEngine` (engineId, deriveState, reconcile, getDisplayMetadata), `DevExecutionPolicy` (all 5 stubs), resolver routing (null, dev, unknown), kill switch, and auto.ts accessors
- [ ] `engine-interfaces-contract.test.ts` updated — resolver tests reflect new behavior (returns engine, not throws)
- [ ] All new contract tests pass
- [ ] Full existing test suite passes with 0 new failures (R017)

## Verification

- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/dev-engine-wrapper.test.ts` — all tests pass
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts` — all tests pass (updated assertions)
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/*.test.ts` — full suite passes

## Inputs

- `src/resources/extensions/gsd/dev-workflow-engine.ts` — T01 output: `DevWorkflowEngine` class + `bridgeDispatchAction()` export
- `src/resources/extensions/gsd/dev-execution-policy.ts` — T01 output: `DevExecutionPolicy` class
- `src/resources/extensions/gsd/engine-resolver.ts` — T01 output: updated resolver with real routing
- `src/resources/extensions/gsd/auto.ts` — T01 output: `setActiveEngineId`/`getActiveEngineId` exports
- `src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts` — S01 test file to update

## Observability Impact

- **Test coverage signals**: Contract test file adds ~15 named tests that exercise every public surface of the dev engine wrapper layer — test names are descriptive enough to serve as a functional spec when read via `--test` reporter output.
- **Regression gate**: Full suite run (`*.test.ts`) is the R017 gate — a future agent can re-run this single glob to verify zero regressions after any change to engine-related files.
- **Failure visibility**: Each test uses `assert.throws` with regex matchers on error messages, so failure output includes both the expected pattern and the actual error — no silent swallowing.
- **Resolver behavior change**: The updated S01 contract tests document the new resolver semantics (returns engine instead of throwing for null/"dev") — a future agent reading the test file sees the current contract, not the stale S01 stub contract.

## Expected Output

- `src/resources/extensions/gsd/tests/dev-engine-wrapper.test.ts` — new file: comprehensive contract test suite
- `src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts` — modified: updated resolver assertions
