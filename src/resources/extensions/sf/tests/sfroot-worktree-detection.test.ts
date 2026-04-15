/**
 * sfroot-worktree-detection.test.ts — Regression test for #2594.
 *
 * sfRoot() must return the worktree's own .sf directory when the basePath
 * is inside a .sf/worktrees/<name>/ structure, not walk up to the project
 * root's .sf via the git-root probe.
 *
 * The bug: when a git worktree lives at /project/.sf/worktrees/M008/,
 * probeGsdRoot() runs `git rev-parse --show-toplevel` which can return the
 * main project root (not the worktree root) depending on git version and
 * worktree setup. The walk-up then finds /project/.sf and returns that
 * instead of the worktree's own .sf path.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { sfRoot, _clearGsdRootCache } from "../paths.ts";

describe("sfRoot() worktree detection (#2594)", () => {
  let projectRoot: string;
  let projectGsd: string;

  beforeEach(() => {
    _clearGsdRootCache();
    // Create a temporary project with a git repo to simulate real conditions.
    // realpathSync handles macOS /tmp -> /private/tmp.
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), "sfroot-wt-")));
    projectGsd = join(projectRoot, ".sf");
    mkdirSync(projectGsd, { recursive: true });

    // Initialize a git repo in the project root so git rev-parse works
    spawnSync("git", ["init", "--initial-branch=main"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    spawnSync("git", ["config", "user.email", "test@test.com"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    spawnSync("git", ["config", "user.name", "Test"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    // Create an initial commit so we have a HEAD
    writeFileSync(join(projectRoot, "README.md"), "# Test");
    spawnSync("git", ["add", "."], { cwd: projectRoot, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
  });

  afterEach(() => {
    _clearGsdRootCache();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  test("returns worktree .sf when basePath is a worktree with its own .sf (fast path)", () => {
    // Simulates a worktree that already had copyPlanningArtifacts() run,
    // so it has its own .sf/ directory.
    const worktreeBase = join(projectGsd, "worktrees", "M008");
    const worktreeGsd = join(worktreeBase, ".sf");
    mkdirSync(worktreeGsd, { recursive: true });

    const result = sfRoot(worktreeBase);
    assert.equal(
      result,
      worktreeGsd,
      `Expected worktree .sf (${worktreeGsd}), got ${result}. ` +
        "sfRoot() should use the fast path for an existing worktree .sf.",
    );
  });

  test("returns worktree .sf path (not project root .sf) when worktree .sf does not exist yet", () => {
    // This is the core #2594 bug: the worktree directory exists but its .sf
    // subdirectory hasn't been created yet. Without the fix, probeGsdRoot()
    // walks up from the worktree path, finds /project/.sf, and returns it.
    // With the fix, it detects the .sf/worktrees/<name>/ pattern and returns
    // the worktree-local .sf path as the creation fallback.
    const worktreeBase = join(projectGsd, "worktrees", "M008");
    mkdirSync(worktreeBase, { recursive: true });
    // NOTE: no .sf/ inside worktreeBase

    const result = sfRoot(worktreeBase);
    const expected = join(worktreeBase, ".sf");

    // Without the fix, this returns projectGsd (/project/.sf) because the
    // walk-up from worktreeBase finds it. With the fix, it returns the
    // worktree-local path.
    assert.notEqual(
      result,
      projectGsd,
      "sfRoot() must NOT return the project root .sf when basePath is inside .sf/worktrees/",
    );
    assert.equal(
      result,
      expected,
      `Expected worktree-local .sf (${expected}), got ${result}.`,
    );
  });

  test("returns worktree .sf when basePath is a real git worktree inside .sf/worktrees/", () => {
    // Create a real git worktree at .sf/worktrees/M010
    const worktreeName = "M010";
    const worktreeBase = join(projectGsd, "worktrees", worktreeName);

    // Use git worktree add to create a real worktree
    const result = spawnSync(
      "git",
      ["worktree", "add", "-b", `milestone/${worktreeName}`, worktreeBase],
      { cwd: projectRoot, encoding: "utf-8" },
    );

    if (result.status !== 0) {
      // If git worktree add fails, skip the test gracefully
      assert.ok(true, "Skipped: git worktree add not available");
      return;
    }

    // The real git worktree exists at worktreeBase but has NO .sf/ subdir yet
    const sfResult = sfRoot(worktreeBase);
    const expected = join(worktreeBase, ".sf");

    assert.notEqual(
      sfResult,
      projectGsd,
      "sfRoot() must NOT escape to project root .sf from inside a git worktree",
    );
    assert.equal(
      sfResult,
      expected,
      `Expected worktree-local .sf (${expected}), got ${sfResult}`,
    );

    // Cleanup worktree
    spawnSync("git", ["worktree", "remove", "--force", worktreeBase], {
      cwd: projectRoot,
      stdio: "ignore",
    });
  });

  test("still returns project .sf for normal (non-worktree) basePath", () => {
    const result = sfRoot(projectRoot);
    assert.equal(result, projectGsd);
  });

  test("still returns project .sf for a subdirectory of the project", () => {
    const subdir = join(projectRoot, "src", "lib");
    mkdirSync(subdir, { recursive: true });

    const result = sfRoot(subdir);
    assert.equal(
      result,
      projectGsd,
      "Non-worktree subdirectories should still resolve to project .sf",
    );
  });
});
