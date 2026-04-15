/**
 * Tests for ensureNodeModulesSymlink — covers symlink reconciliation for
 * source installs (#3529) and pnpm-style merged node_modules (#3564).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

// --- Integration tests via initResources (source/monorepo path) ---

test("initResources creates node_modules symlink in agent dir", async (t) => {
  const { initResources } = await import("../resource-loader.ts");
  const tmp = mkdtempSync(join(tmpdir(), "sf-symlink-"));
  const fakeAgentDir = join(tmp, "agent");

  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  initResources(fakeAgentDir);

  const nodeModulesPath = join(fakeAgentDir, "node_modules");
  // Use lstatSync instead of existsSync — existsSync follows the symlink and
  // returns false for dangling symlinks (e.g. in worktrees without node_modules)
  let stat;
  try {
    stat = lstatSync(nodeModulesPath);
  } catch {
    assert.fail("node_modules symlink should exist after initResources");
  }
  assert.equal(stat.isSymbolicLink(), true, "node_modules should be a symlink, not a real directory");
});

test("initResources replaces a real directory blocking node_modules with a symlink", async (t) => {
  const { initResources } = await import("../resource-loader.ts");
  const tmp = mkdtempSync(join(tmpdir(), "sf-symlink-realdir-"));
  const fakeAgentDir = join(tmp, "agent");

  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  initResources(fakeAgentDir);

  const nodeModulesPath = join(fakeAgentDir, "node_modules");

  // Remove the symlink and replace with a real directory
  rmSync(nodeModulesPath, { recursive: true, force: true });
  mkdirSync(nodeModulesPath, { recursive: true });

  const statBefore = lstatSync(nodeModulesPath);
  assert.equal(statBefore.isSymbolicLink(), false, "should be a real directory before fix");
  assert.equal(statBefore.isDirectory(), true, "should be a real directory before fix");

  // Second call should replace the real directory with a symlink
  initResources(fakeAgentDir);

  const statAfter = lstatSync(nodeModulesPath);
  assert.equal(statAfter.isSymbolicLink(), true, "real directory should be replaced with symlink");
});

test("initResources replaces a stale symlink with a correct one", async (t) => {
  const { initResources } = await import("../resource-loader.ts");
  const tmp = mkdtempSync(join(tmpdir(), "sf-symlink-stale-"));
  const fakeAgentDir = join(tmp, "agent");

  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  initResources(fakeAgentDir);

  const nodeModulesPath = join(fakeAgentDir, "node_modules");
  const correctTarget = readlinkSync(nodeModulesPath);

  // Remove and replace with a stale symlink pointing to a non-existent path
  unlinkSync(nodeModulesPath);
  symlinkSync("/tmp/nonexistent-sf-node-modules-" + Date.now(), nodeModulesPath);

  const staleTarget = readlinkSync(nodeModulesPath);
  assert.notEqual(staleTarget, correctTarget, "stale symlink should point elsewhere");

  // Second call should fix the stale symlink
  initResources(fakeAgentDir);

  const fixedTarget = readlinkSync(nodeModulesPath);
  assert.equal(fixedTarget, correctTarget, "stale symlink should be replaced with correct target");
});

test("initResources replaces symlink whose target was deleted", async (t) => {
  const { initResources } = await import("../resource-loader.ts");
  const tmp = mkdtempSync(join(tmpdir(), "sf-symlink-missing-"));
  const fakeAgentDir = join(tmp, "agent");

  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  initResources(fakeAgentDir);

  const nodeModulesPath = join(fakeAgentDir, "node_modules");
  const correctTarget = readlinkSync(nodeModulesPath);

  // Create a symlink that points to a path that doesn't exist
  unlinkSync(nodeModulesPath);
  const deadTarget = join(tmp, "old-install", "node_modules");
  symlinkSync(deadTarget, nodeModulesPath);

  // The symlink itself exists but its target doesn't
  assert.equal(lstatSync(nodeModulesPath).isSymbolicLink(), true);
  assert.equal(existsSync(deadTarget), false, "dead target should not exist");

  initResources(fakeAgentDir);

  const fixedTarget = readlinkSync(nodeModulesPath);
  assert.equal(fixedTarget, correctTarget, "broken symlink should be replaced with correct target");
});

// --- Unit tests for pnpm-style merged node_modules (#3564) ---
// These simulate the filesystem layout without going through initResources,
// since packageRoot is fixed at module load time.

test("pnpm layout: merged node_modules contains entries from both hoisted and internal", (t) => {
  // Simulate pnpm global layout:
  //   hoisted/node_modules/
  //     yaml/           ← external dep
  //     @sinclair/       ← external scoped dep
  //     sf-run/          ← package root
  //       node_modules/
  //         @sf-run/        ← workspace scope (NOT hoisted)
  //         @singularity-forge/  ← workspace scope (NOT hoisted)
  const tmp = mkdtempSync(join(tmpdir(), "sf-pnpm-merge-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const hoisted = join(tmp, "node_modules");
  const pkgRoot = join(hoisted, "sf-run");
  const internal = join(pkgRoot, "node_modules");
  const agentNodeModules = join(tmp, "agent", "node_modules");

  // Create hoisted entries (external deps)
  mkdirSync(join(hoisted, "yaml"), { recursive: true });
  mkdirSync(join(hoisted, "@sinclair", "typebox"), { recursive: true });
  mkdirSync(join(hoisted, "@anthropic-ai", "sdk"), { recursive: true });
  mkdirSync(pkgRoot, { recursive: true });

  // Create internal entries (workspace packages)
  mkdirSync(join(internal, "@sf", "pi-ai"), { recursive: true });
  mkdirSync(join(internal, "@sf", "pi-coding-agent"), { recursive: true });
  mkdirSync(join(internal, "@sf-build", "core"), { recursive: true });

  // Create merged directory manually (simulating what reconcileMergedNodeModules does)
  mkdirSync(agentNodeModules, { recursive: true });

  // Link hoisted entries (skip sf-run itself and dotfiles)
  for (const entry of readdirSync(hoisted, { withFileTypes: true })) {
    if (entry.name === "sf-run" || entry.name.startsWith(".")) continue;
    symlinkSync(join(hoisted, entry.name), join(agentNodeModules, entry.name));
  }

  // Overlay all non-dotfile entries from internal (these take precedence)
  for (const entry of readdirSync(internal, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const link = join(agentNodeModules, entry.name);
    try { lstatSync(link); unlinkSync(link); } catch { /* didn't exist */ }
    symlinkSync(join(internal, entry.name), link);
  }

  // Verify: external deps resolve through hoisted symlinks
  assert.ok(existsSync(join(agentNodeModules, "yaml")), "yaml should resolve");
  assert.ok(existsSync(join(agentNodeModules, "@sinclair")), "@sinclair should resolve");
  assert.ok(existsSync(join(agentNodeModules, "@anthropic-ai")), "@anthropic-ai should resolve");

  // Verify: workspace packages resolve through internal symlinks
  assert.ok(existsSync(join(agentNodeModules, "@sf")), "@sf should resolve");
  assert.ok(existsSync(join(agentNodeModules, "@sf", "pi-ai")), "@sf-run/pi-ai should resolve");
  assert.ok(existsSync(join(agentNodeModules, "@sf-build")), "@sf-build should resolve");

  // Verify: sf-run itself is NOT symlinked (it's the package root, not a dep)
  assert.ok(!existsSync(join(agentNodeModules, "sf-run")), "sf-run should not be in merged dir");

  // Verify: @sf points to internal, not hoisted (internal takes precedence)
  const gsdTarget = readlinkSync(join(agentNodeModules, "@sf"));
  assert.equal(gsdTarget, join(internal, "@sf"), "@sf should point to internal node_modules");
});

