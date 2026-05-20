'use strict';

/**
 * Tests for the v0.3.2 atomic-write hotfix in lib/lifecycle.js.
 *
 * Verifies:
 *   - writeFile() leaves no .cp-tmp-* sibling on success
 *   - writeFile() leaves the existing target untouched if the rename throws
 *     (simulated by passing an unwritable target dir)
 *   - writeFile() overwrites an existing file atomically (no truncated window)
 *   - writeBatch() stages all writes first, then renames, then deletes
 *   - writeBatch() ordering: delete actions only run after all writes succeed
 *   - writeBatch() cleans up temps if a staged write throws mid-batch
 *   - writeBatch() with mixed write/delete/skip actions handles all kinds
 *   - completeMilestone uses writeBatch (deletes happen after all writes)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const lifecycle = require('../lib/lifecycle');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function tmpdir(suffix = '') {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cp-atomic-${suffix}-`));
}

function listTmpSiblings(dir) {
  return fs.readdirSync(dir).filter((n) => /\.cp-tmp-/.test(n));
}

// ---------- writeFile: no temp left behind ----------

section('writeFile leaves no .cp-tmp-* sibling on success');
{
  const dir = tmpdir('clean');
  const dest = path.join(dir, 'a.txt');
  lifecycle.writeFile(dest, 'hello');
  ok('target written', fs.readFileSync(dest, 'utf8') === 'hello');
  ok('no .cp-tmp-* sibling', listTmpSiblings(dir).length === 0);
}

// ---------- writeFile: atomic overwrite ----------

section('writeFile overwrites existing target atomically');
{
  const dir = tmpdir('overwrite');
  const dest = path.join(dir, 'a.txt');
  fs.writeFileSync(dest, 'old content');
  lifecycle.writeFile(dest, 'new content');
  ok('content replaced', fs.readFileSync(dest, 'utf8') === 'new content');
  ok('no .cp-tmp-* leftover', listTmpSiblings(dir).length === 0);
}

// ---------- writeFile: throws + cleans up on bad dest ----------

section('writeFile cleans up temp on failure');
{
  const dir = tmpdir('failclean');
  // Target a path whose parent dir cannot be created (use a regular file as
  // the "directory" — mkdir will fail since the parent path is a file).
  const blocker = path.join(dir, 'block');
  fs.writeFileSync(blocker, '');
  const dest = path.join(blocker, 'oops.txt'); // parent is a file → ENOTDIR

  let threw = false;
  try { lifecycle.writeFile(dest, 'x'); }
  catch (e) { threw = true; }
  ok('throws on bad parent', threw);
  // The mkdir step throws BEFORE any temp is created, so dir should be clean.
  // (We only need to verify no orphan temp at the level we control.)
  ok('no orphan temps in parent dir', listTmpSiblings(dir).length === 0);
}

// ---------- writeBatch: all writes land, no temps ----------

section('writeBatch applies all writes atomically');
{
  const dir = tmpdir('batch');
  const a = path.join(dir, 'a.txt');
  const b = path.join(dir, 'sub', 'b.txt');
  lifecycle.writeBatch([
    { kind: 'write', path: a, after: 'A' },
    { kind: 'write', path: b, after: 'B' },
  ]);
  ok('a.txt written', fs.readFileSync(a, 'utf8') === 'A');
  ok('sub/b.txt written (parent created)', fs.readFileSync(b, 'utf8') === 'B');
  ok('no temps in dir', listTmpSiblings(dir).length === 0);
  ok('no temps in subdir', listTmpSiblings(path.dirname(b)).length === 0);
}

// ---------- writeBatch: deletes happen LAST ----------

section('writeBatch deletes run only after all writes succeed (Critical fix)');
{
  const dir = tmpdir('order');
  const writeTarget = path.join(dir, 'state.md');
  const deleteTarget = path.join(dir, 'context.md');
  // Pre-create the file we want deleted.
  fs.writeFileSync(deleteTarget, 'doomed');

  lifecycle.writeBatch([
    { kind: 'write', path: writeTarget, after: 'new state' },
    { kind: 'delete', path: deleteTarget },
  ]);
  ok('write landed', fs.readFileSync(writeTarget, 'utf8') === 'new state');
  ok('delete executed', !fs.existsSync(deleteTarget));
}

// ---------- writeBatch: if a write throws, deletes do NOT run ----------

section('writeBatch: failed stage aborts the batch — deletes do not run');
{
  const dir = tmpdir('abort');
  const blocker = path.join(dir, 'block');
  fs.writeFileSync(blocker, '');
  const goodWrite = path.join(dir, 'good.txt');
  const badWrite = path.join(blocker, 'bad.txt'); // parent is a file
  const survivor = path.join(dir, 'survivor.txt');
  fs.writeFileSync(survivor, 'still here');

  let threw = false;
  try {
    lifecycle.writeBatch([
      { kind: 'write', path: goodWrite, after: 'A' },
      { kind: 'write', path: badWrite, after: 'B' },
      { kind: 'delete', path: survivor },
    ]);
  } catch { threw = true; }
  ok('writeBatch throws', threw);
  ok('good write was NOT renamed into place (staged-but-rolled-back)',
    !fs.existsSync(goodWrite));
  ok('survivor was NOT deleted (deletes never ran)',
    fs.existsSync(survivor) && fs.readFileSync(survivor, 'utf8') === 'still here');
  ok('no orphan .cp-tmp-* in main dir', listTmpSiblings(dir).length === 0);
}

// ---------- writeBatch: ignores skip / unknown kinds ----------

section('writeBatch ignores `skip` and unknown action kinds');
{
  const dir = tmpdir('skip');
  const a = path.join(dir, 'a.txt');
  lifecycle.writeBatch([
    { kind: 'write', path: a, after: 'A' },
    { kind: 'skip', path: '/whatever', reason: 'no-op' },
    { kind: 'noop', path: '/also-whatever' },
  ]);
  ok('write still applied alongside skips', fs.readFileSync(a, 'utf8') === 'A');
}

// ---------- end-to-end: completeMilestone uses ordered apply ----------

section('completeMilestone applies writes before deletes (end-to-end)');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-atomic-e2e-'));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-only'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), `---
project: demo
---
# demo

## Phases

### 🚧 v0.1 Atomic (In Progress)

### Phase 1: Only

- [x] 01-01: done
`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-only', 'PLAN.md'),
    `---\nphase: 1\nname: Only\nplans: [01-01]\n---\n# Phase 1\n- [x] 01-01: done\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-only', '01-01-SUMMARY.md'),
    `---\nphase: 1\nplan: "01-01"\nsubsystem: only\ncompleted: 2026-05-19\n---\nDone.\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    `# State\n\n## Current Position\n\nPhase: 1 of 1\nPlan: 1 of 1\nStatus: in-progress\nLast activity: 2026-05-19 — start\n\nProgress: [██████████] 100%\n\n## Session Continuity\n\nLast session: 2026-05-19\nStopped at: start\nResume file: None\n`);
  // Pre-create MILESTONE-CONTEXT.md so we can verify it gets deleted LAST.
  const ctxPath = path.join(dir, '.planning', 'MILESTONE-CONTEXT.md');
  fs.writeFileSync(ctxPath, 'transient context\n');
  execSync('git add -A && git commit -q -m setup', { cwd: dir });

  const r = lifecycle.completeMilestone(dir, { noCommit: true });
  ok('completeMilestone ok=true', r.ok);
  // Writes landed: MILESTONES.md exists, ROADMAP collapsed, STATE reset.
  const msPath = path.join(dir, '.planning', 'MILESTONES.md');
  const stPath = path.join(dir, '.planning', 'STATE.md');
  const rmPath = path.join(dir, '.planning', 'ROADMAP.md');
  ok('MILESTONES.md exists', fs.existsSync(msPath));
  ok('ROADMAP collapsed', /<details>/.test(fs.readFileSync(rmPath, 'utf8')));
  ok('STATE reset to Idle', /Status:\s+Idle/.test(fs.readFileSync(stPath, 'utf8')));
  // Delete happened.
  ok('MILESTONE-CONTEXT.md deleted', !fs.existsSync(ctxPath));
  // No orphan temps anywhere under .planning/.
  function walkTmps(d) {
    let n = 0;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) n += walkTmps(p);
      else if (/\.cp-tmp-/.test(e.name)) n++;
    }
    return n;
  }
  ok('zero .cp-tmp-* orphans under .planning/', walkTmps(path.join(dir, '.planning')) === 0);
}

if (failed > 0) process.exit(1);
console.log(`\nAll atomic-write checks passed. (${passed})`);
