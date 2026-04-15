/**
 * discuss-tool-scoping.test.ts — Tests for #2949.
 *
 * xAI/Grok returns "Grammar is too complex" (400) when the combined tool
 * schemas exceed the provider's grammar limit. The SF discuss flow only
 * needs a small subset of tools (summary_save, decision_save, etc.), but
 * was sending ALL ~30+ tools to the provider.
 *
 * These tests verify:
 *   1. DISCUSS_TOOLS_ALLOWLIST is exported and contains only the tools
 *      needed during discuss flows (no heavy planning/execution/completion tools).
 *   2. Heavy execution tools are NOT in the allowlist.
 *   3. The allowlist includes the tools actually referenced by discuss prompts.
 *   4. dispatchWorkflow scopes tools when unitType is a discuss variant.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { DISCUSS_TOOLS_ALLOWLIST } from "../constants.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(__dirname, "..", "prompts");
const guidedFlowPath = join(__dirname, "..", "guided-flow.ts");

// ─── Heavy tools that should NOT be in discuss scope ─────────────────────────

/** Tools that are only needed during planning, execution, or completion phases */
const HEAVY_TOOLS = [
  "sf_plan_slice",
  "sf_slice_plan",
  "sf_plan_task",
  "sf_task_plan",
  "sf_task_complete",
  "sf_complete_task",
  "sf_slice_complete",
  "sf_complete_slice",
  "sf_complete_milestone",
  "sf_milestone_complete",
  "sf_validate_milestone",
  "sf_milestone_validate",
  "sf_replan_slice",
  "sf_slice_replan",
  "sf_reassess_roadmap",
  "sf_roadmap_reassess",
  "sf_save_gate_result",
];

// ─── Tools that discuss prompts reference ────────────────────────────────────

/** Tools explicitly called by discuss prompt templates */
const DISCUSS_REQUIRED_TOOLS = [
  "sf_summary_save",          // guided-discuss-slice.md, guided-discuss-milestone.md, discuss.md
  "sf_decision_save",         // discuss.md output phase
  "sf_plan_milestone",        // discuss.md output phase (single + multi milestone)
  "sf_milestone_generate_id", // discuss.md multi-milestone Phase 1
  "sf_requirement_update",    // used during discuss for requirement updates
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("discuss tool scoping (#2949)", () => {
  test("DISCUSS_TOOLS_ALLOWLIST is exported and non-empty", () => {
    assert.ok(Array.isArray(DISCUSS_TOOLS_ALLOWLIST), "should be an array");
    assert.ok(DISCUSS_TOOLS_ALLOWLIST.length > 0, "should not be empty");
  });

  test("DISCUSS_TOOLS_ALLOWLIST excludes heavy execution/completion tools", () => {
    for (const heavy of HEAVY_TOOLS) {
      assert.ok(
        !DISCUSS_TOOLS_ALLOWLIST.includes(heavy),
        `allowlist should NOT include heavy tool "${heavy}"`,
      );
    }
  });

  test("DISCUSS_TOOLS_ALLOWLIST includes tools referenced by discuss prompts", () => {
    for (const required of DISCUSS_REQUIRED_TOOLS) {
      assert.ok(
        DISCUSS_TOOLS_ALLOWLIST.includes(required),
        `allowlist should include "${required}" (used by discuss prompts)`,
      );
    }
  });

  test("DISCUSS_TOOLS_ALLOWLIST is significantly smaller than full tool set", () => {
    // Full set is 27 DB tools + dynamic + journal = 33+
    // Discuss set should be roughly 10 SF tools (5 canonical + 5 aliases)
    assert.ok(
      DISCUSS_TOOLS_ALLOWLIST.length <= 12,
      `allowlist should have at most 12 SF tools, got ${DISCUSS_TOOLS_ALLOWLIST.length}`,
    );
  });

  test("guided-discuss-slice.md references sf_summary_save", () => {
    const prompt = readFileSync(join(promptsDir, "guided-discuss-slice.md"), "utf-8");
    assert.ok(
      prompt.includes("sf_summary_save"),
      "guided-discuss-slice.md should reference sf_summary_save",
    );
  });

  test("discuss.md references sf_plan_milestone and sf_decision_save", () => {
    const prompt = readFileSync(join(promptsDir, "discuss.md"), "utf-8");
    assert.ok(
      prompt.includes("sf_plan_milestone"),
      "discuss.md should reference sf_plan_milestone",
    );
    assert.ok(
      prompt.includes("sf_decision_save"),
      "discuss.md should reference sf_decision_save",
    );
  });

  test("dispatchWorkflow source code scopes tools for discuss unit types", () => {
    const source = readFileSync(guidedFlowPath, "utf-8");
    // Verify that dispatchWorkflow references the allowlist for tool scoping
    assert.ok(
      source.includes("DISCUSS_TOOLS_ALLOWLIST"),
      "guided-flow.ts should reference DISCUSS_TOOLS_ALLOWLIST for tool scoping",
    );
    assert.ok(
      source.includes("setActiveTools"),
      "guided-flow.ts should call setActiveTools to scope tools during discuss",
    );
  });
});
