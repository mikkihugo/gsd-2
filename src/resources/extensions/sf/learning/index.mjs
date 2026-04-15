/**
 * sf-learning plugin — entry point
 *
 * Wires together the four S01-S04 modules into a single registerable plugin:
 *
 *   loadCapabilityOverrides → priors (per (unit_type, model))
 *   outcome-recorder        → write llm_task_outcomes rows
 *   outcome-aggregator      → rolling-window observed stats
 *   bayesian-blender        → α · prior + (1-α) · observed + UCB1
 *   hook-handler            → translates the above into a before_model_select handler
 *
 * ## Usage
 *
 *   import { init } from "./index.mjs";
 *   const plugin = await init(pi, {
 *     dbPath: "~/.sf/sf-learning.db",
 *     priorsPath: "./src/data/model-benchmarks.json",
 *     weightsPath: "./src/data/unit-weights.json",
 *     nPrior: 10,
 *     rollingDays: 30,
 *     explorationC: 1.4,
 *   });
 *
 *   // plugin.recordOutcome({...}) on unit completion
 *   // plugin.unregister() on tear down
 *
 * ## Side effects
 * - Opens (or creates) a SQLite database at the resolved dbPath
 * - Bootstraps the schema if absent
 * - Registers a hook on the supplied pi instance
 *
 * ## Errors
 * - Init failures are wrapped with a stage label so callers can see where
 *   things broke ("loading priors", "opening db", "applying schema",
 *   "registering hook")
 * - Once init succeeds, the running handler is fire-and-forget — it cannot
 *   crash the dispatch path
 *
 * @module sf-learning
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import { loadCapabilityOverrides } from "./loadCapabilityOverrides.mjs";
import { recordOutcome, ensureSchema } from "./outcome-recorder.mjs";
import { aggregateAllForUnitType } from "./outcome-aggregator.mjs";
import {
    createBeforeModelSelectHandler,
    registerBeforeModelSelect,
} from "./hook-handler.mjs";
import { writeFallbackChains } from "./fallback-chain-writer.mjs";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(MODULE_DIRECTORY, "outcome-schema.sql");
const DEFAULT_DB_PATH = "~/.sf/sf-learning.db";
const DEFAULT_N_PRIOR = 10;
const DEFAULT_ROLLING_DAYS = 30;
const DEFAULT_EXPLORATION_C = 1.4;
const HOME_REGEX = /^~(?=$|\/)/;

/**
 * @typedef {Object} PluginConfig
 * @property {string} [dbPath]              - default: ~/.sf/sf-learning.db
 * @property {string} [priorsPath]          - default: <plugin>/data/model-benchmarks.json
 * @property {string} [weightsPath]         - default: <plugin>/data/unit-weights.json
 * @property {number} [nPrior=10]
 * @property {number} [rollingDays=30]
 * @property {number} [explorationC=1.4]
 * @property {boolean} [explorationEnabled=true]
 * @property {Object} [db]                  - pre-opened db handle (overrides dbPath)
 * @property {(msg: string) => void} [log]
 */

/**
 * @typedef {Object} PluginInstance
 * @property {() => void}                   unregister
 * @property {(outcome: Object) => boolean} recordOutcome
 * @property {() => Promise<void>}          reloadPriors
 * @property {Object}                       deps
 */

/**
 * Expand a leading `~` to the user's home directory.
 *
 * @param {string} path
 * @returns {string}
 */
function expandPath(path) {
    if (typeof path !== "string") return path;
    return path.replace(HOME_REGEX, homedir());
}

/**
 * Load the outcome-schema SQL file. Read once at init time; cheap.
 *
 * @returns {string}
 */
function loadSchemaSql() {
    return readFileSync(SCHEMA_PATH, "utf8");
}

/**
 * Detect whether we're running under Bun. better-sqlite3 is a Node native
 * addon and Bun has not shipped compatibility yet (tracked upstream in
 * https://github.com/oven-sh/bun/issues/4290), so under Bun we use the
 * built-in `bun:sqlite` module instead — its Statement API (`prepare`,
 * `run`, `get`, `all`, `exec`, `transaction`) is a drop-in superset of the
 * surface this plugin consumes.
 *
 * @returns {boolean}
 */
function isBunRuntime() {
    return typeof globalThis.Bun !== "undefined";
}

/**
 * Dynamically import bun's built-in sqlite module. Only callable under Bun —
 * the import specifier `bun:sqlite` throws under Node.
 *
 * @returns {Promise<Function|null>}
 */
async function tryImportBunSqlite() {
    try {
        const mod = await import("bun:sqlite");
        return mod.Database ?? mod.default ?? null;
    } catch (_err) {
        return null;
    }
}

/**
 * Dynamically import better-sqlite3. Returns null if the package is not
 * installed so we can produce a clear error rather than an opaque module
 * resolution failure.
 *
 * @returns {Promise<Function|null>} the better-sqlite3 default export, or null
 */
async function tryImportBetterSqlite() {
    try {
        const mod = await import("better-sqlite3");
        return mod.default ?? mod;
    } catch (_err) {
        return null;
    }
}

