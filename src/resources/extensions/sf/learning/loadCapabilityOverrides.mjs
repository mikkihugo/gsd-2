/**
 * loadCapabilityOverrides.mjs — Slice S01 of sf-learning.
 *
 * Loads model-benchmarks.json + unit-weights.json from src/data/ and synthesizes
 * the 7-dimension capability profile format pi-ai's MODEL_CAPABILITY_PROFILES uses.
 *
 * Dimensions (matching pi-ai's model-router.js):
 *   coding, debugging, research, reasoning, speed, longContext, instruction
 *
 * ## Mapping rationale (benchmark -> dimension)
 *
 * - coding:      SWE-bench is the canonical real-world coding benchmark (weight 1.0);
 *                LiveCodeBench is competitive coding (0.8); HumanEval is dated function
 *                synthesis (0.5).
 * - debugging:   SWE-bench Verified is the cleanest signal for debug-fix tasks (1.0);
 *                fall back to full SWE-bench (0.7); GPQA contributes as a general
 *                problem-solving proxy (0.3).
 * - research:    BrowseComp directly measures multi-hop web research (1.0); SimpleQA
 *                is factuality (0.7); GPQA contributes domain reasoning (0.3).
 * - reasoning:   GPQA is graduate-level scientific reasoning (1.0); HLE is the hardest
 *                public eval (0.8); AIME 2026 is math olympiad (0.8); BBH is the older
 *                multi-task reasoning suite (0.6); MMLU-Pro is broad knowledge (0.5).
 * - speed:       Inverse of model size category, hardcoded via DEFAULT_SPEED_TABLE.
 *                Benchmarks don't measure latency; we use parameter scale + naming
 *                conventions (flash/mini/small/nano vs pro/large/671b/480b/thinking).
 * - longContext: Blend of raw context_window (60%) and long_context_ruler (40%) when
 *                both are present. Falls back to whichever is available, or 0 if neither.
 *                Raw context is log2-scaled: ctx=2^12 (4K)->0, 2^17 (128K)->50,
 *                2^20 (1M)->80, 2^21 (2M)->90, clamped at 100. Rationale: architectural
 *                ctx max is a hard limit, so it's the primary signal; RULER refines it
 *                with quality-at-distance evidence when published.
 * - instruction: IFEval is the canonical instruction-following metric (1.0); Arena Elo
 *                normalized contributes user-preference signal (0.7); MMLU-Pro is a
 *                weak baseline (0.3).
 *
 * Where a benchmark is null, it is skipped and the effective denominator shrinks
 * proportionally (so a model with only SWE-bench still gets a coding score). If a
 * dimension has no benchmark data at all, it returns 0 (the blender will treat that
 * as "no signal" and lean on observed outcomes once they exist).
 *
 * No dependencies on pi-ai or sf internals. Reads only the two JSON files in src/data/.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BENCHMARKS_PATH = resolve(MODULE_DIRECTORY, "data/model-benchmarks.json");
const DEFAULT_WEIGHTS_PATH = resolve(MODULE_DIRECTORY, "data/unit-weights.json");

const META_KEY = "_meta";

// Arena Elo normalization range. LMSys arena scores cluster between ~900 (weakest
// models) and ~1450 (frontier). We map [900, 1450] -> [0, 100] linearly.
const ARENA_ELO_FLOOR = 900;
const ARENA_ELO_CEILING = 1450;
const ARENA_ELO_RANGE = ARENA_ELO_CEILING - ARENA_ELO_FLOOR;

// Context window normalization: log2-based scale mapping raw token counts to 0-100.
// At ctx=2^CTX_LOG2_FLOOR (4K), score = 0. Each doubling adds CTX_LOG2_STEP points.
// With floor=12 and step=10: 4K=0, 8K=10, 16K=20, ..., 128K=50, 256K=60, 1M=80, 2M=90.
const CTX_LOG2_FLOOR = 12;
const CTX_LOG2_STEP = 10;

// Blend weights for the longContext dimension when both raw ctx and the RULER
// benchmark are available. Raw ctx is the stronger signal (measures the hard
// architectural limit); RULER refines it with quality-at-distance measurement.
const LONG_CONTEXT_CTX_WEIGHT = 0.6;
const LONG_CONTEXT_RULER_WEIGHT = 0.4;

// Capability dimension scale: all dimensions normalized to 0-100.
const DIMENSION_SCALE_MAX = 100;
const DIMENSION_DEFAULT_WHEN_NO_DATA = 0;

/**
 * Speed lookup table: ordered list of regex -> speed score pairs. First match wins.
 * Speed cannot be derived from accuracy benchmarks, so we hardcode based on naming
 * conventions and parameter counts.
 *
 *   flash / mini / small / nano / 20b / 30b   -> 85-95 (fast)
 *   standard mid (no marker, ~70b-200b)        -> 55-70 (medium)
 *   pro / large / thinking / 397b+ / 480b+     -> 25-45 (slow)
 */
