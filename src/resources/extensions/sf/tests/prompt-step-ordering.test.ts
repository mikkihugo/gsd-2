/**
 * Regression test for #3696 — prompt step ordering and runtime fixes
 *
 * 1. complete-milestone.md: sf_requirement_update (step 9) before
 *    sf_complete_milestone (step 10)
 * 2. complete-slice.md: uses sf_requirement_update
 * 3. register-extension.ts: _sfEpipeGuard logs instead of re-throwing
 * 4. register-hooks.ts: session_before_compact only checks isAutoActive
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const completeMilestoneMd = readFileSync(
  join(__dirname, '..', 'prompts', 'complete-milestone.md'),
  'utf-8',
);
const completeSliceMd = readFileSync(
  join(__dirname, '..', 'prompts', 'complete-slice.md'),
  'utf-8',
);
const registerExtSrc = readFileSync(
  join(__dirname, '..', 'bootstrap', 'register-extension.ts'),
  'utf-8',
);
const registerHooksSrc = readFileSync(
  join(__dirname, '..', 'bootstrap', 'register-hooks.ts'),
  'utf-8',
);

describe('prompt step ordering (#3696)', () => {
  test('sf_requirement_update step appears before sf_complete_milestone step', () => {
    // Search for the numbered step definitions, not early "Do NOT call" warnings
    const reqUpdateMatch = completeMilestoneMd.match(/^\d+\.\s.*sf_requirement_update/m);
    const completeMilestoneMatch = completeMilestoneMd.match(/^\d+\.\s.*sf_complete_milestone/m);
    assert.ok(reqUpdateMatch, 'sf_requirement_update should appear in a numbered step');
    assert.ok(completeMilestoneMatch, 'sf_complete_milestone should appear in a numbered step');
    const reqUpdateIdx = completeMilestoneMd.indexOf(reqUpdateMatch![0]);
    const completeMilestoneIdx = completeMilestoneMd.indexOf(completeMilestoneMatch![0]);
    assert.ok(
      reqUpdateIdx < completeMilestoneIdx,
      'sf_requirement_update step must come before sf_complete_milestone step',
    );
  });

  test('complete-slice.md uses sf_requirement_update', () => {
    assert.match(completeSliceMd, /sf_requirement_update/,
      'complete-slice.md should reference sf_requirement_update');
  });
});

describe('register-extension _sfEpipeGuard (#3696)', () => {
  test('_sfEpipeGuard exists and does not re-throw', () => {
    assert.match(registerExtSrc, /_sfEpipeGuard/,
      '_sfEpipeGuard should be defined in register-extension.ts');
    // After the fix, the handler logs instead of throwing
    assert.ok(
      !registerExtSrc.includes('throw err'),
      '_sfEpipeGuard should NOT contain "throw err"',
    );
  });
});

describe('register-hooks session_before_compact (#3696)', () => {
  test('session_before_compact only checks isAutoActive', () => {
    // Extract the session_before_compact handler
    const compactIdx = registerHooksSrc.indexOf('session_before_compact');
    assert.ok(compactIdx > -1, 'session_before_compact hook should exist');
    // The first check in the handler should be isAutoActive(), not isAutoPaused()
    const afterCompact = registerHooksSrc.slice(compactIdx, compactIdx + 300);
    assert.match(afterCompact, /isAutoActive\(\)/,
      'session_before_compact should check isAutoActive()');
    // Should NOT block compaction when paused
    assert.ok(
      !afterCompact.includes('isAutoPaused()'),
      'session_before_compact should not check isAutoPaused',
    );
  });
});
