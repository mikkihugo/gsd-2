/**
 * sf-learning: bayesian-blender
 *
 * Blends benchmark priors with observed per-(unit_type, model) outcomes
 * into a single ranked score. Uses Beta-Bernoulli shrinkage:
 *
 *     blended = α · prior + (1 - α) · observed
 *     where α = N_prior / (N_prior + N_observed)
 *
 * Cold start (N_observed=0) → α=1 → pure prior. As samples accumulate,
 * α shrinks toward 0 and observed dominates. N_prior=10 is the default
 * "equivalent sample count" for the prior — tunable.
 *
 * Exploration: UCB1 bonus = C · sqrt(ln(N_total) / N_model), with
 * C=1.4 default (Auer, Cesa-Bianchi, Fischer 2002 "Finite-time analysis
 * of the multiarmed bandit problem"). Added to blended score before
 * ranking so rarely-used models get a chance to prove themselves.
 *
 * All functions are pure — no I/O, no side effects.
 */

export const DEFAULT_N_PRIOR = 10;
export const DEFAULT_UCB_C = 1.4;
export const DEFAULT_OBSERVED_WEIGHTS = {
    success: 0.40,
    retry: 0.20,
    verify: 0.30,
    blocker: 0.10,
};

const NEUTRAL_PRIOR_SCORE = 50;
const NEUTRAL_OBSERVED_SCORE = 50;
const SCORE_SCALE = 100;
const UNTRIED_MODEL_BONUS = 1000;
const DEFAULT_MAX_RETRIES = 5;

/**
 * Core blend: α · prior + (1 - α) · observed
 * where α = nPrior / (nPrior + sampleCount)
 *
 * Beta-Bernoulli conjugate prior interpretation: the prior is treated
 * as if it came from `nPrior` synthetic samples, so once observed
 * samples reach `nPrior` they have equal weight, and beyond that
 * observed dominates.
 *
 * @param {number} priorScore     - 0 to 100
 * @param {number} observedScore  - 0 to 100
 * @param {number} sampleCount    - observed sample count
 * @param {number} [nPrior=10]    - equivalent sample count of prior
 * @returns {number} blended score 0 to 100
 */
export function blendScore(priorScore, observedScore, sampleCount, nPrior = DEFAULT_N_PRIOR) {
    const safeSampleCount = Math.max(0, sampleCount);

    if (nPrior <= 0 && safeSampleCount <= 0) {
        // Degenerate but safe: nothing to blend, fall back to prior.
        return priorScore;
    }

    if (nPrior <= 0) {
        // No prior weight → pure observed.
        return observedScore;
    }

    const alpha = nPrior / (nPrior + safeSampleCount);
    return alpha * priorScore + (1 - alpha) * observedScore;
}

/**
 * UCB1 exploration bonus. Higher when the model has been sampled rarely
 * relative to the total. Untried models return a very high constant so
 * they always get exploration priority.
 *
 * UCB1 (Auer et al. 2002): bonus = c · sqrt(ln(N_total) / N_model)
 *
 * @param {number} modelSampleCount  - samples for this model
 * @param {number} totalSamples      - total samples across all models
 * @param {number} [c=1.4]           - exploration constant (higher = more exploration)
 * @returns {number} bonus added to blended score
 */
export function ucbBonus(modelSampleCount, totalSamples, c = DEFAULT_UCB_C) {
    if (modelSampleCount <= 0) {
        // Untried model → maximum exploration priority.
        return UNTRIED_MODEL_BONUS;
    }
    if (totalSamples <= 1) {
        // ln(1) = 0; ln(0) undefined. Either way, no exploration at t≤1.
        return 0;
    }
    if (modelSampleCount > totalSamples) {
        // Shouldn't happen, but guard against negative-log nonsense.
        return 0;
    }
    return c * Math.sqrt(Math.log(totalSamples) / modelSampleCount);
}

/**
 * Compute a single observed score from aggregated stats using
 * weighted combination. Score is 0-100.
 *
 * Components:
 *   success: success_rate
 *   retry:   1 - min(avg_retries / maxRetries, 1)   (fewer retries → higher)
 *   verify:  verification_pass_rate (or success_rate if null)
 *   blocker: 1 - blocker_rate                       (fewer blockers → higher)
 *
 * @param {Object} stats - from outcome-aggregator.aggregateOutcomes
 * @param {number} [stats.sample_count]
 * @param {number} stats.success_rate       - 0.0 to 1.0
 * @param {number} stats.avg_retries        - float
 * @param {number|null} stats.verification_pass_rate - 0.0 to 1.0 or null
 * @param {number} stats.blocker_rate       - 0.0 to 1.0
 * @param {Object} [weights=DEFAULT_OBSERVED_WEIGHTS]
 * @param {number} [maxRetries=5] - retries above this contribute 0 to retry component
 * @returns {number} observed score 0 to 100
 */
