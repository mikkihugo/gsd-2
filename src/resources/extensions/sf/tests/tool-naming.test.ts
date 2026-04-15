// tool-naming — Verifies canonical + alias tool registration for SF DB tools.
//
// Each DB tool must register under its canonical sf_concept_action name
// AND under a backward-compatible alias name.
// The alias must share the exact same execute function reference as the canonical tool.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerDbTools } from '../bootstrap/db-tools.ts';


// ─── Mock PI ──────────────────────────────────────────────────────────────────

function makeMockPi() {
  const tools: any[] = [];
  return {
    registerTool: (tool: any) => tools.push(tool),
    tools,
  } as any;
}

// ─── Rename map ───────────────────────────────────────────────────────────────

const RENAME_MAP: Array<{ canonical: string; alias: string }> = [
  { canonical: "sf_decision_save", alias: "sf_save_decision" },
  { canonical: "sf_requirement_update", alias: "sf_update_requirement" },
  { canonical: "sf_requirement_save", alias: "sf_save_requirement" },
  { canonical: "sf_summary_save", alias: "sf_save_summary" },
  { canonical: "sf_milestone_generate_id", alias: "sf_generate_milestone_id" },
  { canonical: "sf_task_complete", alias: "sf_complete_task" },
  { canonical: "sf_slice_complete", alias: "sf_complete_slice" },
  { canonical: "sf_plan_milestone", alias: "sf_milestone_plan" },
  { canonical: "sf_plan_slice", alias: "sf_slice_plan" },
  { canonical: "sf_plan_task", alias: "sf_task_plan" },
  { canonical: "sf_replan_slice", alias: "sf_slice_replan" },
  { canonical: "sf_reassess_roadmap", alias: "sf_roadmap_reassess" },
  { canonical: "sf_complete_milestone", alias: "sf_milestone_complete" },
  { canonical: "sf_validate_milestone", alias: "sf_milestone_validate" },
];

// ─── Registration count ──────────────────────────────────────────────────────

console.log('\n── Tool naming: registration count ──');

const pi = makeMockPi();
registerDbTools(pi);

assert.deepStrictEqual(pi.tools.length, 30, 'Should register exactly 30 tools (14 canonical + 14 aliases + 1 gate tool + 1 sf_skip_slice)');

// ─── Both names exist for each pair ──────────────────────────────────────────

console.log('\n── Tool naming: canonical and alias names exist ──');

for (const { canonical, alias } of RENAME_MAP) {
  const canonicalTool = pi.tools.find((t: any) => t.name === canonical);
  const aliasTool = pi.tools.find((t: any) => t.name === alias);

  assert.ok(canonicalTool !== undefined, `Canonical tool "${canonical}" should be registered`);
  assert.ok(aliasTool !== undefined, `Alias tool "${alias}" should be registered`);
}

// ─── Execute function identity ───────────────────────────────────────────────

console.log('\n── Tool naming: execute function identity (===) ──');

for (const { canonical, alias } of RENAME_MAP) {
  const canonicalTool = pi.tools.find((t: any) => t.name === canonical);
  const aliasTool = pi.tools.find((t: any) => t.name === alias);

  if (canonicalTool && aliasTool) {
    assert.ok(
      canonicalTool.execute === aliasTool.execute,
      `"${canonical}" and "${alias}" should share the same execute function reference`,
    );
  }
}

// ─── Alias descriptions include "(alias for ...)" ───────────────────────────

console.log('\n── Tool naming: alias descriptions ──');

for (const { canonical, alias } of RENAME_MAP) {
  const aliasTool = pi.tools.find((t: any) => t.name === alias);

  if (aliasTool) {
    assert.ok(
      aliasTool.description.includes(`alias for ${canonical}`),
      `Alias "${alias}" description should include "alias for ${canonical}"`,
    );
  }
}

// ─── Canonical tools have proper promptGuidelines ────────────────────────────

console.log('\n── Tool naming: canonical promptGuidelines use canonical name ──');

for (const { canonical } of RENAME_MAP) {
  const canonicalTool = pi.tools.find((t: any) => t.name === canonical);

  if (canonicalTool) {
    const guidelinesText = canonicalTool.promptGuidelines.join(' ');
    assert.ok(
      guidelinesText.includes(canonical),
      `Canonical tool "${canonical}" promptGuidelines should reference its own name`,
    );
  }
}

// ─── Alias promptGuidelines direct to canonical ──────────────────────────────

console.log('\n── Tool naming: alias promptGuidelines redirect to canonical ──');

for (const { canonical, alias } of RENAME_MAP) {
  const aliasTool = pi.tools.find((t: any) => t.name === alias);

  if (aliasTool) {
    const guidelinesText = aliasTool.promptGuidelines.join(' ');
    assert.ok(
      guidelinesText.includes(`Alias for ${canonical}`),
      `Alias "${alias}" promptGuidelines should say "Alias for ${canonical}"`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
