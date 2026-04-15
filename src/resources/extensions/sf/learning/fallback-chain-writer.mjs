/**
 * sf-learning: fallback-chain writer
 *
 * Writes per-unit-type runtime fallback chains into `~/.gsd/agent/settings.json`
 * under `fallback.chains.*`, so pi-ai's `FallbackResolver` has ONE entry per
 * active unit type to walk when a dispatch hits a 429 or other retryable
 * failure. Without this, the resolver reads an empty `chains` object and
 * immediately returns `null`, which surfaces as `"All providers exhausted"`
 * even when there are dozens of healthy providers available.
 *
 * ## Why this lives in the plugin, not in preferences.md
 *
 * `~/.gsd/preferences.md` tells sf which model to START a unit with — it
 * feeds `before_model_select`, which this plugin already intercepts. But
 * once dispatch begins and the LLM call 429s, pi-ai's retry path reads
 * `~/.gsd/agent/settings.json` → `fallback.chains` directly via
 * `SettingsManager.getFallbackSettings()`. Those two configs are separate
 * pipelines. preferences.md never reaches the retry walker.
 *
 * The plugin owns this file because:
 *   1. Rankings are dynamic — Bayesian blended priors + observed outcomes
 *      change per session. A hand-edited static list in settings.json
 *      drifts from reality the moment learning accumulates new rows.
 *   2. The plugin already has the ranking data in-memory via
 *      `blendedRanking` — reusing it gives dispatch-path and retry-path
 *      the same ordering.
 *   3. Providers that 429 get demoted naturally: pi-ai marks them
 *      exhausted via `authStorage.markProviderExhausted()` and skips
 *      them for the rest of the session; the learning plugin then
 *      re-ranks on the next session start using observed failure rate.
 *
 * ## When chains take effect (one-session latency — intentional)
 *
 * `SettingsManager.load()` reads `settings.json` into an in-memory cache
 * at pi-ai boot (pi-coding-agent/src/core/settings-manager.ts). Extensions
 * fire `session_start` AFTER that load, so the plugin's write lands on
 * the next restart — NOT the current session. This is intentional:
 *
 *   - Each session wakes up with the ranking the previous session learned.
 *   - No in-memory settings mutation needed (pi-ai doesn't expose the
 *     settings manager to extension context — see
 *     `dist/core/extensions/types.d.ts:181-208` ExtensionContext fields).
 *   - A fresh install produces an empty chain block; after the first full
 *     session the chain is populated and all subsequent sessions benefit.
 *
 * The first-session gap is bridged by a static seed that ships with
 * settings.json (or that the user writes manually via the one-off python
 * bootstrap). After that, every session has up-to-date chains.
 *
 * If you need mid-session adaptive fallback, see pi-ai's
 * `authStorage.markProviderExhausted()` which handles within-session
 * demotion of failing providers — we don't duplicate that mechanism.
 *
 * ## Safety
 *
 * - Atomic write: tmp file + rename so a crashed write never truncates
 *   settings.json.
 * - Preserves every top-level key in settings.json; we only touch the
 *   `fallback` block.
 * - Errors are caught by the caller (index.mjs) — a failed chain write
 *   must never block plugin init.
 *
 * @module sf-learning/fallback-chain-writer
 */

import { readFileSync, writeFileSync, renameSync, existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cwd as getCwd } from "node:process";

import { blendedRanking } from "./bayesian-blender.mjs";
import { aggregateAllForUnitType } from "./outcome-aggregator.mjs";
import { computeUnitTypeScore } from "./loadCapabilityOverrides.mjs";
import primaryProviderChainEntries from "./data/primary-provider-chain.json" with { type: "json" };

const NEUTRAL_PRIOR_SCORE = 50;
const PRIORITY_STEP = 10;
const DEFAULT_CHAIN_NAME = "default";
const MAIN_CHAIN_NAME = "main";
const PROJECT_SETTINGS_SUBPATH = ".gsd/agent/settings.json";