export function computeObservedScore(
    stats,
    weights = DEFAULT_OBSERVED_WEIGHTS,
    maxRetries = DEFAULT_MAX_RETRIES,
) {
    if (!stats || (stats.sample_count ?? 0) === 0) {
        // No observed evidence → neutral. Blend will lean fully on prior
        // because sampleCount=0 forces α=1.
        return NEUTRAL_OBSERVED_SCORE;
    }

    const successRate = stats.success_rate ?? 0;
    const avgRetries = stats.avg_retries ?? 0;
    const verifyRate = stats.verification_pass_rate ?? successRate;
    const blockerRate = stats.blocker_rate ?? 0;

    const retryComponent = 1 - Math.min(avgRetries / maxRetries, 1);
    const blockerComponent = 1 - blockerRate;

    const weighted =
        weights.success * successRate +
        weights.retry * retryComponent +
        weights.verify * verifyRate +
        weights.blocker * blockerComponent;

    const scaled = weighted * SCORE_SCALE;
    return Math.max(0, Math.min(SCORE_SCALE, scaled));
}

/**
 * Full ranking of eligible models for a unit type.
 *
 * @param {string[]} eligibleModels - e.g. ["kimi-coding/k2p5", "minimax/MiniMax-M2.7"]
 * @param {string} unitType         - e.g. "execute-task" (currently informational)
 * @param {Object} priorsByModel    - {modelId: priorScore (0-100)} — from loadCapabilityOverrides
 * @param {Object} observedByModel  - {modelId: AggregatedStats} — from outcome-aggregator
 * @param {Object} [opts]
 * @param {number} [opts.nPrior=10]
 * @param {number} [opts.ucbC=1.4]
 * @param {boolean} [opts.explorationEnabled=true]
 * @returns {Array<{modelId: string, priorScore: number, observedScore: number, blendedScore: number, ucbBonus: number, finalScore: number, sampleCount: number}>}
 *   sorted by finalScore DESC
 */
export function blendedRanking(eligibleModels, unitType, priorsByModel, observedByModel, opts = {}) {
    const nPrior = opts.nPrior ?? DEFAULT_N_PRIOR;
    const ucbC = opts.ucbC ?? DEFAULT_UCB_C;
    const explorationEnabled = opts.explorationEnabled !== false;

    const safePriors = priorsByModel ?? {};
    const safeObserved = observedByModel ?? {};

    if (!Array.isArray(eligibleModels) || eligibleModels.length === 0) {
        return [];
    }

    const totalSamples = eligibleModels.reduce((sum, modelId) => {
        const stats = safeObserved[modelId];
        return sum + (stats?.sample_count ?? 0);
    }, 0);

    const ranked = eligibleModels.map((modelId) => {
        const priorScore = safePriors[modelId] ?? NEUTRAL_PRIOR_SCORE;
        const stats = safeObserved[modelId];
        const sampleCount = stats?.sample_count ?? 0;
        const observedScore = computeObservedScore(stats);
        const blendedScore = blendScore(priorScore, observedScore, sampleCount, nPrior);
        const bonus = explorationEnabled ? ucbBonus(sampleCount, totalSamples, ucbC) : 0;
        const finalScore = blendedScore + bonus;

        return {
            modelId,
            priorScore,
            observedScore,
            blendedScore,
            ucbBonus: bonus,
            finalScore,
            sampleCount,
        };
    });

    ranked.sort((a, b) => b.finalScore - a.finalScore);
    return ranked;
}

/**
 * Helper: map a model id to its bare name for benchmark lookup.
 * "kimi-coding/k2p5" → "k2p5"
 * "k2p5" → "k2p5"
 * "ollama-cloud/qwen3-coder:480b" → "qwen3-coder:480b"
 *
 * @param {string} modelId
 * @returns {string}
 */
export function stripProviderPrefix(modelId) {
    const slashIndex = modelId.indexOf("/");
    if (slashIndex === -1) {
        return modelId;
    }
    return modelId.slice(slashIndex + 1);
}
