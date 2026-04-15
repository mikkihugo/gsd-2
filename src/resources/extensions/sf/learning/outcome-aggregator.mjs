/**
 * gsd-learning: outcome-aggregator
 *
 * Reads `llm_task_outcomes` and computes rolling-window stats per
 * `(model_id, unit_type)` for the Bayesian blender.
 *
 * ## Responsibilities
 * - Aggregate observed outcomes over a configurable rolling window
 * - Provide per-model and grouped (per-unit-type) views
 * - Expose total-sample counts for UCB1 exploration math
 * - Surface raw recent rows for inspection / debugging
 *
 * ## Dependencies
 * - Duck-typed SQLite handle exposing `prepare(sql).get(...params)` and
 *   `prepare(sql).all(...params)`. Compatible with `better-sqlite3`.
 *
 * ## Contract
 * - All SQL is parameterized — no string interpolation of caller input.
 * - Returns zeroed stats (sample_count = 0) when no rows match, never null.
 * - `verification_pass_rate` is null when no row in the window had a
 *   non-null `verification_passed` value.
 *
 * @module gsd-learning/outcome-aggregator
 */

const DEFAULT_ROLLING_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AGGREGATE_ONE_SQL = `
    SELECT
        COUNT(*) AS sample_count,
        AVG(CAST(succeeded AS REAL)) AS success_rate,
        AVG(CAST(retries AS REAL)) AS avg_retries,
        AVG(CASE WHEN verification_passed IS NOT NULL THEN CAST(verification_passed AS REAL) END) AS verification_pass_rate,
        AVG(CAST(blocker_discovered AS REAL)) AS blocker_rate,
        AVG(CAST(escalated AS REAL)) AS escalation_rate,
        AVG(CAST(duration_ms AS REAL)) AS avg_duration_ms,
        AVG(CAST(tokens_total AS REAL)) AS avg_tokens,
        AVG(CAST(cost_usd AS REAL)) AS avg_cost_usd
    FROM llm_task_outcomes
    WHERE model_id = ?
      AND unit_type = ?
      AND recorded_at > ?
`;

const AGGREGATE_GROUPED_SQL = `
    SELECT
        model_id,
        COUNT(*) AS sample_count,
        AVG(CAST(succeeded AS REAL)) AS success_rate,
        AVG(CAST(retries AS REAL)) AS avg_retries,
        AVG(CASE WHEN verification_passed IS NOT NULL THEN CAST(verification_passed AS REAL) END) AS verification_pass_rate,
        AVG(CAST(blocker_discovered AS REAL)) AS blocker_rate,
        AVG(CAST(escalated AS REAL)) AS escalation_rate,
        AVG(CAST(duration_ms AS REAL)) AS avg_duration_ms,
        AVG(CAST(tokens_total AS REAL)) AS avg_tokens,
        AVG(CAST(cost_usd AS REAL)) AS avg_cost_usd
    FROM llm_task_outcomes
    WHERE unit_type = ?
      AND recorded_at > ?
    GROUP BY model_id
`;

const TOTAL_SAMPLES_SQL = `
    SELECT COUNT(*) AS total
    FROM llm_task_outcomes
    WHERE recorded_at > ?
`;

/**
 * Aggregated rolling-window stats for a (model_id, unit_type) pair.
 *
 * @typedef {Object} AggregatedStats
 * @property {string}      modelId
 * @property {string}      unitType
 * @property {number}      sample_count
 * @property {number}      success_rate            0.0 to 1.0
 * @property {number}      avg_retries
 * @property {number|null} verification_pass_rate  0.0 to 1.0 or null if no verification data
 * @property {number}      blocker_rate            0.0 to 1.0
 * @property {number}      escalation_rate         0.0 to 1.0
 * @property {number}      avg_duration_ms
 * @property {number}      avg_tokens
 * @property {number}      avg_cost_usd
 * @property {number}      window_days
 */

/**
 * Build a zeroed AggregatedStats record for cold-start callers.
 *
 * @param {string} modelId
 * @param {string} unitType
 * @param {number} windowDays
 * @returns {AggregatedStats}
 */
function emptyStats(modelId, unitType, windowDays) {
    return {
        modelId,
        unitType,
        sample_count: 0,
        success_rate: 0,
        avg_retries: 0,
        verification_pass_rate: null,
        blocker_rate: 0,
        escalation_rate: 0,
        avg_duration_ms: 0,
        avg_tokens: 0,
        avg_cost_usd: 0,
        window_days: windowDays,
    };
}

/**
 * Coerce a possibly-null SQL aggregate result to a number, defaulting to 0.
 *
 * @param {number|null|undefined} value
 * @returns {number}
 */
function toNumber(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return 0;
    return value;
}

/**
 * Compute the cutoff epoch-ms for the rolling window.
 *
 * @param {number} now         epoch ms
 * @param {number} rollingDays
 * @returns {number}
 */
function cutoff(now, rollingDays) {
    return now - rollingDays * MS_PER_DAY;
}

