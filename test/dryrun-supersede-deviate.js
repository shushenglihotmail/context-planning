#!/usr/bin/env node
/**
 * Dryrun (spawn-based) tests for `cp supersede` and `cp deviate`.
 * v0.8 Phase 26 (P10).
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

function mkFixture(suffix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-sd-cli-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    `# x\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [ ] 01-01: hi\n- [x] 01-02: bye\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\n---\n# Phase 1\n\n## Plans\n- [ ] 01-01: hi\n- [x] 01-02: bye\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    `# x\n\n## Current Position\n\nPhase: 1\nPlan: 01-01\nStatus: x\nCurrent focus: x\nLast activity: x\n\nProgress: [          ] 0%\n\n## Decisions\n\n(none)\n`);
  execSync('git add -A && git commit -q -m seed', { cwd: dir });
  return dir;
}

// ---------- cp supersede ----------

section('cp supersede <id> --by <id>: marks [~] + atomic commit');
{
  const dir = mkFixture('sup1');
  const before = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  const r = runCp(dir, ['supersede', '01-01', '--by', '02-03', '--reason', 'rescoped']);
  ok('exit 0', r.status === 0, JSON.stringify({ stdout: r.stdout, stderr: r.stderr }));
  ok('stdout mentions [~]', /\[~\]/.test(r.stdout) || /superseded/.test(r.stdout));
  const roadmap = fs.readFileSync(path.join(dir, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP 01-01 is [~]', /- \[~\] 01-01:/.test(roadmap));
  const plan = fs.readFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  ok('PLAN has supersede note', /superseded by 02-03/.test(plan));
  const after = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  ok('atomic commit added', parseInt(after, 10) === parseInt(before, 10) + 1);
  const subj = execSync('git log -1 --format=%s', { cwd: dir }).toString().trim();
  ok('commit subject cp(supersede)', /^cp\(supersede\): 01-01 superseded by 02-03/.test(subj));
}

section('cp supersede: --dry-run does not mutate');
{
  const dir = mkFixture('sup2');
  const before = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  const roadmapBefore = fs.readFileSync(path.join(dir, '.planning', 'ROADMAP.md'), 'utf8');
  const r = runCp(dir, ['supersede', '01-01', '--by', '02-03', '--dry-run']);
  ok('exit 0', r.status === 0);
  ok('stdout has (dry-run)', /\(dry-run\)/.test(r.stdout));
  const after = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  ok('no commit', before === after);
  ok('ROADMAP unchanged', roadmapBefore === fs.readFileSync(path.join(dir, '.planning', 'ROADMAP.md'), 'utf8'));
}

section('cp supersede: missing --by errors');
{
  const dir = mkFixture('sup3');
  const r = runCp(dir, ['supersede', '01-01']);
  ok('exit 2', r.status === 2);
  ok('stderr explains', /--by/.test(r.stderr));
}

section('cp supersede: missing planId errors');
{
  const dir = mkFixture('sup4');
  const r = runCp(dir, ['supersede', '--by', '02-01']);
  ok('exit 2', r.status === 2);
}

section('cp supersede --json: machine-readable');
{
  const dir = mkFixture('sup5');
  const r = runCp(dir, ['supersede', '01-01', '--by', '02-03', '--json']);
  ok('exit 0', r.status === 0);
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch (_) {}
  ok('valid JSON', parsed && parsed.ok === true);
  ok('json.planId=01-01', parsed && parsed.planId === '01-01');
  ok('json.by=02-03', parsed && parsed.by === '02-03');
  ok('json.changed=true', parsed && parsed.changed === true);
  ok('json.commit is short sha', parsed && typeof parsed.commit === 'string');
}

// ---------- cp deviate ----------

section('cp deviate <N> --summary "...": appends Deviation block + atomic commit');
{
  const dir = mkFixture('dev1');
  const before = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  const r = runCp(dir, ['deviate', '1', '--summary', 'switched lib X', '--reason', 'X bug']);
  ok('exit 0', r.status === 0, JSON.stringify({ stdout: r.stdout, stderr: r.stderr }));
  const plan = fs.readFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  ok('PLAN has ## Deviation', /^##\s+Deviation\s+\d{4}-\d{2}-\d{2}\s*$/m.test(plan));
  ok('summary in block', /switched lib X/.test(plan));
  ok('reason in block', /X bug/.test(plan));
  const after = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  ok('atomic commit added', parseInt(after, 10) === parseInt(before, 10) + 1);
  const subj = execSync('git log -1 --format=%s', { cwd: dir }).toString().trim();
  ok('subject cp(deviate) prefix', /^cp\(deviate\): 1 /.test(subj));
}

section('cp deviate: --dry-run does not mutate');
{
  const dir = mkFixture('dev2');
  const before = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  const planBefore = fs.readFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  const r = runCp(dir, ['deviate', '1', '--summary', 'something', '--dry-run']);
  ok('exit 0', r.status === 0);
  ok('stdout has (dry-run)', /\(dry-run\)/.test(r.stdout));
  const after = execSync('git rev-list --count HEAD', { cwd: dir }).toString().trim();
  ok('no commit', before === after);
  ok('PLAN unchanged', planBefore === fs.readFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8'));
}

section('cp deviate: --summary required');
{
  const dir = mkFixture('dev3');
  const r = runCp(dir, ['deviate', '1']);
  ok('exit 2', r.status === 2);
  ok('stderr explains', /--summary/.test(r.stderr));
}

section('cp deviate: missing phaseNum errors');
{
  const dir = mkFixture('dev4');
  const r = runCp(dir, ['deviate', '--summary', 'x']);
  ok('exit 2', r.status === 2);
}

console.log('\n----------------------------------------');
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
