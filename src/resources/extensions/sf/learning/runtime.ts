import { getDatabase, getDbPath, insertLlmTaskOutcome, type LlmTaskOutcomeInput } from "../sf-db.js";
import { logWarning } from "../workflow-logger.js";
import { loadCapabilityOverrides } from "./loadCapabilityOverrides.mjs";
import { createBeforeModelSelectHandler } from "./hook-handler.mjs";
import { validateOutcome } from "./outcome-recorder.mjs";

interface BeforeModelSelectInput {
  unitType: string;
  eligibleModels: string[];
  phaseConfig?: { primary: string; fallbacks: string[] };
}

interface BeforeModelSelectResult {
  modelId: string;
}

type ModelSelectHandler = (input: BeforeModelSelectInput) => Promise<BeforeModelSelectResult | undefined>;

const DEFAULT_N_PRIOR = 10;
const DEFAULT_ROLLING_DAYS = 30;
const DEFAULT_UCB_C = 1.4;

let cachedHandler: ModelSelectHandler | null = null;
let cachedDbPath: string | null = null;
let cachedDb: object | null = null;
let initPromise: Promise<void> | null = null;

async function ensureLearningReady(): Promise<void> {
  const db = getDatabase();
  const dbPath = getDbPath();
  if (!db || !dbPath) {
    cachedHandler = null;
    cachedDbPath = null;
    cachedDb = null;
    return;
  }
  if (cachedHandler && cachedDbPath === dbPath && cachedDb === db) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const priors = await loadCapabilityOverrides();
      cachedHandler = createBeforeModelSelectHandler({
        db,
        overrides: priors.overrides,
        weights: priors.weights,
        benchmarks: priors.benchmarks,
        opts: {
          nPrior: DEFAULT_N_PRIOR,
          rollingDays: DEFAULT_ROLLING_DAYS,
          ucbC: DEFAULT_UCB_C,
          explorationEnabled: true,
        },
      }) as ModelSelectHandler;
      cachedDbPath = dbPath;
      cachedDb = db;
    } catch (err) {
      cachedHandler = null;
      cachedDbPath = null;
      cachedDb = null;
      logWarning("dispatch", `failed to initialize learned routing: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function initializeLearningRuntime(): Promise<void> {
  await ensureLearningReady();
}

export function resetLearningRuntime(): void {
  cachedHandler = null;
  cachedDbPath = null;
  cachedDb = null;
  initPromise = null;
}

export async function selectLearnedModel(
  input: BeforeModelSelectInput,
): Promise<BeforeModelSelectResult | undefined> {
  await ensureLearningReady();
  if (!cachedHandler) return undefined;
  return cachedHandler(input);
}

export function recordLearnedOutcome(input: LlmTaskOutcomeInput): boolean {
  const validation = validateOutcome(input as any);
  if (!validation.valid) return false;
  try {
    return insertLlmTaskOutcome(input);
  } catch (err) {
    logWarning("db", `failed to record learned routing outcome: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
