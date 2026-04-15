/**
 * sf-learning: outcome-recorder
 *
 * Records LLM dispatch outcomes to the `llm_task_outcomes` table.
 *
 * ## Responsibilities
 * - Validate outcome shape before insertion
 * - Insert one or many outcomes via parameterized SQL
 * - Bootstrap the schema on a fresh database
 *
 * ## Contract — fire-and-forget
 * `recordOutcome` and `recordOutcomeBatch` must NEVER throw. They catch
 * every exception and return a boolean / count instead. This module sits
 * on the critical unit-completion path; a learning-system bug must not
 * crash a successful task.
 *
 * ## Dependencies
 * - Duck-typed SQLite handle exposing `prepare(sql).run(...params)`,
 *   `prepare(sql).get(...params)`, `prepare(sql).all(...params)` and
 *   ideally `exec(sql)`. Compatible with `better-sqlite3`.
 * - No hard import of any SQLite library — keeps this module standalone
 *   and unit-testable with an in-memory fake.
 *
 * ## Side effects
 * - Writes rows into `llm_task_outcomes`.
 *
 * @module sf-learning/outcome-recorder
 */

const REQUIRED_FIELDS = ["modelId", "provider", "unitType", "unitId", "succeeded"];

const INSERT_SQL = `
    INSERT INTO llm_task_outcomes (
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
        recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Validated outcome shape for insertion.
 *
 * @typedef {Object} Outcome
 * @property {string}        modelId               e.g. "kimi-coding/k2p5"
 * @property {string}        provider              e.g. "kimi-coding"
 * @property {string}        unitType              e.g. "research-slice", "execute-task"
 * @property {string}        unitId                e.g. "M001/S01" or "M001/S01/T01"
 * @property {boolean}       succeeded             did the unit complete without fatal error
 * @property {number}        [retries=0]           number of retries
 * @property {boolean}       [escalated=false]     whether tier escalated on failure
 * @property {boolean|null}  [verification_passed] null if no verification step
 * @property {boolean}       [blocker_discovered=false]
 * @property {number}        [duration_ms]
 * @property {number}        [tokens_total]
 * @property {number}        [cost_usd]
 * @property {number}        [recorded_at]         epoch ms; defaults to Date.now()
 */

/**
 * Validate an outcome object before insertion.
 *
 * @param {Outcome} outcome
 * @returns {{valid: boolean, errors: string[]}}
 *
 * @example
 *   const r = validateOutcome({modelId: "k2p5", provider: "kimi", unitType: "execute-task", unitId: "M001/S01/T01", succeeded: true});
 *   // r.valid === true
 */
export function validateOutcome(outcome) {
    const errors = [];

    if (outcome === null || typeof outcome !== "object") {
        return { valid: false, errors: ["outcome must be an object"] };
    }

    for (const field of REQUIRED_FIELDS) {
        if (outcome[field] === undefined || outcome[field] === null) {
            errors.push(`missing required field: ${field}`);
        }
    }

    if (outcome.modelId !== undefined && typeof outcome.modelId !== "string") {
        errors.push("modelId must be a string");
    }
    if (outcome.provider !== undefined && typeof outcome.provider !== "string") {
        errors.push("provider must be a string");
    }
    if (outcome.unitType !== undefined && typeof outcome.unitType !== "string") {
        errors.push("unitType must be a string");
    }
    if (outcome.unitId !== undefined && typeof outcome.unitId !== "string") {
        errors.push("unitId must be a string");
    }
    if (outcome.succeeded !== undefined && typeof outcome.succeeded !== "boolean") {
        errors.push("succeeded must be a boolean");
    }

    if (outcome.retries !== undefined && (!Number.isInteger(outcome.retries) || outcome.retries < 0)) {
        errors.push("retries must be a non-negative integer");
    }
    if (outcome.escalated !== undefined && typeof outcome.escalated !== "boolean") {
        errors.push("escalated must be a boolean");
    }
    if (
        outcome.verification_passed !== undefined &&
        outcome.verification_passed !== null &&
        typeof outcome.verification_passed !== "boolean"
    ) {
        errors.push("verification_passed must be a boolean or null");
    }
    if (outcome.blocker_discovered !== undefined && typeof outcome.blocker_discovered !== "boolean") {
        errors.push("blocker_discovered must be a boolean");
    }
    if (outcome.duration_ms !== undefined && (!Number.isFinite(outcome.duration_ms) || outcome.duration_ms < 0)) {
        errors.push("duration_ms must be a non-negative number");
    }
    if (outcome.tokens_total !== undefined && (!Number.isFinite(outcome.tokens_total) || outcome.tokens_total < 0)) {
        errors.push("tokens_total must be a non-negative number");
    }
    if (outcome.cost_usd !== undefined && (!Number.isFinite(outcome.cost_usd) || outcome.cost_usd < 0)) {
        errors.push("cost_usd must be a non-negative number");
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Coerce a boolean (or boolean-like) to SQLite 0/1.
 * Null/undefined pass through as null.
 *
 * @param {boolean|null|undefined} value
 * @returns {0|1|null}
 */
function boolToInt(value) {
    if (value === null || value === undefined) return null;
    return value ? 1 : 0;
}

/**
 * Build the positional parameter array for `INSERT_SQL`.
 *
 * @param {Outcome} outcome
 * @returns {Array}
 */
function buildInsertParams(outcome) {
    return [
        outcome.modelId,
        outcome.provider,
        outcome.unitType,
        outcome.unitId,
        boolToInt(outcome.succeeded),
        outcome.retries ?? 0,
        boolToInt(outcome.escalated ?? false),
        boolToInt(outcome.verification_passed ?? null),
        boolToInt(outcome.blocker_discovered ?? false),
        outcome.duration_ms ?? null,
        outcome.tokens_total ?? null,
        outcome.cost_usd ?? null,
        outcome.recorded_at ?? Date.now(),
    ];
}

/**
 * Record a single outcome. Fire-and-forget — never throws.
 *
 * @param {object}  db       Duck-typed SQLite handle (must expose `prepare(sql).run(...params)`)
 * @param {Outcome} outcome
 * @returns {boolean} true if inserted, false on validation or DB error
 *
 * @example
 *   recordOutcome(db, {
 *     modelId: "kimi-coding/k2p5",
 *     provider: "kimi-coding",
 *     unitType: "execute-task",
 *     unitId: "M001/S01/T01",
 *     succeeded: true,
 *     retries: 0,
 *     duration_ms: 12000,
 *   });
 */
export function recordOutcome(db, outcome) {
    try {
        const { valid } = validateOutcome(outcome);
        if (!valid) return false;

        const params = buildInsertParams(outcome);
        const stmt = db.prepare(INSERT_SQL);
        stmt.run(...params);
        return true;
    } catch (_err) {
        return false;
    }
}

/**
 * Record many outcomes in a single transaction. Fire-and-forget — never throws.
 *
 * Invalid rows are skipped and counted; valid rows are inserted. If the
 * database supports `transaction()` (better-sqlite3 style), the inserts run
 * inside it; otherwise they run sequentially.
 *
 * @param {object}    db        Duck-typed SQLite handle
 * @param {Outcome[]} outcomes
 * @returns {{inserted: number, skipped: number}}
 *
 * @example
 *   const r = recordOutcomeBatch(db, [outcome1, outcome2]);
 *   // {inserted: 2, skipped: 0}
 */
export function recordOutcomeBatch(db, outcomes) {
    const result = { inserted: 0, skipped: 0 };

    if (!Array.isArray(outcomes) || outcomes.length === 0) {
        return result;
    }

    try {
        const stmt = db.prepare(INSERT_SQL);

        const insertAll = () => {
            for (const outcome of outcomes) {
                const { valid } = validateOutcome(outcome);
                if (!valid) {
                    result.skipped += 1;
                    continue;
                }
                try {
                    stmt.run(...buildInsertParams(outcome));
                    result.inserted += 1;
                } catch (_err) {
                    result.skipped += 1;
                }
            }
        };

        if (typeof db.transaction === "function") {
            const txn = db.transaction(insertAll);
            txn();
        } else {
            insertAll();
        }
    } catch (_err) {
        // db.prepare itself failed — count remaining as skipped
        const remaining = outcomes.length - result.inserted - result.skipped;
        if (remaining > 0) result.skipped += remaining;
    }

    return result;
}

/**
 * Bootstrap the schema on a fresh database. Fire-and-forget — never throws.
 *
 * Uses `db.exec(sql)` if available (better-sqlite3 style) so multi-statement
 * DDL works in one call. Otherwise splits on `;` and runs each statement
 * via `db.prepare(stmt).run()`.
 *
 * @param {object} db        Duck-typed SQLite handle
 * @param {string} schemaSql Raw schema SQL (CREATE TABLE / CREATE INDEX ...)
 * @returns {boolean} true if schema applied, false on error
 *
 * @example
 *   import {readFileSync} from "node:fs";
 *   const sql = readFileSync(new URL("./outcome-schema.sql", import.meta.url), "utf8");
 *   ensureSchema(db, sql);
 */
export function ensureSchema(db, schemaSql) {
    if (typeof schemaSql !== "string" || schemaSql.length === 0) {
        return false;
    }
    try {
        if (typeof db.exec === "function") {
            db.exec(schemaSql);
            return true;
        }

        const statements = schemaSql
            .split(";")
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && !s.startsWith("--"));

        for (const stmt of statements) {
            db.prepare(stmt).run();
        }
        return true;
    } catch (_err) {
        return false;
    }
}