/**
 * Open a database handle, either from the caller-supplied one or by
 * dynamically loading a sqlite binding. Prefers `bun:sqlite` when running
 * under Bun (better-sqlite3 is a Node native addon that Bun can't load),
 * and falls back to `better-sqlite3` everywhere else.
 *
 * @param {PluginConfig} config
 * @returns {Promise<Object>} duck-typed sqlite handle
 */
async function openDatabase(config) {
    if (config.db) {
        return config.db;
    }

    const dbPath = expandPath(config.dbPath ?? DEFAULT_DB_PATH);

    if (isBunRuntime()) {
        const BunDatabase = await tryImportBunSqlite();
        if (!BunDatabase) {
            throw new Error(
                "sf-learning is running under Bun but failed to import `bun:sqlite`. This module ships with Bun itself — if this fails the Bun install is broken.",
            );
        }
        return new BunDatabase(dbPath);
    }

    const Database = await tryImportBetterSqlite();
    if (!Database) {
        throw new Error(
            "sf-learning needs better-sqlite3 to open the outcomes database. Install it with `npm install better-sqlite3` or `bun add better-sqlite3`, or pass a pre-opened db handle via config.db.",
        );
    }

    return new Database(dbPath);
}

/**
 * Build the dependency bundle the hook handler consumes.
 *
 * @param {Object} db
 * @param {{overrides: Object, weights: Object, benchmarks: Object}} priors
 * @param {PluginConfig} config
 * @returns {import("./hook-handler.mjs").HookDeps}
 */
function buildHookDeps(db, priors, config) {
    return {
        db,
        overrides: priors.overrides,
        weights: priors.weights,
        benchmarks: priors.benchmarks,
        opts: {
            nPrior: config.nPrior ?? DEFAULT_N_PRIOR,
            ucbC: config.explorationC ?? DEFAULT_EXPLORATION_C,
            rollingDays: config.rollingDays ?? DEFAULT_ROLLING_DAYS,
            explorationEnabled: config.explorationEnabled !== false,
            log: config.log,
        },
    };
}

/**
 * Wrap a thrown error with a stage label so callers can see which init
 * step failed.
 *
 * @param {string} stage
 * @param {unknown} err
 * @returns {Error}
 */
function wrapInitError(stage, err) {
    const message = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(`sf-learning init failed at stage "${stage}": ${message}`);
    if (err instanceof Error && err.stack) {
        wrapped.stack = `${wrapped.message}\nCaused by: ${err.stack}`;
    }
    return wrapped;
}

/**
 * Initialize the plugin: load priors, open db, bootstrap schema, register hook.
 *
 * @param {Object} pi
 * @param {PluginConfig} [config={}]
 * @returns {Promise<PluginInstance>}
 */
export async function init(pi, config = {}) {
    let priors;
    try {
        priors = await loadCapabilityOverrides({
            benchmarksPath: config.priorsPath,
            weightsPath: config.weightsPath,
        });
    } catch (err) {
        throw wrapInitError("loading priors", err);
    }

    let db;
    try {
        db = await openDatabase(config);
    } catch (err) {
        throw wrapInitError("opening db", err);
    }

    try {
        const schemaSql = loadSchemaSql();
        ensureSchema(db, schemaSql);
    } catch (err) {
        throw wrapInitError("applying schema", err);
    }

    const deps = buildHookDeps(db, priors, config);

    let unregister;
    try {
        unregister = registerBeforeModelSelect(pi, deps);
    } catch (err) {
        throw wrapInitError("registering hook", err);
    }

    // Regenerate pi-ai runtime fallback chains (read by FallbackResolver).
    // Writes ~/.sf/agent/settings.json → fallback.chains.* atomically.
    // Failure is logged but never blocks plugin init — stale chains are
    // still better than a broken plugin.
    let fallbackWriteSummary = null;
    if (config.fallbackSettingsPath && config.writeFallbackChains !== false) {
        try {
            fallbackWriteSummary = writeFallbackChains(config.fallbackSettingsPath, deps, {
                blackoutModels: config.blackoutModels ?? [],
            });
            config.log?.(
                `wrote ${fallbackWriteSummary.chainsWritten} fallback chain(s) ` +
                `(${fallbackWriteSummary.totalEntries} total entries) to ${config.fallbackSettingsPath}`,
            );
        } catch (err) {
            config.log?.(`fallback chain write failed (non-fatal): ${err?.message ?? String(err)}`);
        }
    }

    return {
        unregister,
        fallbackWriteSummary,
        recordOutcome: (outcome) => recordOutcome(db, outcome),
        reloadPriors: async () => {
            const fresh = await loadCapabilityOverrides({
                benchmarksPath: config.priorsPath,
                weightsPath: config.weightsPath,
            });
            deps.overrides = fresh.overrides;
            deps.weights = fresh.weights;
            deps.benchmarks = fresh.benchmarks;
        },
        deps,
    };
}

/**
 * Convenience: create a handler without registering it. Useful for tests
 * and for users who want to wire the hook themselves.
 *
 * @param {import("./hook-handler.mjs").HookDeps} deps
 * @returns {(hookInput: Object) => Promise<{modelId: string} | undefined>}
 */
export function createHandler(deps) {
    return createBeforeModelSelectHandler(deps);
}

export {
    loadCapabilityOverrides,
    recordOutcome,
    aggregateAllForUnitType,
    registerBeforeModelSelect,
};
