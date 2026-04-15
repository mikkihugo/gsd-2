/**
 * Tests for loadCapabilityOverrides — focus on the longContext dimension
 * since it's the new path that blends context_window with long_context_ruler.
 *
 * Run with: node --test src/loadCapabilityOverrides.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    normalizeContextWindow,
    computeLongContextDimension,
    computeDimensionScores,
    computeUnitTypeScore,
    loadCapabilityOverrides,
    DEFAULT_SPEED_TABLE,
} from "./loadCapabilityOverrides.mjs";

// ── normalizeContextWindow ───────────────────────────────────────────────────

test("normalizeContextWindow: null input returns null", () => {
    assert.strictEqual(normalizeContextWindow(null), null);
});

test("normalizeContextWindow: undefined input returns null", () => {
    assert.strictEqual(normalizeContextWindow(undefined), null);
});

test("normalizeContextWindow: zero input returns null", () => {
    assert.strictEqual(normalizeContextWindow(0), null);
});

test("normalizeContextWindow: negative input returns null", () => {
    assert.strictEqual(normalizeContextWindow(-4096), null);
});

test("normalizeContextWindow: 4K (2^12) returns 0", () => {
    assert.strictEqual(normalizeContextWindow(4096), 0);
});

test("normalizeContextWindow: 8K (2^13) returns 10", () => {
    assert.strictEqual(normalizeContextWindow(8192), 10);
});

test("normalizeContextWindow: 131072 (128K, 2^17) returns 50", () => {
    assert.strictEqual(normalizeContextWindow(131072), 50);
});

test("normalizeContextWindow: 1048576 (1M, 2^20) returns 80", () => {
    assert.strictEqual(normalizeContextWindow(1048576), 80);
});

test("normalizeContextWindow: 2097152 (2M, 2^21) returns 90", () => {
    assert.strictEqual(normalizeContextWindow(2097152), 90);
});

test("normalizeContextWindow: 8388608 (8M, 2^23) clamps at 100", () => {
    assert.strictEqual(normalizeContextWindow(8388608), 100);
});

test("normalizeContextWindow: 16M+ clamps at 100", () => {
    assert.strictEqual(normalizeContextWindow(16_777_216), 100);
    assert.strictEqual(normalizeContextWindow(100_000_000), 100);
});

test("normalizeContextWindow: 2K (below floor) returns 0 (clamped)", () => {
    assert.strictEqual(normalizeContextWindow(2048), 0);
});

test("normalizeContextWindow: non-power-of-2 values interpolate correctly", () => {
    // 200000 is between 2^17 (131072, score 50) and 2^18 (262144, score 60)
    // log2(200000) ≈ 17.61, score ≈ (17.61 - 12) * 10 = 56.1
    const score = normalizeContextWindow(200000);
    assert.ok(score > 55 && score < 58, `expected ~56, got ${score}`);
});

// ── computeLongContextDimension ─────────────────────────────────────────────

test("computeLongContextDimension: both ctx and ruler available → blends 60/40", () => {
    const benchmarks = {
        context_window: 1048576,          // → 80
        long_context_ruler: 95,           // → 95
    };
    // blended = 80 * 0.6 + 95 * 0.4 = 48 + 38 = 86
    assert.strictEqual(computeLongContextDimension(benchmarks), 86);
});

test("computeLongContextDimension: only context_window returns pure ctx score", () => {
    const benchmarks = {
        context_window: 262144,           // → 60
        long_context_ruler: null,
    };
    assert.strictEqual(computeLongContextDimension(benchmarks), 60);
});

test("computeLongContextDimension: only long_context_ruler returns pure ruler score", () => {
    const benchmarks = {
        context_window: null,
        long_context_ruler: 72,
    };
    assert.strictEqual(computeLongContextDimension(benchmarks), 72);
});

test("computeLongContextDimension: neither available returns 0", () => {
    const benchmarks = {
        context_window: null,
        long_context_ruler: null,
    };
    assert.strictEqual(computeLongContextDimension(benchmarks), 0);
});

test("computeLongContextDimension: null benchmarks object returns 0", () => {
    assert.strictEqual(computeLongContextDimension(null), 0);
});

test("computeLongContextDimension: undefined benchmarks object returns 0", () => {
    assert.strictEqual(computeLongContextDimension(undefined), 0);
});

test("computeLongContextDimension: missing keys entirely returns 0", () => {
    assert.strictEqual(computeLongContextDimension({}), 0);
});

test("computeLongContextDimension: huge ctx beats low ruler when blended", () => {
    const bench = { context_window: 2097152, long_context_ruler: 30 };  // 90 * 0.6 + 30 * 0.4 = 54 + 12 = 66
    assert.strictEqual(computeLongContextDimension(bench), 66);
});

test("computeLongContextDimension: small ctx with high ruler still gets lifted by ruler", () => {
    const bench = { context_window: 131072, long_context_ruler: 95 };  // 50 * 0.6 + 95 * 0.4 = 30 + 38 = 68
    assert.strictEqual(computeLongContextDimension(bench), 68);
});

// ── computeDimensionScores integration ──────────────────────────────────────

test("computeDimensionScores: longContext uses new blend for real model", () => {
    // Simulate mimo-v2-pro-like entry: 1M ctx, no RULER benchmark
    const benchmarks = {
        swe_bench: null,
        context_window: 1048576,
        long_context_ruler: null,
    };
    const profile = computeDimensionScores(benchmarks, "mimo-v2-pro");
    assert.strictEqual(profile.longContext, 80, "1M ctx alone → score 80");
});

test("computeDimensionScores: longContext blends when both present", () => {
    const benchmarks = {
        context_window: 524288,      // 2^19 → 70
        long_context_ruler: 60,
    };
    const profile = computeDimensionScores(benchmarks, "hypothetical");
    // 70 * 0.6 + 60 * 0.4 = 42 + 24 = 66
    assert.strictEqual(profile.longContext, 66);
});

test("computeDimensionScores: zero longContext when no ctx and no ruler", () => {
    const benchmarks = {
        swe_bench: 80,
        context_window: null,
        long_context_ruler: null,
    };
    const profile = computeDimensionScores(benchmarks, "something");
    assert.strictEqual(profile.longContext, 0);
});

// ── loadCapabilityOverrides end-to-end with real data files ─────────────────

test("loadCapabilityOverrides: loads real model-benchmarks.json and computes longContext", async () => {
    const { overrides } = await loadCapabilityOverrides();

    // mimo-v2-pro should have a longContext score (it's the 1M ctx model)
    const mimoPro = overrides["mimo-v2-pro"];
    assert.ok(mimoPro, "mimo-v2-pro entry exists in overrides");
    assert.ok(mimoPro.longContext > 0, `mimo-v2-pro longContext should be > 0, got ${mimoPro.longContext}`);
    // With 1M ctx and no RULER published, should be exactly 80
    assert.strictEqual(mimoPro.longContext, 80, "mimo-v2-pro 1M ctx → longContext 80");

    // cogito-2.1:671b was fixed to 131K → longContext should be 50
    const cogito = overrides["cogito-2.1:671b"];
    assert.ok(cogito, "cogito entry exists");
    assert.strictEqual(cogito.longContext, 50, "cogito 128K ctx → longContext 50");

    // Models with no ctx and no ruler should have longContext 0
    // (Verify by finding any model that has null ctx in the data)
    // All 40 models were enriched, so this case may not occur in live data;
    // just verify the structure:
    for (const [modelId, profile] of Object.entries(overrides)) {
        assert.ok(typeof profile.longContext === "number",
            `${modelId} longContext is a number`);
        assert.ok(profile.longContext >= 0 && profile.longContext <= 100,
            `${modelId} longContext in [0, 100], got ${profile.longContext}`);
    }
});

test("loadCapabilityOverrides: all 40 models have populated dimension profiles", async () => {
    const { overrides, benchmarks } = await loadCapabilityOverrides();
    const modelIds = Object.keys(benchmarks).filter((k) => k !== "_meta");
    assert.ok(modelIds.length >= 40, `expected at least 40 models, got ${modelIds.length}`);

    for (const modelId of modelIds) {
        const profile = overrides[modelId];
        assert.ok(profile, `${modelId} has a profile`);
        for (const dim of ["coding", "debugging", "research", "reasoning", "speed", "longContext", "instruction"]) {
            assert.ok(typeof profile[dim] === "number",
                `${modelId}.${dim} is a number`);
        }
    }
});

test("loadCapabilityOverrides: computeUnitTypeScore strips provider prefix correctly", async () => {
    const { overrides, weights } = await loadCapabilityOverrides();
    // Both "kimi-coding/k2p5" and bare "k2p5" should resolve
    const prefixed = computeUnitTypeScore("kimi-coding/k2p5", "execute-task", overrides, weights);
    const bare = computeUnitTypeScore("k2p5", "execute-task", overrides, weights);
    assert.strictEqual(prefixed, bare, "provider prefix stripping produces identical score");
});
