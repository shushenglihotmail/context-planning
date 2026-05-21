#!/usr/bin/env node
/**
 * Dryrun tests for `cp scaffold-phase --continue` (v0.8 Phase 26 P10).
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

function mkFixtureWithIncompletePhase1(suffix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-cont-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-greet'), { recursive: true });
  // Phase 1 with one TICKED plan but NO summary — triggers prior-phase-incomplete.
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    `# x\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [x] 01-01: hi\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\n---\n# Phase 1\n\n## Plans\n- [x] 01-01: hi\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    `# x\n\n## Current Position\n\nPhase: 1\nPlan: 01-01\nStatus: x\nCurrent focus: x\nLast activity: x\n\nProgress: [          ] 0%\n\n## Decisions\n\n(none)\n`);
  execSync('git add -A && git commit -q -m seed', { cwd: dir });
  return dir;
}

section('scaffold-phase 2: refused by prior-phase audit (control)');
{
  const dir = mkFixtureWithIncompletePhase1('refuse');
  const r = runCp(dir, ['scaffold-phase', '2', '--name', 'Next', '--no-commit']);
  ok('exit 2 (refused)', r.status === 2);
  ok('stderr mentions prior phase', /prior phase/.test(r.stderr));
}

section('scaffold-phase 2 --continue: bypasses with note in PLAN.md');
{
  const dir = mkFixtureWithIncompletePhase1('cont');
  const r = runCp(dir, ['scaffold-phase', '2', '--name', 'Continued Work', '--continue']);
  ok('exit 0', r.status === 0, JSON.stringify({ stdout: r.stdout, stderr: r.stderr }));
  ok('stderr mentions --continue notice', /--continue used/.test(r.stderr));
  // Find the new phase dir
  const phaseDirs = fs.readdirSync(path.join(dir, '.planning', 'phases'));
  const newDir = phaseDirs.find((d) => d.startsWith('02-'));
  ok('phase 2 dir created', !!newDir);
  const planContents = fs.readFileSync(path.join(dir, '.planning', 'phases', newDir, 'PLAN.md'), 'utf8');
  ok('PLAN has Continues-from note', /\*\*Continues from\*\*:\s*phase\s*1/.test(planContents));
  ok('PLAN explains --continue rationale', /scaffolded with .*--continue/.test(planContents));
  ok('PLAN includes missing summaries detail', /01-01/.test(planContents));
}

section('scaffold-phase --continue is distinct from --force (note vs silent bypass)');
{
  const dir = mkFixtureWithIncompletePhase1('forcecmp');
  const r = runCp(dir, ['scaffold-phase', '2', '--name', 'Forced', '--force']);
  ok('exit 0', r.status === 0, r.stderr);
  const phaseDirs = fs.readdirSync(path.join(dir, '.planning', 'phases'));
  const newDir = phaseDirs.find((d) => d.startsWith('02-'));
  const planContents = fs.readFileSync(path.join(dir, '.planning', 'phases', newDir, 'PLAN.md'), 'utf8');
  ok('--force PLAN has NO Continues-from note', !/\*\*Continues from\*\*/.test(planContents));
  ok('stderr says --force notice', /--force used/.test(r.stderr));
}

section('scaffold-phase 2 --continue --dry-run: no mutation');
{
  const dir = mkFixtureWithIncompletePhase1('contdry');
  const before = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  const r = runCp(dir, ['scaffold-phase', '2', '--name', 'D', '--continue', '--dry-run']);
  ok('exit 0', r.status === 0);
  const after = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  ok('no new commits', before === after);
  const phaseDirs = fs.readdirSync(path.join(dir, '.planning', 'phases'));
  ok('no phase 2 dir', !phaseDirs.some((d) => d.startsWith('02-')));
}

section('scaffold-phase 2 --continue on CLEAN prior phase still works (no-op note)');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-cont-clean-'));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-greet'), { recursive: true });
  // Phase 1 with NO ticked plans — prior audit would pass cleanly.
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    `# x\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [ ] 01-01: hi\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\n---\n# Phase 1\n\n## Plans\n- [ ] 01-01: hi\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    `# x\n\n## Current Position\n\nPhase: 1\nPlan: 01-01\nStatus: x\nCurrent focus: x\nLast activity: x\n\nProgress: [          ] 0%\n\n## Decisions\n\n(none)\n`);
  execSync('git add -A && git commit -q -m seed', { cwd: dir });
  const r = runCp(dir, ['scaffold-phase', '2', '--name', 'Clean', '--continue']);
  ok('exit 0', r.status === 0, r.stderr);
  const phaseDirs = fs.readdirSync(path.join(dir, '.planning', 'phases'));
  const newDir = phaseDirs.find((d) => d.startsWith('02-'));
  const plan = fs.readFileSync(path.join(dir, '.planning', 'phases', newDir, 'PLAN.md'), 'utf8');
  // Still adds the note (even when missing-summaries is empty)
  ok('PLAN still has Continues-from note', /\*\*Continues from\*\*:/.test(plan));
  ok('no missing-summaries line', !/missing summaries/.test(plan));
}

console.log('\n----------------------------------------');
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