export const DEFAULT_SPEED_TABLE = [
    { pattern: /flashx/i, score: 95 },
    { pattern: /flash/i, score: 90 },
    { pattern: /nano/i, score: 92 },
    { pattern: /mini/i, score: 88 },
    { pattern: /\bsmall\b/i, score: 85 },
    { pattern: /:20b\b/i, score: 88 },
    { pattern: /:30b\b/i, score: 82 },
    { pattern: /thinking/i, score: 30 },
    { pattern: /:671b\b/i, score: 25 },
    { pattern: /:675b\b/i, score: 25 },
    { pattern: /:480b\b/i, score: 30 },
    { pattern: /:397b\b/i, score: 35 },
    { pattern: /:235b\b/i, score: 45 },
    { pattern: /:123b\b/i, score: 50 },
    { pattern: /:80b\b/i, score: 60 },
    { pattern: /\bpro\b/i, score: 35 },
    { pattern: /\blarge\b/i, score: 40 },
    { pattern: /medium/i, score: 65 },
];

const DEFAULT_SPEED_FALLBACK = 60;

/**
 * Per-dimension benchmark weight maps. Used by computeDimensionScores().
 * Each entry: { benchmark_key: weight }.
 */
const DIMENSION_WEIGHTS = {
    coding: {
        swe_bench: 1.0,
        live_code_bench: 0.8,
        human_eval: 0.5,
    },
    debugging: {
        swe_bench_verified: 1.0,
        swe_bench: 0.7,
        gpqa: 0.3,
    },
    research: {
        browse_comp: 1.0,
        simple_qa: 0.7,
        gpqa: 0.3,
    },
    reasoning: {
        gpqa: 1.0,
        hle: 0.8,
        aime_2026: 0.8,
        bbh: 0.6,
        mmlu_pro: 0.5,
    },
    longContext: {
        long_context_ruler: 1.0,
    },
    instruction: {
        instruction_following: 1.0,
        arena_elo_normalized: 0.7,
        mmlu_pro: 0.3,
    },
};

const SEVEN_DIMENSIONS = Object.freeze([
    "coding",
    "debugging",
    "research",
    "reasoning",
    "speed",
    "longContext",
    "instruction",
]);

/**
 * Strip provider prefix from a model id. `kimi-coding/k2p5` -> `k2p5`.
 *
 * @param {string} modelId
 * @returns {string}
 */
function stripProviderPrefix(modelId) {
    const slashIndex = modelId.indexOf("/");
    if (slashIndex === -1) {
        return modelId;
    }
    return modelId.slice(slashIndex + 1);
}

/**
 * Normalize a raw arena Elo into a 0-100 score. Returns null if input is null.
 *
 * @param {number|null} arenaElo
 * @returns {number|null}
 */
function normalizeArenaElo(arenaElo) {
    if (arenaElo === null || arenaElo === undefined) {
        return null;
    }
    const clamped = Math.min(Math.max(arenaElo, ARENA_ELO_FLOOR), ARENA_ELO_CEILING);
    return ((clamped - ARENA_ELO_FLOOR) / ARENA_ELO_RANGE) * DIMENSION_SCALE_MAX;
}

/**
 * Normalize a raw context_window (tokens) into a 0-100 score using log2 scaling.
 * Returns null if input is null/undefined/non-positive.
 *
 *   ctx=4096    (2^12) -> 0
 *   ctx=8192    (2^13) -> 10
 *   ctx=16384   (2^14) -> 20
 *   ctx=32768   (2^15) -> 30
 *   ctx=65536   (2^16) -> 40
 *   ctx=131072  (2^17) -> 50
 *   ctx=262144  (2^18) -> 60
 *   ctx=524288  (2^19) -> 70
 *   ctx=1048576 (2^20) -> 80
 *   ctx=2097152 (2^21) -> 90
 *   ctx>=8388608 (2^23+) -> 100 (clamped)
 *
 * @param {number|null|undefined} contextWindow - raw max input tokens
 * @returns {number|null} 0-100 score, or null if input is null/invalid
 */