/**
 * Compute blended ranking for a single unit type across every model we
 * know about (i.e. the union of model ids in `deps.overrides`).
 *
 * @param {string} unitType
 * @param {import("./hook-handler.mjs").HookDeps} deps
 * @returns {Array<{modelId: string, finalScore: number}>}
 */
function rankModelsForUnitType(unitType, deps) {
    const knownModels = Object.keys(deps.overrides ?? {});
    if (knownModels.length === 0) return [];

    const priorsByModel = {};
    for (const modelId of knownModels) {
        const score = computeUnitTypeScore(modelId, unitType, deps.overrides, deps.weights);
        priorsByModel[modelId] = score > 0 ? score : NEUTRAL_PRIOR_SCORE;
    }

    const observedStatsMap = aggregateAllForUnitType(deps.db, unitType, {
        rollingDays: deps.opts?.rollingDays,
    });
    const observedByModel = {};
    if (observedStatsMap && typeof observedStatsMap.entries === "function") {
        for (const [modelId, stats] of observedStatsMap.entries()) {
            observedByModel[modelId] = stats;
        }
    }

    return blendedRanking(knownModels, unitType, priorsByModel, observedByModel, {
        nPrior: deps.opts?.nPrior,
        ucbC: deps.opts?.ucbC,
        explorationEnabled: false, // fallback chains want deterministic order
    });
}

/**
 * Derive (provider, modelId) from a pi-ai model id. Supports both
 * "provider/model" and bare-id forms — bare ids are returned with a
 * null provider and must be resolved against the registered models.
 *
 * @param {string} fullModelId
 * @returns {{provider: string|null, model: string}}
 */
function splitProviderModel(fullModelId) {
    const slashIdx = fullModelId.indexOf("/");
    if (slashIdx === -1) {
        return { provider: null, model: fullModelId };
    }
    return {
        provider: fullModelId.slice(0, slashIdx),
        model: fullModelId.slice(slashIdx + 1),
    };
}

/**
 * Build a reverse lookup from bare model IDs to the list of (provider, model)
 * pairs in the user's enabledModels list. Used to expand benchmark entries
 * (which are keyed by bare model ID like `k2p5`, `glm-5`) into concrete
 * pi-ai FallbackChainEntry records.
 *
 * Example:
 *   enabledModels = ["kimi-coding/k2p5", "opencode-go/k2p5", "zai/glm-5"]
 *   →  { k2p5: [{provider:"kimi-coding", model:"k2p5"}, {provider:"opencode-go", model:"k2p5"}],
 *        glm-5: [{provider:"zai", model:"glm-5"}] }
 *
 * Matching is case-sensitive. Ollama-cloud style IDs with `:cloud` suffix
 * (`kimi-k2.5:cloud`) are also mapped — the bare benchmark ID for them is
 * typically `kimi-k2.5`, so we match on the pi-ai model ID prefix too.
 *
 * @param {string[]} enabledModels
 * @returns {Map<string, Array<{provider: string, model: string}>>}
 */
function buildBareIdReverseIndex(enabledModels) {
    const index = new Map();
    if (!Array.isArray(enabledModels)) return index;

    for (const entry of enabledModels) {
        if (typeof entry !== "string") continue;
        const slashIdx = entry.indexOf("/");
        if (slashIdx === -1) continue;
        const provider = entry.slice(0, slashIdx);
        const model = entry.slice(slashIdx + 1);
        const providerModel = { provider, model };

        // Primary index key: the exact pi-ai model id after the slash
        const primaryKey = model;
        if (!index.has(primaryKey)) index.set(primaryKey, []);
        index.get(primaryKey).push(providerModel);

        // Secondary index keys: stripped variant-suffix forms so benchmark
        // IDs like `kimi-k2.5` can match pi-ai ids like `kimi-k2.5:cloud`
        // or `minimax-m2.7` can match `minimax-m2.7:cloud`.
        const colonIdx = model.indexOf(":");
        if (colonIdx > 0) {
            const stripped = model.slice(0, colonIdx);
            if (stripped !== primaryKey) {
                if (!index.has(stripped)) index.set(stripped, []);
                index.get(stripped).push(providerModel);
            }
        }
    }
    return index;
}

