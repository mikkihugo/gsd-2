import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { sfRoot, _clearGsdRootCache } from "../../paths.ts";
/** Create a tmp dir and resolve symlinks + 8.3 short names (macOS /var→/private/var, Windows RUNNER~1→runneradmin). */
function tmp(): string {
  const p = mkdtempSync(join(tmpdir(), "sf-paths-test-"));
  try { return realpathSync.native(p); } catch { return p; }
}

function cleanup(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function initGit(dir: string): void {
  spawnSync("git", ["init"], { cwd: dir });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: dir });
}

describe('paths', () => {
  test('Case 1: .sf exists at basePath — fast path', () => {
    const root = tmp();
    try {
      mkdirSync(join(root, ".sf"));
      _clearGsdRootCache();
      const result = sfRoot(root);
      assert.deepStrictEqual(result, join(root, ".sf"), "fast path: returns basePath/.sf");
    } finally { cleanup(root); }
  });

  test('Case 2: .sf exists at git root, cwd is a subdirectory', () => {
    const root = tmp();
    try {
      initGit(root);
      mkdirSync(join(root, ".sf"));
      const sub = join(root, "src", "deep");
      mkdirSync(sub, { recursive: true });
      _clearGsdRootCache();
      const result = sfRoot(sub);
      assert.deepStrictEqual(result, join(root, ".sf"), "git-root probe: finds .sf at git root from subdirectory");
    } finally { cleanup(root); }
  });

  test('Case 3: .sf in an ancestor — walk-up finds it', () => {
    const root = tmp();
    try {
      initGit(root);
      const project = join(root, "project");
      mkdirSync(join(project, ".sf"), { recursive: true });
      const deep = join(project, "src", "deep");
      mkdirSync(deep, { recursive: true });
      _clearGsdRootCache();
      const result = sfRoot(deep);
      assert.deepStrictEqual(result, join(project, ".sf"), "walk-up: finds .sf in ancestor when git root has none");
    } finally { cleanup(root); }
  });

  test('Case 4: .sf nowhere — fallback returns original basePath/.sf', () => {
    const root = tmp();
    try {
      initGit(root);
      const sub = join(root, "src");
      mkdirSync(sub, { recursive: true });
      _clearGsdRootCache();
      const result = sfRoot(sub);
      assert.deepStrictEqual(result, join(sub, ".sf"), "fallback: returns basePath/.sf when .sf not found anywhere");
    } finally { cleanup(root); }
  });

  test('Case 5: cache — second call returns same value without re-probing', () => {
    const root = tmp();
    try {
      mkdirSync(join(root, ".sf"));
      _clearGsdRootCache();
      const first = sfRoot(root);
      const second = sfRoot(root);
      assert.deepStrictEqual(first, second, "cache: same result returned on second call");
      assert.ok(first === second, "cache: identity check (same string)");
    } finally { cleanup(root); }
  });

  test('Case 6: .sf at basePath takes precedence over ancestor .sf', () => {
    const outer = tmp();
    try {
      initGit(outer);
      mkdirSync(join(outer, ".sf"));
      const inner = join(outer, "nested");
      mkdirSync(join(inner, ".sf"), { recursive: true });
      _clearGsdRootCache();
      const result = sfRoot(inner);
      assert.deepStrictEqual(result, join(inner, ".sf"), "precedence: nearest .sf wins over ancestor");
    } finally { cleanup(outer); }
  });
});
