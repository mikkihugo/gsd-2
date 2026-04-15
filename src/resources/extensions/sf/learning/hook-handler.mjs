/**
 * sf-learning: before_model_select hook handler
 *
 * Called by sf's auto-model-selection.js (line 121-141) before capability
 * scoring runs. If we return {modelId}, it overrides pi-ai's own dispatch
 * path — our Bayesian-blended ranking wins.
 *
 * ## Responsibilities
 * - Translate a `before_model_select` hook payload into a Bayesian-blended
 *   ranking over the eligible models for the unit type
 * - Decide whether to override (return {modelId}) or fall through (return
 *   undefined) so pi-ai's existing capability scoring still runs as fallback
 * - Never crash sf's dispatch path: any internal error is caught, logged,
 *   and translated into a fallthrough
 *
 * ## Fallthrough semantics
 * Return `undefined` whenever we lack the confidence (or the configuration)
 * to override the default path. Concretely:
 *   - fewer than 2 eligible models (nothing to rank)
 *   - no weight config for this unit type (we'd be guessing)
 *   - any thrown error inside the handler (defensive)
 *
 * In all of those cases pi-ai's existing capability scoring runs unmodified.
 *
 * ## Dependencies
 * - outcome-aggregator: rolling-window observed stats per (unit_type, model)
 * - bayesian-blender: pure ranking math
 * - loadCapabilityOverrides: per-(unit_type, model) prior score from benchmarks
 *
 * ## Side effects
 * - None on the database (read-only path). May call `deps.opts.log` once per
 *   invocation if a logger is supplied.
 *
 * @module sf-learning/hook-handler
 */

import { aggregateAllForUnitType } from "./outcome-aggregator.mjs";
import { blendedRanking } from "./bayesian-blender.mjs";
import { computeUnitTypeScore } from "./loadCapabilityOverrides.mjs";

const HOOK_EVENT_NAME = "before_model_select";
const MIN_ELIGIBLE_FOR_RANKING = 2;
const NEUTRAL_PRIOR_SCORE = 50;
const TOP_RANKED_INDEX = 0;

/**
 * @typedef {Object} HookDeps
 * @property {Object} db                - duck-typed SQLite db handle
 * @property {Object} overrides         - from loadCapabilityOverrides().overrides
 * @property {Object} weights           - from loadCapabilityOverrides().weights
 * @property {Object} benchmarks        - from loadCapabilityOverrides().benchmarks
 * @property {Object} [opts]
 * @property {number} [opts.nPrior=10]
 * @property {number} [opts.ucbC=1.4]
 * @property {number} [opts.rollingDays=30]
 * @property {boolean} [opts.explorationEnabled=true]
 * @property {(msg: string) => void} [opts.log]
 */

/**
 * @typedef {Object} HookInput
 * @property {string}   unitType       - e.g. "execute-task"
 * @property {string[]} eligibleModels - candidate model ids
 * @property {Object}   [phaseConfig]  - per-phase configuration; .primary may bound the tier
 */

/**
 * Build the priors-by-model map used by `blendedRanking`. Falls back to a
 * neutral score (50) when the model has no overlap with the unit-type weights.
 *
 * @param {string[]} eligibleModels
 * @param {string}   unitType
 * @param {Object}   overrides
 * @param {Object}   weights
 * @returns {Object} { modelId: priorScore }
 */
function buildPriorsByModel(eligibleModels, unitType, overrides, weights) {
    const priors = {};
    for (const modelId of eligibleModels) {
        const score = computeUnitTypeScore(modelId, unitType, overrides, weights);
        // computeUnitTypeScore returns 0 when there's no benchmark/weight overlap.
        // Treat "no signal" as neutral (50) so a model without coverage isn't
        // unfairly buried below ones that do — the blender will lean on
        // observed evidence as samples accumulate.
        priors[modelId] = score > 0 ? score : NEUTRAL_PRIOR_SCORE;
    }
    return priors;
}

/**
 * Convert the Map returned by `aggregateAllForUnitType` into the plain
 * object shape `blendedRanking` expects.
 *
 * @param {Map<string, Object>} statsMap
 * @returns {Object} { modelId: AggregatedStats }
 */
function statsMapToObject(statsMap) {
    const obj = {};
    if (!statsMap || typeof statsMap.entries !== "function") {
        return obj;
    }
    for (const [modelId, stats] of statsMap.entries()) {
        obj[modelId] = stats;
    }
    return obj;
}

/**
 * Safely invoke an optional logger. A bad logger must not break the hook.
 *
 * @param {(msg: string) => void} [log]
 * @param {string} message
 */
function safeLog(log, message) {
    if (typeof log !== "function") return;
    try {
        log(message);
    } catch (_err) {
        // intentionally swallowed — logging must never break dispatch
    }
}

/**
 * Format the blended ranking decision for log output.
 *
 * @param {Array<{modelId: string, finalScore: number}>} ranked
 * @param {string} unitType
 * @returns {string}
 */
