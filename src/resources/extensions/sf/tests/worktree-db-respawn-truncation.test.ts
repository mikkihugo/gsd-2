/**
 * worktree-db-respawn-truncation.test.ts — Regression test for #2815.
 *
 * Verifies that syncProjectRootToWorktree does NOT delete a non-empty
 * worktree sf.db. On worker respawn, sf-migrate populates the DB
 * (~1.7MB) before the auto-loop calls syncProjectRootToWorktree. The
 * sync step must preserve the freshly-migrated DB to avoid truncating
 * it to 0 bytes and causing "no such table: slices" failures.
 *
 * Covers:
 *   - Non-empty worktree sf.db preserved after sync (#2815)
 *   - Empty (0-byte) worktree sf.db still deleted (#853 preserved)
 *   - WAL/SHM sidecar files cleaned up when empty DB is deleted
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { syncProjectRootToWorktree } from '../auto-worktree.ts';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';


function createBase(name: string): string {
  const base = mkdtempSync(join(tmpdir(), `sf-wt-respawn-${name}-`));
  mkdirSync(join(base, '.sf', 'milestones'), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

describe('worktree-db-respawn-truncation (#2815)', async () => {

  // ─── 1. Non-empty worktree sf.db preserved after sync ───────────────
  console.log('\n=== 1. non-empty worktree sf.db preserved after sync (#2815) ===');
  {
    const mainBase = createBase('main');
    const wtBase = createBase('wt');

    try {
      // Set up milestone artifacts in main project root
      const m001Dir = join(mainBase, '.sf', 'milestones', 'M001');
      mkdirSync(m001Dir, { recursive: true });
      writeFileSync(join(m001Dir, 'M001-ROADMAP.md'), '# Roadmap');

      // Simulate a freshly-migrated worktree DB (non-empty, like after sf-migrate)
      // Real DBs are ~1.7MB; we use a smaller payload to prove the size check works
      const fakeDbContent = Buffer.alloc(4096, 0x42); // 4KB non-empty DB
      writeFileSync(join(wtBase, '.sf', 'sf.db'), fakeDbContent);

      const sizeBefore = statSync(join(wtBase, '.sf', 'sf.db')).size;
      assert.ok(sizeBefore > 0, 'sf.db is non-empty before sync');

      syncProjectRootToWorktree(mainBase, wtBase, 'M001');

      // The non-empty DB must survive the sync
      assert.ok(
        existsSync(join(wtBase, '.sf', 'sf.db')),
        '#2815: non-empty sf.db must not be deleted by sync',
      );
      const sizeAfter = statSync(join(wtBase, '.sf', 'sf.db')).size;
      assert.equal(
        sizeAfter,
        sizeBefore,
        '#2815: sf.db size must be unchanged after sync',
      );
    } finally {
      cleanup(mainBase);
      cleanup(wtBase);
    }
  }

  // ─── 2. Empty (0-byte) worktree sf.db still deleted ─────────────────
  console.log('\n=== 2. empty (0-byte) worktree sf.db still deleted (#853) ===');
  {
    const mainBase = createBase('main');
    const wtBase = createBase('wt');

    try {
      const m001Dir = join(mainBase, '.sf', 'milestones', 'M001');
      mkdirSync(m001Dir, { recursive: true });
      writeFileSync(join(m001Dir, 'M001-ROADMAP.md'), '# Roadmap');

      // Create an empty (0-byte) sf.db — this is stale/corrupt and should be deleted
      writeFileSync(join(wtBase, '.sf', 'sf.db'), '');
      assert.ok(existsSync(join(wtBase, '.sf', 'sf.db')), 'empty sf.db exists before sync');

      syncProjectRootToWorktree(mainBase, wtBase, 'M001');

      assert.ok(
        !existsSync(join(wtBase, '.sf', 'sf.db')),
        '#853: empty sf.db must still be deleted after sync',
      );
    } finally {
      cleanup(mainBase);
      cleanup(wtBase);
    }
  }

  // ─── 3. WAL/SHM sidecar files cleaned up when empty DB is deleted (#2478) ──
  console.log('\n=== 3. orphaned WAL/SHM cleaned up alongside empty sf.db (#2478) ===');
  {
    const mainBase = createBase('main');
    const wtBase = createBase('wt');

    try {
      const m001Dir = join(mainBase, '.sf', 'milestones', 'M001');
      mkdirSync(m001Dir, { recursive: true });
      writeFileSync(join(m001Dir, 'M001-ROADMAP.md'), '# Roadmap');

      // Create an empty (0-byte) sf.db plus orphaned WAL and SHM files —
      // this is the exact state that causes Node 24 node:sqlite CPU spin (#2478).
      const wtGsd = join(wtBase, '.sf');
      writeFileSync(join(wtGsd, 'sf.db'), '');
      writeFileSync(join(wtGsd, 'sf.db-wal'), Buffer.alloc(605672, 0xAA));
      writeFileSync(join(wtGsd, 'sf.db-shm'), Buffer.alloc(32768, 0xBB));

      assert.ok(existsSync(join(wtGsd, 'sf.db')), 'sf.db exists before sync');
      assert.ok(existsSync(join(wtGsd, 'sf.db-wal')), 'sf.db-wal exists before sync');
      assert.ok(existsSync(join(wtGsd, 'sf.db-shm')), 'sf.db-shm exists before sync');

      syncProjectRootToWorktree(mainBase, wtBase, 'M001');

      assert.ok(
        !existsSync(join(wtGsd, 'sf.db')),
        '#2478: empty sf.db must be deleted',
      );
      assert.ok(
        !existsSync(join(wtGsd, 'sf.db-wal')),
        '#2478: orphaned sf.db-wal must be deleted alongside sf.db',
      );
      assert.ok(
        !existsSync(join(wtGsd, 'sf.db-shm')),
        '#2478: orphaned sf.db-shm must be deleted alongside sf.db',
      );
    } finally {
      cleanup(mainBase);
      cleanup(wtBase);
    }
  }

  // ─── 4. Orphaned WAL/SHM cleaned up even when sf.db already missing (#2478) ──
  console.log('\n=== 4. orphaned WAL/SHM cleaned up even without sf.db (#2478) ===');
  {
    const mainBase = createBase('main');
    const wtBase = createBase('wt');

    try {
      const m001Dir = join(mainBase, '.sf', 'milestones', 'M001');
      mkdirSync(m001Dir, { recursive: true });
      writeFileSync(join(m001Dir, 'M001-ROADMAP.md'), '# Roadmap');

      // Orphaned WAL/SHM with NO sf.db at all — can happen from a previous
      // partial cleanup. These must still be cleaned up.
      const wtGsd = join(wtBase, '.sf');
      writeFileSync(join(wtGsd, 'sf.db-wal'), Buffer.alloc(1024, 0xAA));
      writeFileSync(join(wtGsd, 'sf.db-shm'), Buffer.alloc(1024, 0xBB));

      assert.ok(!existsSync(join(wtGsd, 'sf.db')), 'sf.db does not exist');
      assert.ok(existsSync(join(wtGsd, 'sf.db-wal')), 'orphaned sf.db-wal exists');
      assert.ok(existsSync(join(wtGsd, 'sf.db-shm')), 'orphaned sf.db-shm exists');

      syncProjectRootToWorktree(mainBase, wtBase, 'M001');

      assert.ok(
        !existsSync(join(wtGsd, 'sf.db-wal')),
        '#2478: orphaned sf.db-wal must be deleted even without main db file',
      );
      assert.ok(
        !existsSync(join(wtGsd, 'sf.db-shm')),
        '#2478: orphaned sf.db-shm must be deleted even without main db file',
      );
    } finally {
      cleanup(mainBase);
      cleanup(wtBase);
    }
  }

  // ─── 5. Milestone artifacts still synced when DB is preserved ────────
  console.log('\n=== 5. milestone artifacts still synced even when DB preserved ===');
  {
    const mainBase = createBase('main');
    const wtBase = createBase('wt');

    try {
      const m001Dir = join(mainBase, '.sf', 'milestones', 'M001');
      mkdirSync(m001Dir, { recursive: true });
      writeFileSync(join(m001Dir, 'M001-ROADMAP.md'), '# Roadmap');
      mkdirSync(join(m001Dir, 'slices', 'S01'), { recursive: true });
      writeFileSync(join(m001Dir, 'slices', 'S01', 'S01-PLAN.md'), '# Plan');

      // Non-empty DB in worktree
      writeFileSync(join(wtBase, '.sf', 'sf.db'), 'populated-db-data');

      syncProjectRootToWorktree(mainBase, wtBase, 'M001');

      // Artifacts must still be synced
      assert.ok(
        existsSync(join(wtBase, '.sf', 'milestones', 'M001', 'M001-ROADMAP.md')),
        'milestone artifacts synced even with preserved DB',
      );
      assert.ok(
        existsSync(join(wtBase, '.sf', 'milestones', 'M001', 'slices', 'S01', 'S01-PLAN.md')),
        'slice artifacts synced even with preserved DB',
      );
      // DB must still exist
      assert.ok(
        existsSync(join(wtBase, '.sf', 'sf.db')),
        '#2815: DB preserved alongside artifact sync',
      );
    } finally {
      cleanup(mainBase);
      cleanup(wtBase);
    }
  }
});