/**
 * Read `enabledModels` from a settings.json file. Returns an empty array
 * on any failure — callers get no chains, not a crash.
 *
 * @param {string} settingsPath
 * @returns {string[]}
 */
function readEnabledModels(settingsPath) {
    if (!existsSync(settingsPath)) return [];
    try {
        const parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
        return Array.isArray(parsed?.enabledModels) ? parsed.enabledModels : [];
    } catch (_err) {
        return [];
    }
}

/**
 * Turn a ranked list of bare-or-prefixed model IDs into pi-ai
 * FallbackChainEntry records. For each rank position, emits one entry per
 * concrete (provider, model) pair that matches the benchmark key.
 *
 * - Pre-prefixed IDs (`kimi-coding/k2p5`) produce exactly one entry.
 * - Bare IDs (`k2p5`, `glm-5`) produce one entry per provider offering
 *   that model in `enabledModels` — so a model available via multiple
 *   providers automatically becomes multiple parallel fallback options
 *   at adjacent priorities.
 *
 * Priorities are `rankIndex * PRIORITY_STEP + expansionOffset`, so all
 * expansions of rank 0 come before any expansion of rank 1.
 *
 * Runtime demotion of failing providers is handled by pi-ai itself via
 * `authStorage.markProviderExhausted()`, and next-session re-ranking is
 * driven by observed-outcome statistics in the learning database.
 *
 * @param {Array<{modelId: string}>} ranked
 * @param {Map<string, Array<{provider: string, model: string}>>} bareIdIndex
 * @returns {Array<{provider: string, model: string, priority: number}>}
 */
function rankedToEntries(ranked, bareIdIndex) {
    const entries = [];
    ranked.forEach((entry, index) => {
        const basePriority = index * PRIORITY_STEP;
        const split = splitProviderModel(entry.modelId);

        if (split.provider) {
            // Already fully qualified
            entries.push({ provider: split.provider, model: split.model, priority: basePriority });
            return;
        }

        // Bare ID — expand via reverse index
        const matches = bareIdIndex?.get?.(entry.modelId) ?? [];
        if (matches.length === 0) return; // unknown model id — skip

        matches.forEach((pm, expansionIdx) => {
            entries.push({
                provider: pm.provider,
                model: pm.model,
                // Use expansionIdx as a sub-ordinal so a model with 3
                // provider sources gets priorities basePriority+0/+1/+2
                // — all still less than (index+1)*PRIORITY_STEP (=+10).
                priority: basePriority + expansionIdx,
            });
        });
    });
    return entries;
}

/**
 * Read settings.json, merge in new fallback chains, and atomically replace.
 *
 * @param {string} settingsPath - absolute path to ~/.gsd/agent/settings.json
 * @param {Record<string, Array>} chainsByName - map of chain name → entries
 */
function writeSettingsWithChains(settingsPath, chainsByName) {
    if (!existsSync(settingsPath)) {
        throw new Error(`settings.json not found at ${settingsPath}`);
    }
    const raw = readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(raw);

    if (!settings.fallback || typeof settings.fallback !== "object") {
        settings.fallback = {};
    }
    settings.fallback.enabled = true;
    settings.fallback.chains = chainsByName;

    const serialized = JSON.stringify(settings, null, 2) + "\n";
    const tmpPath = join(dirname(settingsPath), `.settings.json.tmp-${process.pid}`);
    writeFileSync(tmpPath, serialized, "utf8");
    renameSync(tmpPath, settingsPath);
}

/**
 * Build a generalist `default` chain from the per-unit-type rankings by
 * averaging each model's final score across every unit type where it
 * ranked. Models appearing in more unit types get a coverage bonus
 * (length / nUnitTypes) so a niche winner in one category doesn't beat
 * a consistent performer across all categories.
 *
 * This replaces the earlier "clone the subagent chain" approach, which
 * was task-blind: pinning a coding model via `/sf model` and then
 * dispatching `plan-slice` would yield fallbacks ranked by generalist
 * scores instead of planning-specific ones (combatant finding #3).
 *
 * @param {Record<string, Array<{modelId: string, finalScore: number}>>} rankedByUnitType
 * @returns {Array<{provider: string, model: string, priority: number}>}
 */
