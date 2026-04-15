-- sf-learning: llm_task_outcomes
-- Records per-unit LLM dispatch outcomes for Bayesian learning.
-- Shape is compatible with ace-coder's approved 2026-03-06 design so
-- cross-project data sharing can happen later without migration pain.

CREATE TABLE IF NOT EXISTS llm_task_outcomes (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id              TEXT NOT NULL,
    provider              TEXT NOT NULL,
    unit_type             TEXT NOT NULL,
    unit_id               TEXT NOT NULL,
    succeeded             INTEGER NOT NULL CHECK (succeeded IN (0, 1)),
    retries               INTEGER NOT NULL DEFAULT 0,
    escalated             INTEGER NOT NULL DEFAULT 0 CHECK (escalated IN (0, 1)),
    verification_passed   INTEGER CHECK (verification_passed IS NULL OR verification_passed IN (0, 1)),
    blocker_discovered    INTEGER NOT NULL DEFAULT 0 CHECK (blocker_discovered IN (0, 1)),
    duration_ms           INTEGER,
    tokens_total          INTEGER,
    cost_usd              REAL,
    recorded_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outcomes_model_unit_time
    ON llm_task_outcomes (model_id, unit_type, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_outcomes_unit_time
    ON llm_task_outcomes (unit_type, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_outcomes_provider_time
    ON llm_task_outcomes (provider, recorded_at DESC);
