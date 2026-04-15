import test from "node:test";
import assert from "node:assert/strict";

import { validatePreferences } from "../preferences-validation.ts";

test("uok preferences validate nested flags and turn_action", () => {
  const input = {
    uok: {
      enabled: true,
      legacy_fallback: { enabled: false },
      gates: { enabled: true },
      model_policy: { enabled: true },
      execution_graph: { enabled: false },
      gitops: {
        enabled: true,
        turn_action: "status-only",
        turn_push: false,
      },
      audit_envelope: { enabled: true },
      planning_flow: { enabled: true },
    },
  };

  const result = validatePreferences(input as never);
  assert.equal(result.errors.length, 0);
  assert.equal(result.preferences.uok?.enabled, true);
  assert.equal(result.preferences.uok?.legacy_fallback?.enabled, false);
  assert.equal(result.preferences.uok?.gitops?.turn_action, "status-only");
  assert.equal(result.preferences.uok?.planning_flow?.enabled, true);
});

test("uok preferences reject invalid turn_action", () => {
  const result = validatePreferences({
    uok: {
      gitops: {
        turn_action: "push-everything",
      },
    },
  } as never);

  assert.ok(result.errors.some((e) => e.includes("uok.gitops.turn_action")));
});

test("uok preferences accept deprecated plan_v2 alias", () => {
  const result = validatePreferences({
    uok: {
      plan_v2: {
        enabled: true,
      },
    },
  } as never);

  assert.equal(result.preferences.uok?.planning_flow?.enabled, true);
});

test("uok preferences accept deprecated audit_unified alias", () => {
  const result = validatePreferences({
    uok: {
      audit_unified: {
        enabled: true,
      },
    },
  } as never);

  assert.equal(result.preferences.uok?.audit_envelope?.enabled, true);
});
