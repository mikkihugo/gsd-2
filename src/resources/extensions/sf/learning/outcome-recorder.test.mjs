/**
 * sf-learning: outcome-recorder + outcome-aggregator tests
 *
 * Uses node:test with a minimal in-memory fake `db` that mimics the
 * better-sqlite3 surface (`prepare(sql).run/get/all`, `exec`,
 * `transaction`). The fake parses just enough SQL to verify the
 * insert and aggregate semantics without spinning up real SQLite.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    validateOutcome,
    recordOutcome,
    recordOutcomeBatch,
    ensureSchema,
} from "./outcome-recorder.mjs";

import {
    aggregateOutcomes,
    aggregateAllForUnitType,
    totalSamples,
    recentOutcomes,
} from "./outcome-aggregator.mjs";

// ---------------------------------------------------------------------------
// Minimal in-memory fake of better-sqlite3
// ---------------------------------------------------------------------------

const INSERT_COLUMNS = [
    "model_id",
    "provider",
    "unit_type",
    "unit_id",
    "succeeded",
    "retries",
    "escalated",
    "verification_passed",
    "blocker_discovered",
    "duration_ms",
    "tokens_total",
    "cost_usd",
    "recorded_at",
];

function createFakeDb({ throwOnPrepare = false } = {}) {
    const rows = [];
    let nextId = 1;

    function prepare(sql) {
        if (throwOnPrepare) {
            throw new Error("simulated db.prepare failure");
        }
        const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

        if (normalized.startsWith("insert into llm_task_outcomes")) {
            return {
                run(...params) {
                    const row = { id: nextId++ };
                    INSERT_COLUMNS.forEach((col, i) => {
                        row[col] = params[i];
                    });
                    rows.push(row);
                    return { changes: 1, lastInsertRowid: row.id };
                },
            };
        }

        if (
            normalized.startsWith("select count(*) as sample_count") ||
            normalized.startsWith("select count(*) as total")
        ) {
            return {
                get(...params) {
                    return runAggregate(normalized, params, rows);
                },
            };
        }

        if (normalized.startsWith("select model_id, count(*) as sample_count")) {
            return {
                all(...params) {
                    return runGroupedAggregate(normalized, params, rows);
                },
            };
        }

        if (normalized.startsWith("select id, model_id")) {
            return {
                all(...params) {
                    return runRecentSelect(normalized, params, rows);
                },
            };
        }

        // CREATE TABLE / CREATE INDEX from ensureSchema fallback path
        if (normalized.startsWith("create table") || normalized.startsWith("create index")) {
            return { run() { return { changes: 0 }; } };
        }

        throw new Error(`fake db: unsupported sql: ${normalized.slice(0, 80)}`);
    }

    function exec(_sql) {
        // no-op — schema bootstrap success path
    }

    function transaction(fn) {
        return function wrapped(...args) {
            return fn(...args);
        };
    }

    return {
        prepare,
        exec,
        transaction,
        _rows: rows,
    };
}

function runAggregate(sql, params, rows) {
    if (sql.startsWith("select count(*) as total")) {
        const since = params[0];
        const filtered = rows.filter((r) => r.recorded_at > since);
        return { total: filtered.length };
    }

    // single-pair aggregate: model_id, unit_type, since
    const [modelId, unitType, since] = params;
    const filtered = rows.filter(
        (r) => r.model_id === modelId && r.unit_type === unitType && r.recorded_at > since,
    );
    return summarize(filtered);
}

function runGroupedAggregate(_sql, params, rows) {
    const [unitType, since] = params;
    const filtered = rows.filter((r) => r.unit_type === unitType && r.recorded_at > since);
    const byModel = new Map();
    for (const row of filtered) {
        if (!byModel.has(row.model_id)) byModel.set(row.model_id, []);
        byModel.get(row.model_id).push(row);
    }
    const out = [];
    for (const [modelId, modelRows] of byModel) {
        out.push({ model_id: modelId, ...summarize(modelRows) });
    }
    return out;
}

function summarize(rows) {
    if (rows.length === 0) {
        return {
            sample_count: 0,
            success_rate: null,
            avg_retries: null,
            verification_pass_rate: null,
            blocker_rate: null,
            escalation_rate: null,
            avg_duration_ms: null,
            avg_tokens: null,
            avg_cost_usd: null,
        };
    }
    const avg = (key, filterFn = null) => {
        const vals = rows
            .map((r) => r[key])
            .filter((v) => v !== null && v !== undefined && (filterFn ? filterFn(v) : true));
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    const verificationVals = rows
        .map((r) => r.verification_passed)
        .filter((v) => v !== null && v !== undefined);
    const verification_pass_rate =
        verificationVals.length === 0
            ? null
            : verificationVals.reduce((a, b) => a + b, 0) / verificationVals.length;

    return {
        sample_count: rows.length,
        success_rate: avg("succeeded"),
        avg_retries: avg("retries"),
        verification_pass_rate,
        blocker_rate: avg("blocker_discovered"),
        escalation_rate: avg("escalated"),
        avg_duration_ms: avg("duration_ms"),
        avg_tokens: avg("tokens_total"),
        avg_cost_usd: avg("cost_usd"),
    };
}

function runRecentSelect(sql, params, rows) {
    let limit = params[params.length - 1];
    let filtered = [...rows];

    // crude WHERE parser — match against remaining params in order of "?"
    const filterParams = params.slice(0, -1);
    let pi = 0;
    if (sql.includes("unit_type = ?")) {
        const unitType = filterParams[pi++];
        filtered = filtered.filter((r) => r.unit_type === unitType);
    }
    if (sql.includes("model_id = ?")) {
        const modelId = filterParams[pi++];
        filtered = filtered.filter((r) => r.model_id === modelId);
    }
    filtered.sort((a, b) => b.recorded_at - a.recorded_at);
    return filtered.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function minimalOutcome(overrides = {}) {
    return {
        modelId: "kimi-coding/k2p5",
        provider: "kimi-coding",
        unitType: "execute-task",
        unitId: "M001/S01/T01",
        succeeded: true,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// validateOutcome
// ---------------------------------------------------------------------------

test("validateOutcome rejects missing required fields", () => {
    const result = validateOutcome({ modelId: "x", provider: "y" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("unitType")));
    assert.ok(result.errors.some((e) => e.includes("unitId")));
    assert.ok(result.errors.some((e) => e.includes("succeeded")));
});

test("validateOutcome accepts minimal valid outcome", () => {
    const result = validateOutcome(minimalOutcome());
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
});

test("validateOutcome rejects non-object input", () => {
    assert.equal(validateOutcome(null).valid, false);
    assert.equal(validateOutcome("nope").valid, false);
});

test("validateOutcome rejects negative retries", () => {
    const result = validateOutcome(minimalOutcome({ retries: -1 }));
    assert.equal(result.valid, false);
});

// ---------------------------------------------------------------------------
// recordOutcome
// ---------------------------------------------------------------------------

test("recordOutcome returns true on valid outcome", () => {
    const db = createFakeDb();
    const ok = recordOutcome(db, minimalOutcome());
    assert.equal(ok, true);
    assert.equal(db._rows.length, 1);
});

test("recordOutcome returns false on invalid outcome", () => {
    const db = createFakeDb();
    const ok = recordOutcome(db, { modelId: "x" });
    assert.equal(ok, false);
    assert.equal(db._rows.length, 0);
});

test("recordOutcome returns false when db.prepare throws", () => {
    const db = createFakeDb({ throwOnPrepare: true });
    const ok = recordOutcome(db, minimalOutcome());
    assert.equal(ok, false);
});

test("recordOutcome coerces booleans to 0/1", () => {
    const db = createFakeDb();
    recordOutcome(
        db,
        minimalOutcome({
            succeeded: true,
            escalated: false,
            verification_passed: true,
            blocker_discovered: false,
        }),
    );
    const row = db._rows[0];
    assert.equal(row.succeeded, 1);
    assert.equal(row.escalated, 0);
    assert.equal(row.verification_passed, 1);
    assert.equal(row.blocker_discovered, 0);
});

test("recordOutcome preserves null verification_passed", () => {
    const db = createFakeDb();
    recordOutcome(db, minimalOutcome({ verification_passed: null }));
    assert.equal(db._rows[0].verification_passed, null);
});

test("recordOutcome defaults recorded_at to Date.now()", () => {
    const db = createFakeDb();
    const before = Date.now();
    recordOutcome(db, minimalOutcome());
    const after = Date.now();
    const ts = db._rows[0].recorded_at;
    assert.ok(ts >= before && ts <= after, `timestamp ${ts} outside [${before}, ${after}]`);
});

test("recordOutcome respects supplied recorded_at", () => {
    const db = createFakeDb();
    recordOutcome(db, minimalOutcome({ recorded_at: 12345 }));
    assert.equal(db._rows[0].recorded_at, 12345);
});

// ---------------------------------------------------------------------------
// recordOutcomeBatch
// ---------------------------------------------------------------------------

test("recordOutcomeBatch inserts multiple outcomes in one transaction", () => {
    const db = createFakeDb();
    const result = recordOutcomeBatch(db, [
        minimalOutcome({ unitId: "T01" }),
        minimalOutcome({ unitId: "T02" }),
        minimalOutcome({ unitId: "T03" }),
    ]);
    assert.deepEqual(result, { inserted: 3, skipped: 0 });
    assert.equal(db._rows.length, 3);
});

test("recordOutcomeBatch skips invalid rows but inserts valid ones", () => {
    const db = createFakeDb();
    const result = recordOutcomeBatch(db, [
        minimalOutcome({ unitId: "T01" }),
        { modelId: "broken" }, // missing required fields
        minimalOutcome({ unitId: "T02" }),
    ]);
    assert.deepEqual(result, { inserted: 2, skipped: 1 });
});

test("recordOutcomeBatch handles empty array", () => {
    const db = createFakeDb();
    const result = recordOutcomeBatch(db, []);
    assert.deepEqual(result, { inserted: 0, skipped: 0 });
});

// ---------------------------------------------------------------------------
// ensureSchema
// ---------------------------------------------------------------------------

test("ensureSchema returns true via db.exec path", () => {
    const db = createFakeDb();
    const ok = ensureSchema(db, "CREATE TABLE foo (x INTEGER);");
    assert.equal(ok, true);
});

test("ensureSchema returns false on empty input", () => {
    const db = createFakeDb();
    assert.equal(ensureSchema(db, ""), false);
    assert.equal(ensureSchema(db, null), false);
});

test("ensureSchema falls back to per-statement prepare when no exec()", () => {
    const db = createFakeDb();
    delete db.exec;
    const ok = ensureSchema(
        db,
        "CREATE TABLE foo (x INTEGER); CREATE INDEX idx_foo ON foo(x);",
    );
    assert.equal(ok, true);
});

// ---------------------------------------------------------------------------
// aggregateOutcomes
// ---------------------------------------------------------------------------

test("aggregateOutcomes returns zeros when no samples", () => {
    const db = createFakeDb();
    const stats = aggregateOutcomes(db, "ghost-model", "execute-task");
    assert.equal(stats.sample_count, 0);
    assert.equal(stats.success_rate, 0);
    assert.equal(stats.verification_pass_rate, null);
    assert.equal(stats.window_days, 30);
});

test("aggregateOutcomes computes success_rate correctly from multiple rows", () => {
    const db = createFakeDb();
    const now = Date.now();
    // 3 successes, 1 failure → 0.75
    recordOutcome(db, minimalOutcome({ succeeded: true, recorded_at: now - 1000 }));
    recordOutcome(db, minimalOutcome({ succeeded: true, recorded_at: now - 1000 }));
    recordOutcome(db, minimalOutcome({ succeeded: true, recorded_at: now - 1000 }));
    recordOutcome(db, minimalOutcome({ succeeded: false, recorded_at: now - 1000 }));

    const stats = aggregateOutcomes(db, "kimi-coding/k2p5", "execute-task", { now });
    assert.equal(stats.sample_count, 4);
    assert.equal(stats.success_rate, 0.75);
});

test("aggregateOutcomes excludes rows outside the rolling window", () => {
    const db = createFakeDb();
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    // inside window
    recordOutcome(db, minimalOutcome({ succeeded: true, recorded_at: now - oneDayMs }));
    // outside 30-day window
    recordOutcome(db, minimalOutcome({ succeeded: false, recorded_at: now - 60 * oneDayMs }));

    const stats = aggregateOutcomes(db, "kimi-coding/k2p5", "execute-task", { now, rollingDays: 30 });
    assert.equal(stats.sample_count, 1);
    assert.equal(stats.success_rate, 1);
});

test("aggregateOutcomes verification_pass_rate is null when no verification data", () => {
    const db = createFakeDb();
    const now = Date.now();
    recordOutcome(db, minimalOutcome({ verification_passed: null, recorded_at: now - 1000 }));
    const stats = aggregateOutcomes(db, "kimi-coding/k2p5", "execute-task", { now });
    assert.equal(stats.verification_pass_rate, null);
});

// ---------------------------------------------------------------------------
// aggregateAllForUnitType
// ---------------------------------------------------------------------------

test("aggregateAllForUnitType returns a Map keyed by modelId", () => {
    const db = createFakeDb();
    const now = Date.now();
    recordOutcome(db, minimalOutcome({ modelId: "model-a", succeeded: true, recorded_at: now - 1000 }));
    recordOutcome(db, minimalOutcome({ modelId: "model-a", succeeded: false, recorded_at: now - 1000 }));
    recordOutcome(db, minimalOutcome({ modelId: "model-b", succeeded: true, recorded_at: now - 1000 }));

    const ranking = aggregateAllForUnitType(db, "execute-task", { now });
    assert.ok(ranking instanceof Map);
    assert.equal(ranking.size, 2);
    assert.equal(ranking.get("model-a").sample_count, 2);
    assert.equal(ranking.get("model-a").success_rate, 0.5);
    assert.equal(ranking.get("model-b").sample_count, 1);
    assert.equal(ranking.get("model-b").success_rate, 1);
});

test("aggregateAllForUnitType returns empty Map when no rows", () => {
    const db = createFakeDb();
    const ranking = aggregateAllForUnitType(db, "ghost-unit");
    assert.equal(ranking.size, 0);
});

// ---------------------------------------------------------------------------
// totalSamples
// ---------------------------------------------------------------------------

test("totalSamples counts correctly across the rolling window", () => {
    const db = createFakeDb();
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    recordOutcome(db, minimalOutcome({ recorded_at: now - 1000 }));
    recordOutcome(db, minimalOutcome({ recorded_at: now - 5 * oneDayMs }));
    recordOutcome(db, minimalOutcome({ recorded_at: now - 60 * oneDayMs })); // outside

    assert.equal(totalSamples(db, { now, rollingDays: 30 }), 2);
});

// ---------------------------------------------------------------------------
// recentOutcomes
// ---------------------------------------------------------------------------

test("recentOutcomes returns rows ordered by recorded_at DESC", () => {
    const db = createFakeDb();
    recordOutcome(db, minimalOutcome({ unitId: "T01", recorded_at: 1000 }));
    recordOutcome(db, minimalOutcome({ unitId: "T02", recorded_at: 3000 }));
    recordOutcome(db, minimalOutcome({ unitId: "T03", recorded_at: 2000 }));

    const recent = recentOutcomes(db, { limit: 10 });
    assert.equal(recent.length, 3);
    assert.equal(recent[0].unit_id, "T02");
    assert.equal(recent[1].unit_id, "T03");
    assert.equal(recent[2].unit_id, "T01");
});

test("recentOutcomes respects limit and filters", () => {
    const db = createFakeDb();
    recordOutcome(db, minimalOutcome({ modelId: "a", unitType: "execute-task", recorded_at: 1000 }));
    recordOutcome(db, minimalOutcome({ modelId: "b", unitType: "execute-task", recorded_at: 2000 }));
    recordOutcome(db, minimalOutcome({ modelId: "a", unitType: "plan-slice", recorded_at: 3000 }));

    const filtered = recentOutcomes(db, { limit: 10, unitType: "execute-task", modelId: "a" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].model_id, "a");
    assert.equal(filtered[0].unit_type, "execute-task");
});
