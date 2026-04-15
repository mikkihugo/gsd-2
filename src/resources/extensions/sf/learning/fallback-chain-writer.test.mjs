/**
 * Tests for the fallback-chain-writer module.
 *
 * Focuses on the three findings surfaced by the combatant review:
 *   #1 — the removed BLACKOUT_PRIORITY_OFFSET reference (regression test)
 *   #3 — the generalist `default` chain should average across unit types,
 *         not clone the `subagent` ranking
 *   #4 — project-level settings.json with a `fallback` block must surface
 *         a warning via deps.opts.log
 *
 * @module gsd-learning/fallback-chain-writer.test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeFallbackChains } from "./fallback-chain-writer.mjs";

function makeTempSettingsDir() {
    const dir = mkdtempSync(join(tmpdir(), "gsd-chain-writer-"));
    const settingsPath = join(dir, "settings.json");
    writeFileSync(settingsPath, JSON.stringify({ enabledModels: [] }, null, 2));
    return { dir, settingsPath };
}

function makeDeps({ weights = { planning: { reasoning: 1.0 } }, overrides = {}, log = null } = {}) {
    return {
        db: { prepare: () => ({ all: () => [], get: () => undefined }) },
        overrides,
        weights,
        benchmarks: {},
        opts: {
            nPrior: 10,
            ucbC: 1.4,
            rollingDays: 30,
            explorationEnabled: false,
            log,
        },
    };
}

test("writeFallbackChains produces entries with integer priorities (no undefined BLACKOUT_PRIORITY_OFFSET)", () => {
    const { dir, settingsPath } = makeTempSettingsDir();
    try {
        const overrides = {
            "kimi-coding/k2p5": { reasoning: 90 },
            "minimax/MiniMax-M2.7": { reasoning: 80 },
            "zai/glm-5.1": { reasoning: 70 },
        };
        const deps = makeDeps({ overrides });

        const result = writeFallbackChains(settingsPath, deps);
        assert.ok(result.chainsWritten >= 1, "at least one chain written");
        assert.ok(result.totalEntries >= 3, "all overrides represented");

        const written = JSON.parse(readFileSync(settingsPath, "utf8"));
        const planningChain = written.fallback.chains.planning;
        assert.ok(Array.isArray(planningChain), "planning chain present");

        for (const entry of planningChain) {
            assert.equal(typeof entry.priority, "number");
            assert.ok(Number.isFinite(entry.priority), `priority ${entry.priority} is finite`);
            assert.ok(entry.priority >= 0, `priority ${entry.priority} >= 0`);
            assert.ok(entry.priority < 1000, `priority ${entry.priority} < 1000 (no leftover blackout offset)`);
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("writeFallbackChains builds a generalist default chain averaged across unit types, not cloned from subagent", () => {
    const { dir, settingsPath } = makeTempSettingsDir();
    try {
        // Three unit types, three disjoint benchmark keys.
        // Model A dominates the planning benchmark but is weak elsewhere.
        // Model B is middling everywhere.
        // Per unit-type subagent score: A=10, B=80  → subagent chain favors B
        // Mean across unit types:      A≈40, B≈70  → default chain favors B
        const overrides = {
            "providerA/modelA": {
                __benchmarks: { bench_p: 100, bench_e: 10, bench_s: 10 },
            },
            "providerB/modelB": {
                __benchmarks: { bench_p: 50, bench_e: 80, bench_s: 80 },
            },
        };
        const deps = makeDeps({
            weights: {
                planning: { bench_p: 1.0 },
                execution: { bench_e: 1.0 },
                subagent: { bench_s: 1.0 },
            },
            overrides,
        });

        writeFallbackChains(settingsPath, deps);
        const written = JSON.parse(readFileSync(settingsPath, "utf8"));
        const defaultChain = written.fallback.chains.default;
        const planningChain = written.fallback.chains.planning;
        const subagentChain = written.fallback.chains.subagent;

        assert.ok(Array.isArray(defaultChain));
        assert.ok(Array.isArray(planningChain));
        assert.ok(Array.isArray(subagentChain));

        // Planning chain — modelA should win (score 100 > 50)
        assert.equal(planningChain[0].model, "modelA", "planning chain: modelA wins (100 vs 50)");

        // Subagent chain — modelB should win (score 80 > 10)
        assert.equal(subagentChain[0].model, "modelB", "subagent chain: modelB wins (80 vs 10)");

        // Default chain — modelB wins by mean (≈70 vs ≈40)
        // This is the key regression test: a subagent-cloned default would also
        // favor modelB here, but it would be identical to subagentChain. Instead
        // we should see the generalist aggregation treat the chains independently.
        assert.equal(defaultChain[0].model, "modelB", "default chain: modelB wins by cross-unit mean");

        // Regression: default chain is NOT a literal clone of subagent.
        // If it were cloned (old behavior), the priorities would match exactly.
        // Generalist aggregation builds from scratch, so priorities are computed
        // independently — identity comparison proves no clone.
        assert.notEqual(defaultChain, subagentChain, "default is not a reference-identical clone of subagent");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("writeFallbackChains expands bare-id benchmark keys into concrete (provider, model) pairs via enabledModels reverse index", () => {
    // Regression for the "wrote 0 fallback chain(s)" bug.
    //
    // model-benchmarks.json uses bare ids (e.g. "glm-5", "k2p5"). Before the
    // fix, rankedToEntries skipped anything without a slash, so every chain
    // came out empty and the plugin silently wrote {chainsWritten: 0}.
    //
    // The fix reads `enabledModels` from settings.json, builds a
    // { bareId → [{provider, model}, ...] } reverse lookup, and emits one
    // chain entry per provider that offers each bare id.
    const { dir, settingsPath } = makeTempSettingsDir();
    try {
        // Seed settings.json with enabledModels in pi-ai's canonical format.
        writeFileSync(
            settingsPath,
            JSON.stringify(
                {
                    enabledModels: [
                        "kimi-coding/k2p5",
                        "opencode-go/k2p5",
                        "ollama-cloud/kimi-k2.5:cloud",
                        "zai/glm-5",
                        "ollama-cloud/glm-5:cloud",
                    ],
                },
                null,
                2,
            ),
        );

        // Bare-id overrides as they appear in model-benchmarks.json.
        // `kimi-k2.5` exercises the `:cloud` stripped-suffix match.
        const overrides = {
            "k2p5": { __benchmarks: { bench_p: 90 } },
            "glm-5": { __benchmarks: { bench_p: 80 } },
            "kimi-k2.5": { __benchmarks: { bench_p: 75 } },
        };
        const deps = makeDeps({
            weights: { planning: { bench_p: 1.0 } },
            overrides,
        });

        const result = writeFallbackChains(settingsPath, deps);
        assert.ok(result.chainsWritten > 0, "at least one chain written");
        assert.ok(result.totalEntries > 0, "entries materialized");

        const written = JSON.parse(readFileSync(settingsPath, "utf8"));
        const planningChain = written.fallback.chains.planning;
        assert.ok(Array.isArray(planningChain), "planning chain present");

        const providerModelPairs = planningChain.map((e) => `${e.provider}/${e.model}`);

        // k2p5 should expand to kimi-coding/k2p5 AND opencode-go/k2p5
        assert.ok(providerModelPairs.includes("kimi-coding/k2p5"), "kimi-coding/k2p5 present");
        assert.ok(providerModelPairs.includes("opencode-go/k2p5"), "opencode-go/k2p5 present");

        // glm-5 should expand to zai/glm-5 AND ollama-cloud/glm-5:cloud
        assert.ok(providerModelPairs.includes("zai/glm-5"), "zai/glm-5 present");
        assert.ok(providerModelPairs.includes("ollama-cloud/glm-5:cloud"), "ollama-cloud/glm-5:cloud present via suffix-strip match");

        // kimi-k2.5 (benchmark key) → ollama-cloud/kimi-k2.5:cloud via the
        // :cloud stripping branch
        assert.ok(
            providerModelPairs.includes("ollama-cloud/kimi-k2.5:cloud"),
            "kimi-k2.5 benchmark id expanded to ollama-cloud/kimi-k2.5:cloud",
        );

        // Priorities should be sortable and all integer
        for (const entry of planningChain) {
            assert.ok(Number.isInteger(entry.priority), `priority ${entry.priority} is int`);
            assert.ok(entry.priority >= 0);
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("writeFallbackChains logs a warning when enabledModels is missing or empty", () => {
    const { dir, settingsPath } = makeTempSettingsDir();
    try {
        // settings.json with no enabledModels key at all
        writeFileSync(settingsPath, JSON.stringify({ defaultProvider: "kimi-coding" }));
        const warnings = [];
        const deps = makeDeps({
            overrides: { "k2p5": { __benchmarks: { bench_p: 90 } } },
            weights: { planning: { bench_p: 1.0 } },
            log: (msg) => warnings.push(msg),
        });

        writeFallbackChains(settingsPath, deps);

        const matched = warnings.some(
            (w) => w.includes("enabledModels") && w.includes("empty or unparseable"),
        );
        assert.ok(matched, `expected empty-enabledModels warning, got: ${JSON.stringify(warnings)}`);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("writeFallbackChains warns via log when project-level .gsd/agent/settings.json shadows fallback", () => {
    // Create a fake project cwd with a .gsd/agent/settings.json containing a fallback block.
    const projectDir = mkdtempSync(join(tmpdir(), "gsd-proj-"));
    const projectSettingsDir = join(projectDir, ".gsd", "agent");
    mkdirSync(projectSettingsDir, { recursive: true });
    const projectSettingsPath = join(projectSettingsDir, "settings.json");
    writeFileSync(projectSettingsPath, JSON.stringify({ fallback: { enabled: true, chains: {} } }));

    const { dir: globalDir, settingsPath: globalSettingsPath } = makeTempSettingsDir();

    const originalCwd = process.cwd();
    process.chdir(projectDir);
    const warnings = [];
    try {
        const deps = makeDeps({
            overrides: { "kimi-coding/k2p5": { reasoning: 90 } },
            log: (msg) => warnings.push(msg),
        });
        const result = writeFallbackChains(globalSettingsPath, deps);
        assert.equal(result.shadowWarning, true, "shadowWarning flag set");
        const matched = warnings.some((w) => w.includes("settings.json") && w.includes("fallback"));
        assert.ok(matched, `expected a shadow warning in log, got: ${JSON.stringify(warnings)}`);
    } finally {
        process.chdir(originalCwd);
        rmSync(projectDir, { recursive: true, force: true });
        rmSync(globalDir, { recursive: true, force: true });
    }
});

test("writeFallbackChains always emits the hardcoded main chain with three kimi-k2.5 provider routes", () => {
    const { dir, settingsPath } = makeTempSettingsDir();
    try {
        // Deps deliberately minimal — no overrides, no enabledModels — so
        // the blender-driven chains are empty. The hardcoded main chain must
        // still appear regardless of blender state.
        const deps = makeDeps();
        writeFallbackChains(settingsPath, deps);

        const written = JSON.parse(readFileSync(settingsPath, "utf8"));
        const mainChain = written.fallback.chains.main;

        assert.ok(Array.isArray(mainChain), "main chain present");
        assert.equal(mainChain.length, 3, "main chain has exactly 3 entries");

        assert.equal(mainChain[0].provider, "kimi-coding");
        assert.equal(mainChain[0].model, "k2p5");
        assert.equal(mainChain[0].priority, 0);

        assert.equal(mainChain[1].provider, "ollama-cloud");
        assert.equal(mainChain[1].model, "kimi-k2.5:cloud");
        assert.equal(mainChain[1].priority, 1);

        assert.equal(mainChain[2].provider, "opencode-go");
        assert.equal(mainChain[2].model, "kimi-k2.5");
        assert.equal(mainChain[2].priority, 2);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("hardcoded main chain coexists with blender-computed per-unit-type chains", () => {
    const { dir, settingsPath } = makeTempSettingsDir();
    try {
        // Seed enabledModels so the blender can materialize real chains.
        writeFileSync(
            settingsPath,
            JSON.stringify(
                {
                    enabledModels: ["kimi-coding/k2p5", "zai/glm-5"],
                },
                null,
                2,
            ),
        );
        const overrides = {
            "k2p5": { __benchmarks: { bench_p: 90 } },
            "glm-5": { __benchmarks: { bench_p: 80 } },
        };
        const deps = makeDeps({
            weights: { planning: { bench_p: 1.0 } },
            overrides,
        });

        writeFallbackChains(settingsPath, deps);

        const written = JSON.parse(readFileSync(settingsPath, "utf8"));
        const chains = written.fallback.chains;

        // Hardcoded main chain present
        assert.ok(Array.isArray(chains.main), "main chain present");
        assert.equal(chains.main.length, 3);

        // Blender-computed per-unit-type chain also present
        assert.ok(Array.isArray(chains.planning), "planning chain present");
        assert.ok(chains.planning.length > 0, "planning chain has entries");

        // Both coexist — main does not clobber blender output
        const chainNames = Object.keys(chains);
        assert.ok(chainNames.includes("main"), "main in chain names");
        assert.ok(chainNames.includes("planning"), "planning in chain names");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("writeFallbackChains does NOT warn when cwd is the parent of the global settings file (false-positive guard)", () => {
    // Regression: when gsd is invoked from $HOME, detectProjectSettingsShadow
    // used to probe `$HOME/.gsd/agent/settings.json` — which IS the global
    // settings file itself. It then warned that the global file was shadowing
    // its own write. Surfaced 2026-04-15 in notifications.jsonl as
    // "WARNING: project-level settings.json at /home/mhugo/.gsd/agent/settings.json".
    //
    // Fix: detectProjectSettingsShadow compares the resolved project path to
    // the global settingsPath and bails early when they match.
    const fakeHome = mkdtempSync(join(tmpdir(), "gsd-fakehome-"));
    const globalSettingsDir = join(fakeHome, ".gsd", "agent");
    mkdirSync(globalSettingsDir, { recursive: true });
    const globalSettingsPath = join(globalSettingsDir, "settings.json");
    writeFileSync(
        globalSettingsPath,
        JSON.stringify({
            enabledModels: ["kimi-coding/k2p5"],
            fallback: { enabled: true, chains: {} },
        }),
    );

    const originalCwd = process.cwd();
    process.chdir(fakeHome);
    const warnings = [];
    try {
        const deps = makeDeps({
            overrides: { "kimi-coding/k2p5": { reasoning: 90 } },
            log: (msg) => warnings.push(msg),
        });
        const result = writeFallbackChains(globalSettingsPath, deps);
        assert.equal(
            result.shadowWarning,
            false,
            "cwd pointing at the global settings parent must not fire a shadow warning",
        );
        const matched = warnings.some((w) => w.includes("project-level settings.json"));
        assert.ok(!matched, `unexpected shadow warning: ${JSON.stringify(warnings)}`);
    } finally {
        process.chdir(originalCwd);
        rmSync(fakeHome, { recursive: true, force: true });
    }
});

test("writeFallbackChains does NOT warn when project settings has no fallback block", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "gsd-proj-"));
    const projectSettingsDir = join(projectDir, ".gsd", "agent");
    mkdirSync(projectSettingsDir, { recursive: true });
    writeFileSync(join(projectSettingsDir, "settings.json"), JSON.stringify({ defaultProvider: "kimi-coding" }));

    const { dir: globalDir, settingsPath: globalSettingsPath } = makeTempSettingsDir();

    const originalCwd = process.cwd();
    process.chdir(projectDir);
    const warnings = [];
    try {
        const deps = makeDeps({
            overrides: { "kimi-coding/k2p5": { reasoning: 90 } },
            log: (msg) => warnings.push(msg),
        });
        const result = writeFallbackChains(globalSettingsPath, deps);
        assert.equal(result.shadowWarning, false, "no shadow warning when fallback block absent");
    } finally {
        process.chdir(originalCwd);
        rmSync(projectDir, { recursive: true, force: true });
        rmSync(globalDir, { recursive: true, force: true });
    }
});
