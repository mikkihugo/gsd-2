/**
 * Tests for bayesian-blender.
 *
 * Run with: node --test src/bayesian-blender.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    DEFAULT_N_PRIOR,
    DEFAULT_UCB_C,
    blendScore,
    ucbBonus,
    computeObservedScore,
    blendedRanking,
    stripProviderPrefix,
} from "./bayesian-blender.mjs";

const FLOAT_TOLERANCE = 1e-9;

function makeStats(overrides = {}) {
    return {
        sample_count: 10,
        success_rate: 0.8,
        avg_retries: 1.0,
        verification_pass_rate: 0.9,
        blocker_rate: 0.05,
        ...overrides,
    };
}

// ---------- blendScore ----------

test("blendScore: pure prior when sampleCount=0", () => {
    const result = blendScore(80, 20, 0, DEFAULT_N_PRIOR);
    assert.equal(result, 80);
});

test("blendScore: 50/50 at sampleCount=nPrior", () => {
    const result = blendScore(80, 20, 10, 10);
    assert.equal(result, 50);
});

test("blendScore: observed dominates at high sampleCount", () => {
    // nPrior=10, sampleCount=190 → α=10/200=0.05
    // result = 0.05*100 + 0.95*0 = 5
    const result = blendScore(100, 0, 190, 10);
    assert.ok(Math.abs(result - 5) < FLOAT_TOLERANCE, `expected ~5, got ${result}`);
});

test("blendScore: handles nPrior=0 as pure observed", () => {
    const result = blendScore(80, 20, 5, 0);
    assert.equal(result, 20);
});

test("blendScore: negative sampleCount is clamped to 0", () => {
    const result = blendScore(80, 20, -42, DEFAULT_N_PRIOR);
    assert.equal(result, 80);
});

test("blendScore: nPrior=0 and sampleCount=0 returns prior (degenerate)", () => {
    const result = blendScore(80, 20, 0, 0);
    assert.equal(result, 80);
});

// ---------- ucbBonus ----------

test("ucbBonus: returns high value for zero samples", () => {
    const bonus = ucbBonus(0, 100);
    assert.ok(bonus >= 1000, `expected ≥1000, got ${bonus}`);
});

test("ucbBonus: decreases as sample count grows", () => {
    const low = ucbBonus(2, 100);
    const high = ucbBonus(50, 100);
    assert.ok(low > high, `expected ${low} > ${high}`);
});

test("ucbBonus: returns 0 when totalSamples <= 1", () => {
    assert.equal(ucbBonus(1, 1), 0);
    assert.equal(ucbBonus(0, 0), 1000); // zero-sample still gets exploration priority
    assert.equal(ucbBonus(1, 0), 0);
});

test("ucbBonus: higher c gives more bonus", () => {
    const low = ucbBonus(5, 100, 1.0);
    const high = ucbBonus(5, 100, 2.0);
    assert.ok(high > low, `expected ${high} > ${low}`);
    assert.ok(Math.abs(high - 2 * low) < FLOAT_TOLERANCE);
});

// ---------- computeObservedScore ----------

test("computeObservedScore: perfect stats → score near 100", () => {
    const stats = makeStats({
        sample_count: 50,
        success_rate: 1.0,
        avg_retries: 0,
        verification_pass_rate: 1.0,
        blocker_rate: 0,
    });
    const score = computeObservedScore(stats);
    assert.ok(score >= 99 && score <= 100, `expected ~100, got ${score}`);
});

test("computeObservedScore: failed stats → score near 0", () => {
    const stats = makeStats({
        sample_count: 50,
        success_rate: 0,
        avg_retries: 5,
        verification_pass_rate: 0,
        blocker_rate: 1.0,
    });
    const score = computeObservedScore(stats);
    assert.ok(score >= 0 && score <= 1, `expected ~0, got ${score}`);
});

test("computeObservedScore: sample_count=0 → returns 50 (neutral)", () => {
    const stats = makeStats({ sample_count: 0 });
    assert.equal(computeObservedScore(stats), 50);
});

test("computeObservedScore: null stats → returns 50 (neutral)", () => {
    assert.equal(computeObservedScore(null), 50);
    assert.equal(computeObservedScore(undefined), 50);
});

test("computeObservedScore: verification_pass_rate=null falls back to success_rate", () => {
    const withNullVerify = makeStats({
        sample_count: 20,
        success_rate: 0.7,
        avg_retries: 1.0,
        verification_pass_rate: null,
        blocker_rate: 0.1,
    });
    const withVerifyEqualsSuccess = makeStats({
        sample_count: 20,
        success_rate: 0.7,
        avg_retries: 1.0,
        verification_pass_rate: 0.7,
        blocker_rate: 0.1,
    });
    const a = computeObservedScore(withNullVerify);
    const b = computeObservedScore(withVerifyEqualsSuccess);
    assert.ok(Math.abs(a - b) < FLOAT_TOLERANCE, `expected ${a} == ${b}`);
});

// ---------- blendedRanking ----------

test("blendedRanking: sorts by finalScore DESC", () => {
    const eligible = ["model-a", "model-b", "model-c"];
    const priors = { "model-a": 60, "model-b": 90, "model-c": 30 };
    const observed = {
        "model-a": makeStats({ sample_count: 100, success_rate: 0.9 }),
        "model-b": makeStats({ sample_count: 100, success_rate: 0.5 }),
        "model-c": makeStats({ sample_count: 100, success_rate: 0.2 }),
    };
    const ranked = blendedRanking(eligible, "execute-task", priors, observed, {
        explorationEnabled: false,
    });
    assert.equal(ranked.length, 3);
    for (let i = 0; i < ranked.length - 1; i++) {
        assert.ok(
            ranked[i].finalScore >= ranked[i + 1].finalScore,
            `ranking not sorted: ${ranked[i].finalScore} < ${ranked[i + 1].finalScore}`,
        );
    }
});

test("blendedRanking: untried model with modest prior outranks heavily-sampled poor model when exploration is on", () => {
    const eligible = ["untried", "heavy-poor"];
    const priors = { untried: 60, "heavy-poor": 60 };
    const observed = {
        "heavy-poor": makeStats({
            sample_count: 200,
            success_rate: 0.05,
            avg_retries: 5,
            verification_pass_rate: 0.05,
            blocker_rate: 0.9,
        }),
        // "untried" has no observed entry
    };
    const ranked = blendedRanking(eligible, "execute-task", priors, observed, {
        explorationEnabled: true,
    });
    assert.equal(ranked[0].modelId, "untried");
});

test("blendedRanking: with exploration disabled, pure prior+observed wins", () => {
    const eligible = ["untried", "heavy-good"];
    const priors = { untried: 60, "heavy-good": 60 };
    const observed = {
        "heavy-good": makeStats({
            sample_count: 200,
            success_rate: 0.95,
            avg_retries: 0,
            verification_pass_rate: 0.95,
            blocker_rate: 0,
        }),
    };
    const ranked = blendedRanking(eligible, "execute-task", priors, observed, {
        explorationEnabled: false,
    });
    assert.equal(ranked[0].modelId, "heavy-good");
});

test("blendedRanking: missing prior defaults to 50 (neutral)", () => {
    const eligible = ["mystery"];
    const ranked = blendedRanking(eligible, "execute-task", {}, {}, {
        explorationEnabled: false,
    });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].priorScore, 50);
    // sample_count=0 → α=1 → blended = priorScore
    assert.equal(ranked[0].blendedScore, 50);
});

test("blendedRanking: missing observed → sample_count=0 → pure prior", () => {
    const eligible = ["a"];
    const priors = { a: 75 };
    const ranked = blendedRanking(eligible, "execute-task", priors, {}, {
        explorationEnabled: false,
    });
    assert.equal(ranked[0].blendedScore, 75);
    assert.equal(ranked[0].sampleCount, 0);
});

test("blendedRanking: empty eligible list returns empty array", () => {
    const ranked = blendedRanking([], "execute-task", {}, {});
    assert.deepEqual(ranked, []);
});

test("blendedRanking: result entries have all expected fields", () => {
    const eligible = ["a"];
    const priors = { a: 70 };
    const observed = { a: makeStats({ sample_count: 5 }) };
    const ranked = blendedRanking(eligible, "execute-task", priors, observed);
    const entry = ranked[0];
    assert.ok("modelId" in entry);
    assert.ok("priorScore" in entry);
    assert.ok("observedScore" in entry);
    assert.ok("blendedScore" in entry);
    assert.ok("ucbBonus" in entry);
    assert.ok("finalScore" in entry);
    assert.ok("sampleCount" in entry);
});

// ---------- stripProviderPrefix ----------

test("stripProviderPrefix: 'kimi-coding/k2p5' → 'k2p5'", () => {
    assert.equal(stripProviderPrefix("kimi-coding/k2p5"), "k2p5");
});

test("stripProviderPrefix: 'k2p5' (no prefix) → 'k2p5'", () => {
    assert.equal(stripProviderPrefix("k2p5"), "k2p5");
});

test("stripProviderPrefix: 'ollama-cloud/qwen3-coder:480b' → 'qwen3-coder:480b'", () => {
    assert.equal(stripProviderPrefix("ollama-cloud/qwen3-coder:480b"), "qwen3-coder:480b");
});

// ---------- constants sanity ----------

test("constants: defaults match plan", () => {
    assert.equal(DEFAULT_N_PRIOR, 10);
    assert.equal(DEFAULT_UCB_C, 1.4);
});