function formatDecisionLog(ranked, unitType) {
    if (ranked.length === 0) {
        return `[sf-learning] ${unitType}: no eligible models after ranking`;
    }
    const winner = ranked[TOP_RANKED_INDEX];
    const runnerUp = ranked[1];
    const summary = ranked
        .slice(0, 5)
        .map((entry) => `${entry.modelId}=${entry.finalScore.toFixed(1)}`)
        .join(", ");
    if (runnerUp) {
        return `[sf-learning] ${unitType}: blend picked ${winner.modelId} over ${runnerUp.modelId} (${summary})`;
    }
    return `[sf-learning] ${unitType}: blend picked ${winner.modelId} (${summary})`;
}

/**
 * Create a handler function to register on pi.emitBeforeModelSelect.
 *
 * @param {HookDeps} deps
 * @returns {(hookInput: HookInput) => Promise<{modelId: string} | undefined>}
 */
export function createBeforeModelSelectHandler(deps) {
    const opts = deps?.opts ?? {};
    const rollingDays = opts.rollingDays;
    const nPrior = opts.nPrior;
    const ucbC = opts.ucbC;
    const explorationEnabled = opts.explorationEnabled;
    const log = opts.log;

    return async function beforeModelSelectHandler(hookInput) {
        try {
            if (!hookInput || typeof hookInput !== "object") {
                return undefined;
            }

            const { unitType, eligibleModels } = hookInput;

            if (typeof unitType !== "string" || unitType.length === 0) {
                return undefined;
            }
            if (!Array.isArray(eligibleModels) || eligibleModels.length < MIN_ELIGIBLE_FOR_RANKING) {
                // Single (or zero) candidate — nothing to rank, fall through.
                return undefined;
            }

            const weights = deps?.weights ?? {};
            if (!weights[unitType]) {
                // No weight config for this unit type → we'd be ranking blindly.
                // Fall through to pi-ai's capability path instead of guessing.
                return undefined;
            }

            const overrides = deps?.overrides ?? {};
            const priorsByModel = buildPriorsByModel(eligibleModels, unitType, overrides, weights);

            const observedStatsMap = aggregateAllForUnitType(deps.db, unitType, {
                rollingDays,
            });
            const observedByModel = statsMapToObject(observedStatsMap);

            const ranked = blendedRanking(eligibleModels, unitType, priorsByModel, observedByModel, {
                nPrior,
                ucbC,
                explorationEnabled,
            });

            if (ranked.length === 0) {
                return undefined;
            }

            safeLog(log, formatDecisionLog(ranked, unitType));

            const winner = ranked[TOP_RANKED_INDEX];
            return { modelId: winner.modelId };
        } catch (err) {
            safeLog(
                log,
                `[sf-learning] hook handler error (falling through): ${err?.message ?? String(err)}`,
            );
            return undefined;
        }
    };
}

/**
 * Register the handler with pi. Returns an unregister function.
 *
 * pi-ai's exact API for `before_model_select` varies across versions. We
 * support three common shapes via feature detection, in priority order:
 *
 * 1. EventEmitter-style:    pi.on("before_model_select", handler)
 *                           → unregister via pi.off(...) / pi.removeListener(...)
 *
 * 2. Hook registry method:  pi.registerHook("before_model_select", handler)
 *                           → unregister via pi.unregisterHook(...) when present
 *
 * 3. Hook list property:    pi.hooks.beforeModelSelect.push(handler)
 *                           → unregister by splicing the array
 *
 * If pi exposes none of these we throw a clear error so the caller knows
 * to upgrade pi-ai or pin to a compatible version.
 *
 * @param {Object} pi - pi-ai instance with before_model_select hook support
 * @param {HookDeps} deps
 * @returns {() => void} unregister
 */
export function registerBeforeModelSelect(pi, deps) {
    if (!pi || typeof pi !== "object") {
        throw new Error("registerBeforeModelSelect: pi instance is required");
    }
    const handler = createBeforeModelSelectHandler(deps);

    // Shape 1: EventEmitter-style on/off
    if (typeof pi.on === "function") {
        pi.on(HOOK_EVENT_NAME, handler);
        return () => {
            if (typeof pi.off === "function") {
                pi.off(HOOK_EVENT_NAME, handler);
            } else if (typeof pi.removeListener === "function") {
                pi.removeListener(HOOK_EVENT_NAME, handler);
            }
        };
    }

    // Shape 2: explicit hook registry
    if (typeof pi.registerHook === "function") {
        pi.registerHook(HOOK_EVENT_NAME, handler);
        return () => {
            if (typeof pi.unregisterHook === "function") {
                pi.unregisterHook(HOOK_EVENT_NAME, handler);
            }
        };
    }

    // Shape 3: hooks property holding a list
    if (pi.hooks && Array.isArray(pi.hooks.beforeModelSelect)) {
        pi.hooks.beforeModelSelect.push(handler);
        return () => {
            const list = pi.hooks.beforeModelSelect;
            const idx = list.indexOf(handler);
            if (idx >= 0) list.splice(idx, 1);
        };
    }

    throw new Error(
        "pi-ai does not expose a before_model_select hook registration API compatible with this plugin — please check pi version (expected pi.on / pi.registerHook / pi.hooks.beforeModelSelect)",
    );
}
