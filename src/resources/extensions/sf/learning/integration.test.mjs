/**
 * gsd-learning integration test.
 *
 * Exercises the full blend pipeline:
 * 1. Prior: model A scores higher on the unit type
 * 2. Observed: model A has many failures, model B has many successes
 * 3. Blended ranking: model B should win once samples accumulate
 *
 * Uses a mock pi (just an object with a hooks property) and an
 * in-memory fake db (array-backed).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    createBeforeModelSelectHandler,
    registerBeforeModelSelect,
} from "./hook-handler.mjs";
import { blendedRanking } from "./bayesian-blender.mjs";

/**
 * Fake in-memory db that mimics enough of better-sqlite3 for
 * outcome-recorder + outcome-aggregator to operate against array-backed rows.
 *
 * The aggregator runs SELECT ... GROUP BY model_id; rather than implementing a
 * SQL parser, we recognize each statement by regex and compute the aggregate
 * in JavaScript. This is sufficient for these tests and isolates them from a
 * real native dependency.
 */
function createFakeDb() {
    const rows = [];

    function aggregateGroupedRows(unitType, since) {
        const grouped = new Map();
        for (const row of rows) {
            if (row.unit_type !== unitType) continue;
            if (row.recorded_at <= since) continue;
            if (!grouped.has(row.model_id)) {
                grouped.set(row.model_id, []);
            }
            grouped.get(row.model_id).push(row);
        }

        const out = [];
        for (const [modelId, modelRows] of grouped.entries()) {
            const sample_count = modelRows.length;
            const successCount = modelRows.reduce((a, r) => a + r.succeeded, 0);
            const retriesSum = modelRows.reduce((a, r) => a + r.retries, 0);
            const blockerSum = modelRows.reduce((a, r) => a + r.blocker_discovered, 0);
            const escalatedSum = modelRows.reduce((a, r) => a + r.escalated, 0);

            const verifyRows = modelRows.filter((r) => r.verification_passed !== null);
            const verifySum = verifyRows.reduce((a, r) => a + r.verification_passed, 0);
            const verification_pass_rate =
                verifyRows.length > 0 ? verifySum / verifyRows.length : null;

            out.push({
                model_id: modelId,
                sample_count,
                success_rate: successCount / sample_count,
                avg_retries: retriesSum / sample_count,
                verification_pass_rate,
                blocker_rate: blockerSum / sample_count,
                escalation_rate: escalatedSum / sample_count,
                avg_duration_ms: 0,
                avg_tokens: 0,
                avg_cost_usd: 0,
            });
        }
        return out;
    }

    return {
        rows,
        exec: (_sql) => {
            // Schema bootstrap is a no-op for the fake.
        },
        prepare: (sql) => ({
            run: (...params) => {
                if (/INSERT INTO llm_task_outcomes/i.test(sql)) {
                    const [
                        model_id,
                        provider,
                        unit_type,
                        unit_id,
                        succeeded,
                        retries,
                        escalated,
                        verification_passed,
                        blocker_discovered,
                        duration_ms,
                        tokens_total,
                        cost_usd,
                        recorded_at,
                    ] = params;
                    rows.push({
                        model_id,
                        provider,
                        unit_type,
                        unit_id,
                        succeeded,
                        retries,
                        escalated,
                        verification_passed,
                        blocker_discovered,
                        duration_ms,
                        tokens_total,
                        cost_usd,
                        recorded_at,
                    });
                    return { changes: 1, lastInsertRowid: rows.length };
                }
                return { changes: 0 };
            },
            all: (...params) => {
                if (/GROUP BY model_id/i.test(sql)) {
                    const [unitType, since] = params;
                    return aggregateGroupedRows(unitType, since);
                }
                return [];
            },
            get: (..._params) => {
                if (/SELECT COUNT\(\*\) AS total/i.test(sql)) {
                    return { total: rows.length };
                }
                return null;
            },
        }),
    };
}

/**
 * Mock pi exposing the EventEmitter-style on/off shape that the hook handler
 * registers against by feature detection.
 */
function createMockPi() {
    const handlers = [];
    return {
        handlers,
        on: (event, handler) => {
            if (event === "before_model_select") handlers.push(handler);
        },
        off: (event, handler) => {
            if (event !== "before_model_select") return;
            const idx = handlers.indexOf(handler);
            if (idx >= 0) handlers.splice(idx, 1);
        },
        emitBeforeModelSelect: async (input) => {
            for (const h of handlers) {
                const result = await h(input);
                if (result?.modelId) return result;
            }
            return undefined;
        },
    };
}

test("blendedRanking: cold start prefers prior", () => {
    const priors = { "model-a": 80, "model-b": 50 };
    const observed = {};
    const result = blendedRanking(["model-a", "model-b"], "execute-task", priors, observed, {
        nPrior: 10,
        explorationEnabled: false,
    });
    assert.strictEqual(result[0].modelId, "model-a", "higher-prior model wins at cold start");
});

test("blendedRanking: observed dominates at high sample count", () => {
    const priors = { "model-a": 80, "model-b": 50 };
    const observed = {
        "model-a": {
            sample_count: 100,
            success_rate: 0.2,
            avg_retries: 3,
            verification_pass_rate: 0.3,
            blocker_rate: 0.4,
        },
        "model-b": {
            sample_count: 100,
            success_rate: 0.95,
            avg_retries: 0.2,
            verification_pass_rate: 0.92,
            blocker_rate: 0.02,
        },
    };
    const result = blendedRanking(["model-a", "model-b"], "execute-task", priors, observed, {
        nPrior: 10,
        explorationEnabled: false,
    });
    assert.strictEqual(
        result[0].modelId,
        "model-b",
        "observed signal flips the ranking after enough samples",
    );
});