function buildGeneralistDefaultChain(rankedByUnitType, bareIdIndex) {
    const unitTypeCount = Object.keys(rankedByUnitType).length;
    if (unitTypeCount === 0) return [];

    /** @type {Map<string, {sum: number, count: number}>} */
    const aggregate = new Map();
    for (const ranked of Object.values(rankedByUnitType)) {
        for (const entry of ranked) {
            const bucket = aggregate.get(entry.modelId) ?? { sum: 0, count: 0 };
            bucket.sum += entry.finalScore;
            bucket.count += 1;
            aggregate.set(entry.modelId, bucket);
        }
    }

    const generalistRanking = [];
    for (const [modelId, { sum, count }] of aggregate.entries()) {
        const meanScore = sum / count;
        const coverageBonus = count / unitTypeCount;
        // Weighted score: mean * (0.7 + 0.3 * coverage) — heavy on raw
        // quality, modest on breadth, so a consistently-strong model
        // wins over a one-trick pony of equal mean score.
        const finalScore = meanScore * (0.7 + 0.3 * coverageBonus);
        generalistRanking.push({ modelId, finalScore });
    }
    generalistRanking.sort((a, b) => b.finalScore - a.finalScore);

    return rankedToEntries(generalistRanking, bareIdIndex);
}

/**
 * Resolve a filesystem path to its canonical form. Falls back to `resolve()`
 * when the path doesn't exist yet so the comparison is still meaningful for
 * non-existent files (e.g. a fresh global settings.json that hasn't been
 * written yet). Symlink resolution matters when `$HOME` or a project dir is
 * itself symlinked into place — without it, string equality misses the
 * collision and the shadow warning fires on the global file.
 *
 * @param {string} pathValue
 * @returns {string}
 */
function resolveCanonicalPath(pathValue) {
    const absolute = resolve(pathValue);
    try {
        return realpathSync(absolute);
    } catch {
        return absolute;
    }
}

/**
 * Check for a project-level `.gsd/agent/settings.json` in `cwd`.
 * pi-ai's settings manager deep-merges project settings over global,
 * so a project-level `fallback` block silently neutralizes the chains
 * this plugin writes globally (combatant finding #4).
 *
 * Bails out early when `cwd/.gsd/agent/settings.json` resolves to the same
 * canonical path as the global settings file — i.e. when sf is invoked
 * from `$HOME` and the "project-level" probe aliases the global file.
 * Without this guard, the plugin warns about its own writes shadowing
 * themselves (false positive; surfaced in user notifications 2026-04-15).
 *
 * @param {string} cwd
 * @param {string} globalSettingsPath — canonical path of the global settings file being written
 * @param {(msg: string) => void} [log]
 * @returns {{ path: string, shadowsFallback: boolean } | null}
 */
function detectProjectSettingsShadow(cwd, globalSettingsPath, log) {
    const projectSettingsPath = join(cwd, PROJECT_SETTINGS_SUBPATH);
    if (!existsSync(projectSettingsPath)) return null;

    if (resolveCanonicalPath(projectSettingsPath) === resolveCanonicalPath(globalSettingsPath)) {
        // Same file as the global target — not a shadowing project override.
        return null;
    }

    try {
        const parsed = JSON.parse(readFileSync(projectSettingsPath, "utf8"));
        const shadowsFallback =
            parsed && typeof parsed === "object" && parsed.fallback !== undefined;
        if (shadowsFallback) {
            log?.(
                `WARNING: project-level settings.json at ${projectSettingsPath} defines a 'fallback' block — ` +
                `it will deep-merge over the global chains this plugin writes. ` +
                `Remove the project-level 'fallback' block or move it to the global settings.`,
            );
        }
        return { path: projectSettingsPath, shadowsFallback };
    } catch (err) {
        log?.(`project settings at ${projectSettingsPath} is unreadable: ${err?.message ?? err}`);
        return null;
    }
}