export function normalizeContextWindow(contextWindow) {
    if (contextWindow === null || contextWindow === undefined || contextWindow <= 0) {
        return null;
    }
    const log2 = Math.log2(contextWindow);
    const rawScore = (log2 - CTX_LOG2_FLOOR) * CTX_LOG2_STEP;
    return Math.min(Math.max(rawScore, 0), DIMENSION_SCALE_MAX);
}

/**
 * Compute the longContext dimension score. Blends normalized raw context_window
 * with the long_context_ruler benchmark when both are available. Falls back to
 * whichever is present, or 0 if neither.
 *
 * Blend: longContext = LONG_CONTEXT_CTX_WEIGHT · ctx_score + LONG_CONTEXT_RULER_WEIGHT · ruler
 *
 * @param {object} benchmarks - per-model benchmark entry
 * @returns {number} 0-100 score
 */
export function computeLongContextDimension(benchmarks) {
    if (!benchmarks || typeof benchmarks !== "object") {
        return DIMENSION_DEFAULT_WHEN_NO_DATA;
    }
    const ctxScore = normalizeContextWindow(benchmarks.context_window);
    const rulerScore = benchmarks.long_context_ruler;
    const rulerValid = rulerScore !== null && rulerScore !== undefined;

    if (ctxScore !== null && rulerValid) {
        return ctxScore * LONG_CONTEXT_CTX_WEIGHT + rulerScore * LONG_CONTEXT_RULER_WEIGHT;
    }
    if (ctxScore !== null) {
        return ctxScore;
    }
    if (rulerValid) {
        return rulerScore;
    }
    return DIMENSION_DEFAULT_WHEN_NO_DATA;
}

/**
 * Compute a single dimension score: weighted average of available benchmarks.
 * Skips nulls and shrinks the denominator proportionally.
 *
 * @param {object} benchmarks - per-model benchmark entry
 * @param {object} weightMap - { benchmark_key: weight }
 * @returns {number} 0-100 score, or 0 if no benchmarks present
 */
function computeWeightedDimension(benchmarks, weightMap) {
    let weightedSum = 0;
    let effectiveMax = 0;

    for (const [benchmarkKey, weight] of Object.entries(weightMap)) {
        let value;
        if (benchmarkKey === "arena_elo_normalized") {
            value = normalizeArenaElo(benchmarks.arena_elo);
        } else {
            value = benchmarks[benchmarkKey];
        }
        if (value === null || value === undefined) {
            continue;
        }
        weightedSum += value * weight;
        effectiveMax += weight * DIMENSION_SCALE_MAX;
    }

    if (effectiveMax === 0) {
        return DIMENSION_DEFAULT_WHEN_NO_DATA;
    }
    return (weightedSum / effectiveMax) * DIMENSION_SCALE_MAX;
}

/**
 * Look up the speed score for a model id by matching against the speed table.
 *
 * @param {string} modelId
 * @param {Array<{pattern: RegExp, score: number}>} speedTable
 * @returns {number}
 */
function lookupSpeedScore(modelId, speedTable) {
    for (const entry of speedTable) {
        if (entry.pattern.test(modelId)) {
            return entry.score;
        }
    }
    return DEFAULT_SPEED_FALLBACK;
}

/**
 * Compute the 7-dimension capability profile for a single model.
 *
 * @param {object} benchmarks - per-model entry from model-benchmarks.json (minus _meta)
 * @param {string} [modelId=""] - used for speed lookup; pass the resolved id
 * @param {Array} [speedTable=DEFAULT_SPEED_TABLE]
 * @returns {{coding: number, debugging: number, research: number, reasoning: number, speed: number, longContext: number, instruction: number}}
 */
export function computeDimensionScores(benchmarks, modelId = "", speedTable = DEFAULT_SPEED_TABLE) {
    if (!benchmarks || typeof benchmarks !== "object") {
        return SEVEN_DIMENSIONS.reduce((acc, dim) => {
            acc[dim] = DIMENSION_DEFAULT_WHEN_NO_DATA;
            return acc;
        }, {});
    }

    return {
        coding: computeWeightedDimension(benchmarks, DIMENSION_WEIGHTS.coding),
        debugging: computeWeightedDimension(benchmarks, DIMENSION_WEIGHTS.debugging),
        research: computeWeightedDimension(benchmarks, DIMENSION_WEIGHTS.research),
        reasoning: computeWeightedDimension(benchmarks, DIMENSION_WEIGHTS.reasoning),
        speed: lookupSpeedScore(modelId, speedTable),
        longContext: computeLongContextDimension(benchmarks),
        instruction: computeWeightedDimension(benchmarks, DIMENSION_WEIGHTS.instruction),
    };
}

