import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression #4251: `gsd -p --model <provider>/<id> "msg"` must never mutate
 * the persisted defaultProvider/defaultModel in settings.json. The one-shot
 * print invocation used to verify a provider (e.g. Bearer-auth smoke test)
 * was silently overwriting the global default.
 *
 * Fix: thread a `persistModelChanges` flag from main.ts (false when not
 * interactive) through CreateAgentSessionOptions → AgentSessionConfig →
 * AgentSession, and gate `_applyModelChange`'s call to
 * setDefaultModelAndProvider on it.
 */

const repoRoot = process.cwd();
const agentSessionSource = readFileSync(
	join(repoRoot, "packages/pi-coding-agent/src/core/agent-session.ts"),
	"utf-8",
);
const sdkSource = readFileSync(
	join(repoRoot, "packages/pi-coding-agent/src/core/sdk.ts"),
	"utf-8",
);
const mainSource = readFileSync(
	join(repoRoot, "packages/pi-coding-agent/src/main.ts"),
	"utf-8",
);
const gsdCliSource = readFileSync(
	join(repoRoot, "src/cli.ts"),
	"utf-8",
);

test("AgentSessionConfig exposes persistModelChanges flag (#4251)", () => {
	const configStart = agentSessionSource.indexOf("export interface AgentSessionConfig");
	assert.ok(configStart >= 0, "missing AgentSessionConfig");
	const configEnd = agentSessionSource.indexOf("\n}", configStart);
	const configBlock = agentSessionSource.slice(configStart, configEnd);
	assert.ok(
		configBlock.includes("persistModelChanges?: boolean"),
		"AgentSessionConfig should declare optional persistModelChanges flag",
	);
});

test("AgentSession stores persistModelChanges and defaults it to true (#4251)", () => {
	assert.ok(
		agentSessionSource.includes("private _persistModelChanges: boolean"),
		"AgentSession should store _persistModelChanges",
	);
	assert.ok(
		agentSessionSource.includes("this._persistModelChanges = config.persistModelChanges ?? true"),
		"constructor must default persistModelChanges to true so interactive behavior is preserved",
	);
});

test("_applyModelChange gates settings persistence on _persistModelChanges (#4251)", () => {
	const start = agentSessionSource.indexOf("private async _applyModelChange(");
	assert.ok(start >= 0, "missing _applyModelChange");
	const window = agentSessionSource.slice(start, start + 1500);
	assert.ok(
		window.includes("options?.persist !== false && this._persistModelChanges"),
		"_applyModelChange must check _persistModelChanges before writing settings",
	);
});

test("CreateAgentSessionOptions forwards persistModelChanges to AgentSession (#4251)", () => {
	const optionsStart = sdkSource.indexOf("export interface CreateAgentSessionOptions");
	assert.ok(optionsStart >= 0, "missing CreateAgentSessionOptions");
	const optionsEnd = sdkSource.indexOf("\n}", optionsStart);
	const optionsBlock = sdkSource.slice(optionsStart, optionsEnd);
	assert.ok(
		optionsBlock.includes("persistModelChanges?: boolean"),
		"CreateAgentSessionOptions should expose persistModelChanges",
	);
	assert.ok(
		sdkSource.includes("persistModelChanges: options.persistModelChanges"),
		"createAgentSession must forward options.persistModelChanges into AgentSessionConfig",
	);
});

test("main.ts disables model-change persistence in one-shot / print mode (#4251)", () => {
	assert.ok(
		mainSource.includes("sessionOptions.persistModelChanges = false"),
		"main.ts should set persistModelChanges=false when not interactive",
	);
	const gateIdx = mainSource.indexOf("sessionOptions.persistModelChanges = false");
	const guardIdx = mainSource.lastIndexOf("if (!isInteractive)", gateIdx);
	assert.ok(
		guardIdx >= 0 && guardIdx < gateIdx,
		"persistModelChanges=false must be guarded by !isInteractive so interactive mode still persists user model choice",
	);
});

test("gsd src/cli.ts print-mode createAgentSession passes persistModelChanges: false (#4251)", () => {
	const printGuardIdx = gsdCliSource.indexOf("if (isPrintMode)");
	assert.ok(printGuardIdx >= 0, "missing isPrintMode branch in src/cli.ts");
	const createIdx = gsdCliSource.indexOf("createAgentSession({", printGuardIdx);
	assert.ok(createIdx >= 0, "missing createAgentSession call in print-mode branch");
	const createBlock = gsdCliSource.slice(createIdx, createIdx + 800);
	assert.ok(
		createBlock.includes("persistModelChanges: false"),
		"print-mode createAgentSession must pass persistModelChanges: false so --model overrides cannot mutate settings.json",
	);
});

test("gsd src/cli.ts print-mode --model override calls setModel with persist: false (#4251)", () => {
	const printGuardIdx = gsdCliSource.indexOf("if (isPrintMode)");
	const overrideIdx = gsdCliSource.indexOf("if (cliFlags.model)", printGuardIdx);
	assert.ok(overrideIdx >= 0, "missing --model override block in print-mode branch");
	const overrideBlock = gsdCliSource.slice(overrideIdx, overrideIdx + 500);
	assert.ok(
		overrideBlock.includes("session.setModel(match, { persist: false })"),
		"print-mode --model override must pass { persist: false } explicitly so the intent is visible at the call site",
	);
});

test("gsd src/cli.ts print-mode skips validateConfiguredModel when --model is set (#4251)", () => {
	const printGuardIdx = gsdCliSource.indexOf("if (isPrintMode)");
	const validateIdx = gsdCliSource.indexOf("validateConfiguredModel(", printGuardIdx);
	assert.ok(validateIdx >= 0, "missing validateConfiguredModel call in print-mode branch");
	// Walk backward to find the nearest enclosing `if (!cliFlags.model)` guard.
	const guardIdx = gsdCliSource.lastIndexOf("if (!cliFlags.model)", validateIdx);
	assert.ok(
		guardIdx >= 0 && guardIdx > printGuardIdx,
		"validateConfiguredModel must be guarded by `if (!cliFlags.model)` in print mode so a CLI-provided model never triggers fallback repair that overwrites settings.json",
	);
	// reapplyValidatedModelOnFallback must be inside the same guard block.
	const reapplyIdx = gsdCliSource.indexOf("reapplyValidatedModelOnFallback(", validateIdx);
	assert.ok(reapplyIdx >= 0, "missing reapplyValidatedModelOnFallback call");
	const blockEnd = gsdCliSource.indexOf("\n  }\n", guardIdx);
	assert.ok(
		reapplyIdx < blockEnd,
		"reapplyValidatedModelOnFallback must be inside the same `if (!cliFlags.model)` block as validateConfiguredModel",
	);
});
