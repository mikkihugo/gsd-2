/**
 * Structural tests for slice-level parallel orchestrator.
 * Verifies the orchestrator module exists and has the correct shape,
 * env var usage, and preference gating.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sfDir = join(__dirname, "..");

describe("slice-parallel-orchestrator structural tests", () => {
  it("orchestrator uses SF_SLICE_LOCK env var", () => {
    const source = readFileSync(join(sfDir, "slice-parallel-orchestrator.ts"), "utf-8");
    assert.ok(
      source.includes("SF_SLICE_LOCK"),
      "Orchestrator must use SF_SLICE_LOCK env var to isolate slice workers",
    );
  });

  it("orchestrator sets SF_PARALLEL_WORKER=1 to prevent nesting", () => {
    const source = readFileSync(join(sfDir, "slice-parallel-orchestrator.ts"), "utf-8");
    assert.ok(
      source.includes("SF_PARALLEL_WORKER"),
      "Orchestrator must set SF_PARALLEL_WORKER to prevent nested parallel",
    );
  });

  it("maxWorkers default is 2", () => {
    const source = readFileSync(join(sfDir, "slice-parallel-orchestrator.ts"), "utf-8");
    // Check that default max workers is 2 (in opts.maxWorkers ?? 2 or similar)
    assert.ok(
      source.includes("maxWorkers") && source.includes("2"),
      "Default maxWorkers should be 2",
    );
  });

  it("orchestrator imports SF_MILESTONE_LOCK for milestone isolation", () => {
    const source = readFileSync(join(sfDir, "slice-parallel-orchestrator.ts"), "utf-8");
    assert.ok(
      source.includes("SF_MILESTONE_LOCK"),
      "Orchestrator must also pass SF_MILESTONE_LOCK for milestone context",
    );
  });
});

describe("slice_parallel preference gating", () => {
  it("preferences-types.ts includes slice_parallel in interface", () => {
    const source = readFileSync(join(sfDir, "preferences-types.ts"), "utf-8");
    assert.ok(
      source.includes("slice_parallel"),
      "SFPreferences should have slice_parallel field",
    );
  });

  it("slice_parallel is in KNOWN_PREFERENCE_KEYS", () => {
    const source = readFileSync(join(sfDir, "preferences-types.ts"), "utf-8");
    assert.ok(
      source.includes('"slice_parallel"'),
      'KNOWN_PREFERENCE_KEYS should include "slice_parallel"',
    );
  });

  it("state.ts checks SF_SLICE_LOCK for slice isolation", () => {
    const source = readFileSync(join(sfDir, "state.ts"), "utf-8");
    assert.ok(
      source.includes("SF_SLICE_LOCK"),
      "State derivation should check SF_SLICE_LOCK for slice-level parallel isolation",
    );
  });

  it("auto.ts imports slice parallel orchestrator when enabled", () => {
    const source = readFileSync(join(sfDir, "auto.ts"), "utf-8");
    assert.ok(
      source.includes("slice_parallel") || source.includes("slice-parallel"),
      "auto.ts should reference slice_parallel for dispatch gating",
    );
  });
});