/**
 * Map a raw SQL aggregate row to AggregatedStats.
 *
 * @param {object} row
 * @param {string} modelId
 * @param {string} unitType
 * @param {number} windowDays
 * @returns {AggregatedStats}
 */
function rowToStats(row, modelId, unitType, windowDays) {
    return {
        modelId,
        unitType,
        sample_count: toNumber(row.sample_count),
        success_rate: toNumber(row.success_rate),
        avg_retries: toNumber(row.avg_retries),
        verification_pass_rate:
            row.verification_pass_rate === null || row.verification_pass_rate === undefined
                ? null
                : row.verification_pass_rate,
        blocker_rate: toNumber(row.blocker_rate),
        escalation_rate: toNumber(row.escalation_rate),
        avg_duration_ms: toNumber(row.avg_duration_ms),
        avg_tokens: toNumber(row.avg_tokens),
        avg_cost_usd: toNumber(row.avg_cost_usd),
        window_days: windowDays,
    };
}

/**
 * Aggregate outcomes for a single (model_id, unit_type) pair.
 *
 * @param {object} db
 * @param {string} modelId
 * @param {string} unitType
 * @param {{rollingDays?: number, now?: number}} [opts]
 * @returns {AggregatedStats}
 *
 * @example
 *   const stats = aggregateOutcomes(db, "kimi-coding/k2p5", "execute-task", {rollingDays: 30});
 *   // {modelId, unitType, sample_count: 12, success_rate: 0.83, ...}
 */
export function aggregateOutcomes(db, modelId, unitType, opts = {}) {
    const rollingDays = opts.rollingDays ?? DEFAULT_ROLLING_DAYS;
    const now = opts.now ?? Date.now();
    const since = cutoff(now, rollingDays);

    try {
        const row = db.prepare(AGGREGATE_ONE_SQL).get(modelId, unitType, since);
        if (!row || toNumber(row.sample_count) === 0) {
            return emptyStats(modelId, unitType, rollingDays);
        }
        return rowToStats(row, modelId, unitType, rollingDays);
    } catch (_err) {
        return emptyStats(modelId, unitType, rollingDays);
    }
}

/**
 * Aggregate outcomes for every model that has rows for a given unit type.
 *
 * Single SQL query with `GROUP BY model_id` for efficiency at dispatch time.
 *
 * @param {object} db
 * @param {string} unitType
 * @param {{rollingDays?: number, now?: number}} [opts]
 * @returns {Map<string, AggregatedStats>} keyed by `modelId`
 *
 * @example
 *   const ranking = aggregateAllForUnitType(db, "execute-task");
 *   for (const [modelId, stats] of ranking) {
 *     console.log(modelId, stats.success_rate);
 *   }
 */
export function aggregateAllForUnitType(db, unitType, opts = {}) {
    const rollingDays = opts.rollingDays ?? DEFAULT_ROLLING_DAYS;
    const now = opts.now ?? Date.now();
    const since = cutoff(now, rollingDays);
    const result = new Map();

    try {
        const rows = db.prepare(AGGREGATE_GROUPED_SQL).all(unitType, since);
        for (const row of rows) {
            result.set(row.model_id, rowToStats(row, row.model_id, unitType, rollingDays));
        }
    } catch (_err) {
        // swallow — return whatever was collected (likely empty Map)
    }

    return result;
}

/**
 * Total number of outcome rows in the rolling window. Used as the UCB1
 * exploration denominator (`ln(total_samples)`).
 *
 * @param {object} db
 * @param {{rollingDays?: number, now?: number}} [opts]
 * @returns {number}
 *
 * @example
 *   const total = totalSamples(db, {rollingDays: 30});
 */
export function totalSamples(db, opts = {}) {
    const rollingDays = opts.rollingDays ?? DEFAULT_ROLLING_DAYS;
    const now = opts.now ?? Date.now();
    const since = cutoff(now, rollingDays);

    try {
        const row = db.prepare(TOTAL_SAMPLES_SQL).get(since);
        return toNumber(row?.total);
    } catch (_err) {
        return 0;
    }
}

/**
 * Recent raw outcome rows for inspection / debugging. Ordered by
 * `recorded_at DESC`. Optional filters by `unitType` and/or `modelId`.
 *
 * @param {object} db
 * @param {{limit?: number, unitType?: string, modelId?: string}} [opts]
 * @returns {Array<object>}
 *
 * @example
 *   recentOutcomes(db, {limit: 20, unitType: "execute-task"});
 */
export function recentOutcomes(db, opts = {}) {
    const limit = opts.limit ?? 100;
    const filters = [];
    const params = [];

    if (opts.unitType) {
        filters.push("unit_type = ?");
        params.push(opts.unitType);
    }
    if (opts.modelId) {
        filters.push("model_id = ?");
        params.push(opts.modelId);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const sql = `
        SELECT
            id,
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
        FROM llm_task_outcomes
        ${where}
        ORDER BY recorded_at DESC
        LIMIT ?
    `;
    params.push(limit);

    try {
        return db.prepare(sql).all(...params);
    } catch (_err) {
        return [];
    }
}