/**
 * Compute and write runtime fallback chains for every unit type in the
 * plugin's weight config, plus a `default` chain that fans across all
 * unit types (used when the current model isn't in any unit-specific
 * chain — e.g. the user overrode the model via `/sf model`).
 *
 * Also checks for a project-level `.gsd/agent/settings.json` that might
 * silently shadow the global chains via pi-ai's deep-merge, and warns
 * via `deps.opts.log` when one is found.
 *
 * @param {string} settingsPath
 * @param {import("./hook-handler.mjs").HookDeps} deps
 * @returns {{chainsWritten: number, totalEntries: number, shadowWarning: boolean}}
 */
export function writeFallbackChains(settingsPath, deps) {
    const log = deps?.opts?.log;
    const unitTypes = Object.keys(deps.weights ?? {}).filter((k) => !k.startsWith("_"));
    if (unitTypes.length === 0) {
        return { chainsWritten: 0, totalEntries: 0, shadowWarning: false };
    }

    // Step 0: read enabledModels and build the bare-id → [providers] reverse
    // lookup. model-benchmarks.json uses bare ids (`k2p5`, `glm-5`) and every
    // pi-ai FallbackChainEntry requires a provider, so without this map every
    // ranking becomes an empty entry list. This was the "wrote 0 fallback
    // chain(s)" bug.
    const enabledModels = readEnabledModels(settingsPath);
    const bareIdIndex = buildBareIdReverseIndex(enabledModels);
    if (bareIdIndex.size === 0) {
        log?.(
            `fallback-chain-writer: enabledModels empty or unparseable at ${settingsPath} — ` +
            `no providers to bind benchmark model ids to; writing empty chains`,
        );
    }

    // Step 1: rank per unit type (used for both per-unit chains and
    // the generalist default chain).
    /** @type {Record<string, Array<{modelId: string, finalScore: number}>>} */
    const rankedByUnitType = {};
    for (const unitType of unitTypes) {
        const ranked = rankModelsForUnitType(unitType, deps);
        if (ranked.length > 0) rankedByUnitType[unitType] = ranked;
    }

    // Step 2: materialize pi-ai entry arrays.
    const chainsByName = {};
    let totalEntries = 0;
    for (const [unitType, ranked] of Object.entries(rankedByUnitType)) {
        const entries = rankedToEntries(ranked, bareIdIndex);
        if (entries.length === 0) continue;
        chainsByName[unitType] = entries;
        totalEntries += entries.length;
    }

    // Step 3: generalist default chain aggregated across unit types.
    const defaultEntries = buildGeneralistDefaultChain(rankedByUnitType, bareIdIndex);
    if (defaultEntries.length > 0) {
        chainsByName[DEFAULT_CHAIN_NAME] = defaultEntries;
    }

    // Step 3b: hardcoded `main` chain — three provider routes for the user's
    // primary model (Kimi K2.5). This is a provider-cover chain: every entry
    // serves the same underlying model via a different provider, so the
    // retry-handler can rotate past a 429'd provider without flipping to a
    // different model family. If all three routes exhaust, tasks running on
    // the main model fail (no cross-model fallback). Loaded from
    // `./data/primary-provider-chain.json` so the list is editable without
    // touching code.
    chainsByName[MAIN_CHAIN_NAME] = primaryProviderChainEntries;

    // Step 4: warn if a project-level settings.json will shadow us.
    const shadowInfo = detectProjectSettingsShadow(getCwd(), settingsPath, log);
    const shadowWarning = Boolean(shadowInfo?.shadowsFallback);

    // Step 5: atomic write to the global settings.json.
    writeSettingsWithChains(settingsPath, chainsByName);
    return {
        chainsWritten: Object.keys(chainsByName).length,
        totalEntries,
        shadowWarning,
    };
}
