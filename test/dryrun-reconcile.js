#!/usr/bin/env node
/**
 * Dryrun (spawn-based) tests for `cp reconcile`. v0.8 Phase 26 (P10).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const fm = require('../lib/frontmatter');

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

function mkFixture(suffix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-rec-cli-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    `# x\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [ ] 01-01: hi\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\n---\n# Phase 1\n\n## Plans\n- [ ] 01-01: hi\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    `# Project State\n\n## Current Position\n\nPhase: 1\nPlan: 01-01\nStatus: Ready\nCurrent focus: x\nLast activity: x\n\nProgress: [██████████] 0%\n\n## Decisions\n\n(none)\n`);
  execSync('git add -A && git commit -q -m seed', { cwd: dir });
  // A real plan commit
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  execSync('git add -A && git commit -q -m "cp(01-01): plan work"', { cwd: dir });
  return dir;
}

section('cp reconcile <N> --infer-shas: backfills base-commit + atomic commit');
{
  const dir = mkFixture('infer');
  const before = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  const r = runCp(dir, ['reconcile', '1', '--infer-shas']);
  ok('exit 0', r.status === 0, JSON.stringify({ stdout: r.stdout, stderr: r.stderr }));
  ok('stdout mentions written', /wrote base-commit=/.test(r.stdout));
  const planContents = fs.readFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  const parsed = fm.parse(planContents);
  ok('PLAN.md has base-commit', typeof parsed.frontmatter['base-commit'] === 'string' && parsed.frontmatter['base-commit'].length >= 7);
  const after = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  ok('atomic commit added', parseInt(after, 10) === parseInt(before, 10) + 1);
  const subj = execSync('git log -1 --format=%s', { cwd: dir }).toString().trim();
  ok('commit subject cp(reconcile)', /^cp\(reconcile\): phase 1 base-commit /.test(subj));
}

section('cp reconcile <N> --infer-shas --dry-run: no mutation, no commit');
{
  const dir = mkFixture('dry');
  const before = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  const planBefore = fs.readFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  const r = runCp(dir, ['reconcile', '1', '--infer-shas', '--dry-run']);
  ok('exit 0', r.status === 0);
  ok('stdout has (dry-run) tag', /\(dry-run\)/.test(r.stdout));
  ok('stdout uses "would write"', /would write base-commit/.test(r.stdout));
  const after = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  ok('no new commits', before === after);
  const planAfter = fs.readFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  ok('PLAN unchanged', planBefore === planAfter);
}

section('cp reconcile <N> --infer-shas --json: machine-readable');
{
  const dir = mkFixture('json');
  const r = runCp(dir, ['reconcile', '1', '--infer-shas', '--json']);
  ok('exit 0', r.status === 0);
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch (_) {}
  ok('valid JSON', parsed && typeof parsed === 'object');
  ok('json.phase=1', parsed && parsed.phase === '1');
  ok('json.applied=1', parsed && parsed.applied === 1);
  ok('json.failed=0', parsed && parsed.failed === 0);
  ok('json.ok=true', parsed && parsed.ok === true);
}

section('cp reconcile <N> --accept: rewrites expected-key-files');
{
  const dir = mkFixture('accept');
  // Plant a SUMMARY with key-files, and an expected-key-files in PLAN that mismatches.
  const planPath = path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md');
  fs.writeFileSync(planPath,
    `---\nphase: "1"\nname: Greet\nexpected-key-files:\n  "01-01":\n    - lib/wrong.js\n---\n# Phase 1\n\n## Plans\n- [x] 01-01: hi\n`);
  const sumPath = path.join(dir, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md');
  fs.writeFileSync(sumPath,
    `---\nplan: "01-01"\nphase: "1"\nsubsystem: g\nkey-files:\n  created: ["src/a.js"]\n  modified: ["lib/b.js"]\nkey-decisions: ["x"]\n---\nbody\n`);
  execSync('git add -A && git commit -q -m "drift setup"', { cwd: dir });
  const r = runCp(dir, ['reconcile', '1', '--accept', '--plan', '01-01']);
  ok('exit 0', r.status === 0, JSON.stringify({ stderr: r.stderr, stdout: r.stdout }));
  const parsed = fm.parse(fs.readFileSync(planPath, 'utf8'));
  const ekf = parsed.frontmatter['expected-key-files'];
  ok('ekf object', ekf && typeof ekf === 'object');
  ok('01-01 has src/a.js', Array.isArray(ekf['01-01']) && ekf['01-01'].includes('src/a.js'));
  ok('01-01 has lib/b.js', ekf['01-01'].includes('lib/b.js'));
  ok('lib/wrong.js gone', !ekf['01-01'].includes('lib/wrong.js'));
}

section('cp reconcile <N> requires --infer-shas or --accept');
{
  const dir = mkFixture('noflag');
  const r = runCp(dir, ['reconcile', '1']);
  ok('exit 2', r.status === 2);
  ok('stderr explains', /one of --infer-shas or --accept/.test(r.stderr));
}

section('cp reconcile without phaseNum errors');
{
  const dir = mkFixture('nophase');
  const r = runCp(dir, ['reconcile', '--infer-shas']);
  ok('exit 2', r.status === 2);
  ok('stderr explains', /phaseNum/.test(r.stderr) || /required/.test(r.stderr));
}

section('cp reconcile <N> --infer-shas (idempotent on second run)');
{
  const dir = mkFixture('idem');
  const r1 = runCp(dir, ['reconcile', '1', '--infer-shas']);
  ok('first run exit 0', r1.status === 0);
  const r2 = runCp(dir, ['reconcile', '1', '--infer-shas']);
  ok('second run exit 0', r2.status === 0, JSON.stringify({ stderr: r2.stderr, stdout: r2.stdout }));
  ok('second run reports already-set', /already set/.test(r2.stdout) || /Nothing to reconcile/.test(r2.stdout));
}

console.log('\n----------------------------------------');
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
