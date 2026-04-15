import test from "node:test";
import assert from "node:assert/strict";

import { registerSFCommand } from "../commands.ts";
import { handleSFCommand } from "../commands/dispatcher.ts";

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

test("/sf description includes discuss", () => {
  const pi = createMockPi();
  registerSFCommand(pi as any);

  const sf = pi.commands.get("sf");
  assert.ok(sf, "registerSFCommand should register /sf");
  assert.ok(
    sf.description.includes("discuss"),
    "description should include discuss",
  );
});

test("/sf next completions include --debug", () => {
  const pi = createMockPi();
  registerSFCommand(pi as any);

  const sf = pi.commands.get("sf");
  const completions = sf.getArgumentCompletions("next ");
  const debug = completions.find((c: any) => c.value === "next --debug");
  assert.ok(debug, "next --debug should appear in completions");
});

test("/sf widget completions include full|small|min|off", () => {
  const pi = createMockPi();
  registerSFCommand(pi as any);

  const sf = pi.commands.get("sf");
  const completions = sf.getArgumentCompletions("widget ");
  const values = completions.map((c: any) => c.value);
  for (const expected of ["widget full", "widget small", "widget min", "widget off"]) {
    assert.ok(values.includes(expected), `missing completion: ${expected}`);
  }
});

test("bare /sf skip shows usage and does not fall through to unknown-command warning", async () => {
  const ctx = createMockCtx();

  await handleSFCommand("skip", ctx as any, {} as any);

  assert.ok(
    ctx.notifications.some((n) => n.message.includes("Usage: /sf skip <unit-id>")),
    "should show skip usage guidance",
  );
  assert.ok(
    !ctx.notifications.some((n) => n.message.startsWith("Unknown: /sf skip")),
    "should not emit unknown-command warning for bare skip",
  );
});

