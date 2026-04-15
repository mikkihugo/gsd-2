/**
 * Regression test for #3674 — block direct writes to sf.db
 *
 * When sf_complete_task was unavailable, agents fell back to shell-based
 * sqlite3 writes, corrupting the WAL-backed database. The fix extends
 * write-intercept to block file writes and bash commands targeting sf.db.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedStateFile, isBashWriteToStateFile } from '../write-intercept.ts';

describe('isBlockedStateFile blocks sf.db paths (#3674)', () => {
  test('blocks .gsd/sf.db', () => {
    assert.ok(isBlockedStateFile('/project/.gsd/sf.db'));
  });

  test('blocks .gsd/sf.db-wal', () => {
    assert.ok(isBlockedStateFile('/project/.gsd/sf.db-wal'));
  });

  test('blocks .gsd/sf.db-shm', () => {
    assert.ok(isBlockedStateFile('/project/.gsd/sf.db-shm'));
  });

  test('blocks resolved symlink path under .gsd/projects/', () => {
    assert.ok(isBlockedStateFile('/home/user/.gsd/projects/myproj/sf.db'));
  });

  test('still blocks STATE.md', () => {
    assert.ok(isBlockedStateFile('/project/.gsd/STATE.md'));
  });

  test('does not block other .gsd files', () => {
    assert.ok(!isBlockedStateFile('/project/.gsd/DECISIONS.md'));
  });
});

describe('isBashWriteToStateFile blocks DB shell commands (#3674)', () => {
  test('blocks sqlite3 targeting sf.db', () => {
    assert.ok(isBashWriteToStateFile('sqlite3 .gsd/sf.db "INSERT INTO ..."'));
  });

  test('blocks better-sqlite3 targeting sf.db', () => {
    assert.ok(isBashWriteToStateFile('node -e "require(\'better-sqlite3\')(\'.gsd/sf.db\')"'));
  });

  test('blocks shell redirect to sf.db', () => {
    assert.ok(isBashWriteToStateFile('echo data > .gsd/sf.db'));
  });

  test('blocks cp to sf.db', () => {
    assert.ok(isBashWriteToStateFile('cp backup.db .gsd/sf.db'));
  });

  test('blocks mv to sf.db', () => {
    assert.ok(isBashWriteToStateFile('mv temp.db .gsd/sf.db'));
  });

  test('does not block reading sf.db with cat', () => {
    assert.ok(!isBashWriteToStateFile('cat .gsd/sf.db'));
  });
});