test("hook handler: returns undefined when only 1 eligible model", async () => {
    const handler = createBeforeModelSelectHandler({
        db: createFakeDb(),
        overrides: {},
        weights: { "execute-task": { swe_bench: 1.0 } },
        benchmarks: {},
        opts: {},
    });
    const result = await handler({
        unitType: "execute-task",
        eligibleModels: ["model-a"],
        phaseConfig: {},
    });
    assert.strictEqual(result, undefined, "no ranking needed for single eligible");
});

test("hook handler: returns undefined when no weights for unit type", async () => {
    const handler = createBeforeModelSelectHandler({
        db: createFakeDb(),
        overrides: {},
        weights: {},
        benchmarks: {},
        opts: {},
    });
    const result = await handler({
        unitType: "unknown-unit",
        eligibleModels: ["model-a", "model-b"],
        phaseConfig: {},
    });
    assert.strictEqual(result, undefined);
});

test("hook handler: catches errors and returns undefined or a model id", async () => {
    const brokenDb = {
        prepare: () => {
            throw new Error("db boom");
        },
    };
    const handler = createBeforeModelSelectHandler({
        db: brokenDb,
        overrides: {},
        weights: { "execute-task": { swe_bench: 1.0 } },
        benchmarks: {},
        opts: {},
    });
    // Must not throw. Aggregator swallows db errors internally; the handler
    // therefore still produces a prior-only ranking. Either outcome is fine
    // (a returned modelId or undefined) — what matters is no exception.
    let threw = false;
    let result;
    try {
        result = await handler({
            unitType: "execute-task",
            eligibleModels: ["model-a", "model-b"],
            phaseConfig: {},
        });
    } catch (_err) {
        threw = true;
    }
    assert.strictEqual(threw, false, "handler survived db error without throwing");
    assert.ok(result === undefined || typeof result?.modelId === "string");
});

test("registerBeforeModelSelect: registers via pi.on() when available", () => {
    const pi = createMockPi();
    const deps = {
        db: createFakeDb(),
        overrides: {},
        weights: {},
        benchmarks: {},
        opts: {},
    };
    const unregister = registerBeforeModelSelect(pi, deps);
    assert.strictEqual(pi.handlers.length, 1, "handler registered");
    unregister();
    assert.strictEqual(pi.handlers.length, 0, "handler unregistered");
});

test("registerBeforeModelSelect: throws when pi exposes no compatible API", () => {
    const piWithNothing = {};
    assert.throws(
        () =>
            registerBeforeModelSelect(piWithNothing, {
                db: createFakeDb(),
                overrides: {},
                weights: {},
                benchmarks: {},
                opts: {},
            }),
        /before_model_select hook registration API/,
    );
});

test("end-to-end: blend picks observed-better model after recording outcomes", async () => {
    const db = createFakeDb();
    const now = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000;

    // Seed 30 outcomes: model-a fails most of the time, model-b succeeds.
    for (let i = 0; i < 30; i += 1) {
        db.rows.push({
            model_id: "model-a",
            provider: "test",
            unit_type: "execute-task",
            unit_id: `unit-${i}`,
            succeeded: 0,
            retries: 4,
            escalated: 1,
            verification_passed: 0,
            blocker_discovered: 1,
            duration_ms: 1000,
            tokens_total: 100,
            cost_usd: 0.01,
            recorded_at: now - ONE_HOUR_MS,
        });
        db.rows.push({
            model_id: "model-b",
            provider: "test",
            unit_type: "execute-task",
            unit_id: `unit-${i}`,
            succeeded: 1,
            retries: 0,
            escalated: 0,
            verification_passed: 1,
            blocker_discovered: 0,
            duration_ms: 1000,
            tokens_total: 100,
            cost_usd: 0.01,
            recorded_at: now - ONE_HOUR_MS,
        });
    }

    // Priors lean toward model-a (the "established" benchmark winner) so we
    // can confirm observed evidence reverses the choice. The override map
    // mirrors loadCapabilityOverrides()'s shape: a 7-dim profile object with
    // __benchmarks as a non-enumerable back-reference for computeUnitTypeScore.
    const overrides = {
        "model-a": {},
        "model-b": {},
    };
    Object.defineProperty(overrides["model-a"], "__benchmarks", {
        value: { swe_bench: 90 },
        enumerable: false,
    });
    Object.defineProperty(overrides["model-b"], "__benchmarks", {
        value: { swe_bench: 30 },
        enumerable: false,
    });

    const handler = createBeforeModelSelectHandler({
        db,
        overrides,
        weights: { "execute-task": { swe_bench: 1.0 } },
        benchmarks: {},
        opts: { explorationEnabled: false },
    });

    const result = await handler({
        unitType: "execute-task",
        eligibleModels: ["model-a", "model-b"],
        phaseConfig: {},
    });

    assert.ok(result, "handler returned a decision");
    assert.strictEqual(
        result.modelId,
        "model-b",
        "observed evidence (30 samples) overrides the prior favoring model-a",
    );
});
