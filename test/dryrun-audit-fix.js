#!/usr/bin/env node
/**
 * Dryrun (spawn-based) tests for `cp audit --fix`. v0.8 Phase 25 (P8).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const CP = path.join(REPO, 'bin', 'cp.js');

let passed = 0, failed = 0;
function ok(label, cond, detail = '') {
  if (cond) { passed++; console.log(`  \u2713 ${label}`); }
  else { failed++; console.log(`  \u2717 ${label}${detail ? ' :: ' + detail : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function runCp(cwd, args) {
  return spawnSync(process.execPath, [CP, ...args], { cwd, encoding: 'utf8' });
}

function mkFixture(suffix, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-fix-cli-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    `# x\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [ ] 01-01: hi\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\n---\n# Phase 1\n\n## Plans\n- [ ] 01-01: hi\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    `# Project State\n\n## Current Position\n\nPhase: 1\nPlan: 01-01\nStatus: Ready\nCurrent focus: x\nLast activity: x\n\nProgress: [██████████] 0%\n\n## Decisions\n\n(none)\n`);
  execSync('git add -A && git commit -q -m seed', { cwd: dir });

  // Stamp a real base-commit on PLAN to suppress that MEDIUM finding.
  if (opts.realBaseCommit !== false) {
    const sha = execSync('git rev-parse HEAD', { cwd: dir }).toString().trim();
    const planPath = path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md');
    fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8').replace(/^---\n/, `---\nbase-commit: ${sha}\n`));
    execSync('git add -A && git commit -q -m pin', { cwd: dir });
  }

  // Plant a SUMMARY without ticking the plan → summary-without-tick MEDIUM.
  if (opts.plantSummaryWithoutTick) {
    fs.writeFileSync(
      path.join(dir, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md'),
      `---\nplan: 01-01\nphase: 1\nsubsystem: g\nkey-files:\n  created: []\n  modified: []\nkey-decisions: [x]\nend-commit: ${execSync('git rev-parse HEAD', { cwd: dir }).toString().trim()}\n---\nbody\n`);
    execSync('git add -A && git commit -q -m "stray summary"', { cwd: dir });
  }

  return dir;
}

section('cp audit --fix dry-run: applies nothing');
{
  const dir = mkFixture('dry', { plantSummaryWithoutTick: true });
  const beforeLog = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  const r = runCp(dir, ['audit', '--fix', '--dry-run']);
  // Should exit 2 because state-stale + summary-without-tick give manual=0, auto=2, applied=2 (dry), manual=0 → 0
  ok('exited 0 or 2', r.status === 0 || r.status === 2, `status=${r.status} stderr=${r.stderr}`);
  ok('stdout shows (dry-run) marker', /\(dry-run\)/.test(r.stdout), r.stdout.slice(0, 200));
  const afterLog = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  ok('git log unchanged (no commits)', beforeLog === afterLog, `before=${beforeLog} after=${afterLog}`);
}

section('cp audit --fix: applies state-stale + summary-without-tick atomically');
{
  const dir = mkFixture('apply', { plantSummaryWithoutTick: true });
  const r = runCp(dir, ['audit', '--fix']);
  ok('exit 0 (clean)', r.status === 0, `status=${r.status} stdout=${r.stdout.slice(0,300)} stderr=${r.stderr.slice(0,300)}`);
  ok('stdout shows Applied section', /Applied \(\d+\)/.test(r.stdout));
  // Verify atomic per-fix commits exist.
  const commits = execSync('git log --format=%s', { cwd: dir }).toString().trim().split('\n');
  const fixCommits = commits.filter((c) => /^cp\(audit-fix\):/.test(c));
  ok('at least 2 audit-fix commits', fixCommits.length >= 2, fixCommits.join(' | '));
  // Re-run audit: should be clean (or at most LOW state-stale if regen drift recurs)
  const r2 = runCp(dir, ['audit', '--quiet']);
  ok('post-fix audit exit 0 or 1', r2.status === 0 || r2.status === 1, `status=${r2.status}`);
}

section('cp audit --fix --max 1: caps at 1 fix even when 2 auto available');
{
  const dir = mkFixture('max1', { plantSummaryWithoutTick: true });
  const r = runCp(dir, ['audit', '--fix', '--max', '1']);
  const commits = execSync('git log --format=%s', { cwd: dir }).toString().trim().split('\n');
  const fixCommits = commits.filter((c) => /^cp\(audit-fix\):/.test(c));
  ok('exactly 1 audit-fix commit', fixCommits.length === 1, fixCommits.join(' | '));
  ok('exit 0 or 2 (manual may remain)', r.status === 0 || r.status === 2, `status=${r.status}`);
}

section('cp audit --fix --json: emits structured result');
{
  const dir = mkFixture('json', { plantSummaryWithoutTick: true });
  const r = runCp(dir, ['audit', '--fix', '--json']);
  let obj;
  try { obj = JSON.parse(r.stdout); } catch (_) {}
  ok('valid JSON', !!obj, r.stdout.slice(0, 200));
  if (obj) {
    ok('has fix.applied', Array.isArray(obj.fix && obj.fix.applied));
    ok('has classify.auto', typeof obj.classify.auto === 'number');
    ok('has summary_fix', !!obj.summary_fix && typeof obj.summary_fix.applied === 'number');
  }
}

section('cp audit --fix --severity high: skips MEDIUM auto');
{
  const dir = mkFixture('sevh', { plantSummaryWithoutTick: true });
  const r = runCp(dir, ['audit', '--fix', '--severity', 'high']);
  // No HIGH findings, no auto, so applied=0, manual=0, skip > 0. Exit 0.
  ok('exit 0', r.status === 0, `status=${r.status} stdout=${r.stdout.slice(0,200)}`);
  ok('stdout shows skip > 0', /skip:\s+[1-9]/.test(r.stdout), r.stdout.slice(0,300));
  const commits = execSync('git log --format=%s', { cwd: dir }).toString().trim().split('\n');
  const fixCommits = commits.filter((c) => /^cp\(audit-fix\):/.test(c));
  ok('no audit-fix commits', fixCommits.length === 0);
}

section('cp audit --fix --interactive: warns then proceeds non-interactively');
{
  const dir = mkFixture('interact', { plantSummaryWithoutTick: true });
  const r = runCp(dir, ['audit', '--fix', '--interactive']);
  ok('warning on stderr', /interactive.*not yet implemented/i.test(r.stderr), r.stderr.slice(0,200));
  ok('still applied fixes', /Applied \(\d+\)/.test(r.stdout));
}

section('cp audit --fix --max 0: rejected (positive int required)');
{
  const dir = mkFixture('badmax');
  const r = runCp(dir, ['audit', '--fix', '--max', '0']);
  ok('exit 2', r.status === 2, `status=${r.status}`);
  ok('stderr mentions positive integer', /positive integer/.test(r.stderr));
}

console.log('\n----------------------------------------');
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