test("pnpm layout: non-@sf internal deps (e.g. @anthropic-ai) are included in merged dir", (t) => {
  // Regression: PR #3564 narrowed the internal overlay to @sf* only,
  // dropping optionalDependencies like @anthropic-ai/claude-agent-sdk
  // that npm installs internally rather than hoisting.
  const tmp = mkdtempSync(join(tmpdir(), "sf-pnpm-internal-optional-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const hoisted = join(tmp, "node_modules");
  const pkgRoot = join(hoisted, "sf-run");
  const internal = join(pkgRoot, "node_modules");
  const agentNodeModules = join(tmp, "agent", "node_modules");

  // Hoisted: only external deps (no @anthropic-ai — it's internal-only)
  mkdirSync(join(hoisted, "yaml"), { recursive: true });
  mkdirSync(pkgRoot, { recursive: true });

  // Internal: workspace packages + optional dep that wasn't hoisted
  mkdirSync(join(internal, "@sf", "pi-ai"), { recursive: true });
  mkdirSync(join(internal, "@anthropic-ai", "claude-agent-sdk"), { recursive: true });

  mkdirSync(agentNodeModules, { recursive: true });

  // Link hoisted entries
  for (const entry of readdirSync(hoisted, { withFileTypes: true })) {
    if (entry.name === "sf-run" || entry.name.startsWith(".")) continue;
    symlinkSync(join(hoisted, entry.name), join(agentNodeModules, entry.name));
  }

  // Overlay all non-dotfile internal entries (the fixed logic)
  for (const entry of readdirSync(internal, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const link = join(agentNodeModules, entry.name);
    try { lstatSync(link); unlinkSync(link); } catch { /* didn't exist */ }
    symlinkSync(join(internal, entry.name), link);
  }

  // @anthropic-ai must be present — this is what broke in #3564
  assert.ok(existsSync(join(agentNodeModules, "@anthropic-ai")), "@anthropic-ai should resolve from internal");
  assert.ok(existsSync(join(agentNodeModules, "@anthropic-ai", "claude-agent-sdk")), "@anthropic-ai/claude-agent-sdk should resolve");

  // @sf still resolves
  assert.ok(existsSync(join(agentNodeModules, "@sf")), "@sf should resolve");

  // Hoisted deps still resolve
  assert.ok(existsSync(join(agentNodeModules, "yaml")), "yaml should resolve");
});

test("hasMissingWorkspaceScopes detects pnpm layout", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "sf-pnpm-detect-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const hoisted = join(tmp, "hoisted");
  const internal = join(tmp, "internal");

  // npm-style: @sf exists in both hoisted and internal
  mkdirSync(join(hoisted, "@sf"), { recursive: true });
  mkdirSync(join(internal, "@sf"), { recursive: true });

  // Inline the detection logic for testing
  const hasMissing = (h: string, i: string): boolean => {
    if (!existsSync(i)) return false;
    for (const entry of readdirSync(i, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith("@sf") &&
          !existsSync(join(h, entry.name))) {
        return true;
      }
    }
    return false;
  };

  assert.equal(hasMissing(hoisted, internal), false, "npm-style: no missing scopes");

  // pnpm-style: @sf-build only in internal
  mkdirSync(join(internal, "@sf-build"), { recursive: true });
  assert.equal(hasMissing(hoisted, internal), true, "pnpm-style: @sf-build missing from hoisted");
});

test("merged node_modules marker uses fingerprint including directory entries", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "sf-pnpm-marker-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  // Simulate two directories with known entries
  const hoisted = join(tmp, "hoisted");
  const internal = join(tmp, "internal");
  mkdirSync(join(hoisted, "yaml"), { recursive: true });
  mkdirSync(join(hoisted, "@sinclair"), { recursive: true });
  mkdirSync(join(internal, "@sf"), { recursive: true });

  // Build fingerprint the same way the production code does
  const h = readdirSync(hoisted).sort().join(",");
  const i = readdirSync(internal).sort().join(",");
  const fakePackageRoot = "/usr/lib/node_modules/sf-run";
  const fingerprint = `${fakePackageRoot}\n${h}\n${i}`;

  const agentNodeModules = join(tmp, "agent", "node_modules");
  mkdirSync(agentNodeModules, { recursive: true });
  const marker = join(agentNodeModules, ".sf-merged");
  writeFileSync(marker, fingerprint);

  // Verify fingerprint contains all three components
  const stored = readFileSync(marker, "utf-8").trim();
  assert.ok(stored.includes(fakePackageRoot), "fingerprint includes packageRoot");
  assert.ok(stored.includes("@sinclair"), "fingerprint includes hoisted entries");
  assert.ok(stored.includes("@sf"), "fingerprint includes internal entries");

  // Verify fingerprint changes when a new package is added
  mkdirSync(join(hoisted, "new-package"), { recursive: true });
  const h2 = readdirSync(hoisted).sort().join(",");
  const fingerprint2 = `${fakePackageRoot}\n${h2}\n${i}`;
  assert.notEqual(fingerprint, fingerprint2, "fingerprint should change when deps change");
});

test("reconcileMergedNodeModules uses junction symlinks for Windows compatibility", () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(testDir, "..", "resource-loader.ts"), "utf-8");

  assert.match(
    source,
    /symlinkSync\(join\(hoisted,\s*entry\.name\),\s*join\(agentNodeModules,\s*entry\.name\),\s*'junction'\)/,
    "hoisted merged symlink must use 'junction'",
  );
  assert.match(
    source,
    /symlinkSync\(join\(internal,\s*entry\.name\),\s*link,\s*'junction'\)/,
    "internal merged symlink must use 'junction'",
  );
});
