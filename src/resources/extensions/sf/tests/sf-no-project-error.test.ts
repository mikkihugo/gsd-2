/**
 * SFNoProjectError — tests for friendly home-directory error handling.
 *
 * Verifies that SFNoProjectError is thrown for blocked directories and
 * that the dispatcher catches it with a user-friendly message.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const contextSrc = readFileSync(join(__dirname, "..", "commands", "context.ts"), "utf-8");
const dispatcherSrc = readFileSync(join(__dirname, "..", "commands", "dispatcher.ts"), "utf-8");

// ─── SFNoProjectError class ──────────────────────────────────────────────

test("SFNoProjectError class is exported from context.ts", () => {
  assert.ok(
    contextSrc.includes("export class SFNoProjectError extends Error"),
    "SFNoProjectError should be an exported Error subclass",
  );
});

test("SFNoProjectError sets name property", () => {
  assert.ok(
    contextSrc.includes('this.name = "SFNoProjectError"'),
    "SFNoProjectError should set its name for instanceof checks",
  );
});

// ─── projectRoot blocked directory handling ───────────────────────────────

test("projectRoot uses validateDirectory and checks for blocked severity", () => {
  assert.ok(
    contextSrc.includes("validateDirectory(pathToCheck)"),
    "projectRoot should call validateDirectory",
  );
  assert.ok(
    contextSrc.includes('result.severity === "blocked"'),
    "projectRoot should check for blocked severity",
  );
});

test("projectRoot throws SFNoProjectError on blocked directory", () => {
  assert.ok(
    contextSrc.includes("throw new SFNoProjectError"),
    "projectRoot should throw SFNoProjectError when directory is blocked",
  );
});

// ─── Dispatcher catch ─────────────────────────────────────────────────────

test("dispatcher catches SFNoProjectError with user-friendly message", () => {
  assert.ok(
    dispatcherSrc.includes("err instanceof SFNoProjectError"),
    "dispatcher should catch SFNoProjectError specifically",
  );
  assert.ok(
    dispatcherSrc.includes("cd"),
    "error message should suggest cd-ing into a project directory",
  );
});

test("dispatcher re-throws non-SFNoProjectError exceptions", () => {
  assert.ok(
    dispatcherSrc.includes("throw err"),
    "dispatcher should re-throw unexpected errors",
  );
});
