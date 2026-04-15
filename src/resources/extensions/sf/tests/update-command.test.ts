import test from "node:test";
import assert from "node:assert/strict";

import { registerSFCommand } from "../commands.ts";

function createMockPi() {
  const commands = new Map<string, any>();
  return {
    registerCommand(name: string, options: any) {
      commands.set(name, options);
    },
    registerTool() {},
    registerShortcut() {},
    on() {},
    sendMessage() {},
    commands,
  };
}

function createMockCtx() {
  const notifications: { message: string; level: string }[] = [];
  return {
    notifications,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      custom: async () => {},
    },
    shutdown: async () => {},
  };
}

test("/sf update appears in subcommand completions", () => {
  const pi = createMockPi();
  registerSFCommand(pi as any);

  const sf = pi.commands.get("sf");
  assert.ok(sf, "registerSFCommand should register /sf");

  const completions = sf.getArgumentCompletions("update");
  const updateEntry = completions.find((c: any) => c.value === "update");
  assert.ok(updateEntry, "update should appear in completions");
  assert.equal(updateEntry.label, "update");
});

test("/sf update appears in help description", () => {
  const pi = createMockPi();
  registerSFCommand(pi as any);

  const sf = pi.commands.get("sf");
  assert.ok(sf?.description?.includes("update"), "description should mention update");
});

test("/sf update is listed in completions with correct description", () => {
  const pi = createMockPi();
  registerSFCommand(pi as any);

  const sf = pi.commands.get("sf");
  const completions = sf.getArgumentCompletions("");
  const updateEntry = completions.find((c: any) => c.value === "update");
  assert.ok(updateEntry, "update should appear in full completion list");
  assert.ok(
    updateEntry.description.toLowerCase().includes("update"),
    "completion description should mention updating",
  );
});

test("/sf codebase appears in top-level completions", () => {
  const pi = createMockPi();
  registerSFCommand(pi as any);

  const sf = pi.commands.get("sf");
  const completions = sf.getArgumentCompletions("code");
  const codebaseEntry = completions.find((c: any) => c.value === "codebase");
  assert.ok(codebaseEntry, "codebase should appear in completions");
  assert.match(codebaseEntry.description, /codebase map cache/i);
});

test("/sf codebase appears in help description", () => {
  const pi = createMockPi();
  registerSFCommand(pi as any);

  const sf = pi.commands.get("sf");
  assert.ok(sf?.description?.includes("codebase"), "description should mention codebase");
});