/**
 * Compute the unit-type-specific score for a model: dot product of unit-type weights
 * over the model's benchmark values, normalized by available-weight mass.
 *
 * Used for ranking candidates per unit type. Skips nulls and shrinks denominator.
 *
 * @param {string} modelId - may include provider prefix; will be stripped
 * @param {string} unitType - key into the weights map
 * @param {object} overrides - { modelId: dimensionProfile, ... } from loadCapabilityOverrides
 * @param {object} weights - parsed unit-weights.json
 * @returns {number} 0-100 score, or 0 if no overlap between weights and model benchmarks
 */
export function computeUnitTypeScore(modelId, unitType, overrides, weights) {
    if (!weights || typeof weights !== "object") {
        return 0;
    }
    const weightMap = weights[unitType];
    if (!weightMap || typeof weightMap !== "object") {
        return 0;
    }

    const resolvedId = stripProviderPrefix(modelId);
    const profileEntry = overrides && (overrides[modelId] || overrides[resolvedId]);
    if (!profileEntry) {
        return 0;
    }
    const benchmarks = profileEntry.__benchmarks;
    if (!benchmarks || typeof benchmarks !== "object") {
        return 0;
    }

    let weightedSum = 0;
    let effectiveMax = 0;
    for (const [benchmarkKey, weight] of Object.entries(weightMap)) {
        const value = benchmarks[benchmarkKey];
        if (value === null || value === undefined) {
            continue;
        }
        weightedSum += value * weight;
        effectiveMax += weight * DIMENSION_SCALE_MAX;
    }

    if (effectiveMax === 0) {
        return 0;
    }
    return (weightedSum / effectiveMax) * DIMENSION_SCALE_MAX;
}

/**
 * Read a JSON file from disk and parse it. Throws on parse errors with file context.
 *
 * @param {string} path
 * @returns {Promise<object>}
 */
async function readJsonFile(path) {
    const raw = await readFile(path, "utf8");
    try {
        return JSON.parse(raw);
    } catch (parseError) {
        throw new Error(`Failed to parse JSON file at ${path}: ${parseError.message}`);
    }
}

/**
 * Strip the _meta key from a parsed JSON object.
 *
 * @param {object} parsed
 * @returns {object}
 */
function stripMeta(parsed) {
    const { [META_KEY]: _meta, ...rest } = parsed;
    return rest;
}

/**
 * Load benchmark and weight JSONs and synthesize the capability override map.
 *
 * The returned `overrides` map has one entry per model in model-benchmarks.json.
 * Each entry is the 7-dimension profile plus a non-enumerable `__benchmarks` reference
 * to the raw benchmark block so computeUnitTypeScore() can re-score against per-unit
 * weight maps without re-reading the file.
 *
 * @param {object} [options]
 * @param {string} [options.benchmarksPath] - override default path
 * @param {string} [options.weightsPath] - override default path
 * @param {Array} [options.speedTable] - override DEFAULT_SPEED_TABLE
 * @returns {Promise<{overrides: object, weights: object, benchmarks: object}>}
 */
export async function loadCapabilityOverrides(options = {}) {
    const benchmarksPath = options.benchmarksPath ?? DEFAULT_BENCHMARKS_PATH;
    const weightsPath = options.weightsPath ?? DEFAULT_WEIGHTS_PATH;
    const speedTable = options.speedTable ?? DEFAULT_SPEED_TABLE;

    const [rawBenchmarks, rawWeights] = await Promise.all([
        readJsonFile(benchmarksPath),
        readJsonFile(weightsPath),
    ]);

    const benchmarks = stripMeta(rawBenchmarks);
    const overrides = {};

    for (const [modelId, modelBenchmarks] of Object.entries(benchmarks)) {
        const dimensionProfile = computeDimensionScores(modelBenchmarks, modelId, speedTable);
        // Attach the raw benchmarks reference so computeUnitTypeScore can use them
        // without re-reading the file. Defined as non-enumerable so JSON.stringify of
        // the override map produces the clean 7-dim shape pi-ai expects.
        Object.defineProperty(dimensionProfile, "__benchmarks", {
            value: modelBenchmarks,
            enumerable: false,
            writable: false,
            configurable: false,
        });
        overrides[modelId] = dimensionProfile;
    }

    return {
        overrides,
        weights: rawWeights,
        benchmarks: rawBenchmarks,
    };
}
