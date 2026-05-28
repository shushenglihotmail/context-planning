'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const quick = require('../lib/quick-helpers');
const lifecycle = require('../lib/run-lifecycle');
const supervisor = require('../lib/supervisor');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }
function mkdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-rl-')); }

// ---------- quick-helpers ----------

section('quick.setup creates DESIGN.md + STATE.md');
{
  const dir = mkdir();
  const r = quick.setup({ task: 'Add dark mode toggle', projectDir: dir, now: new Date('2025-01-15T00:00:00Z') });
  ok('ok=true', r.ok, r.error);
  ok('slug has date prefix', /^2025-01-15-/.test(r.slug));
  ok('DESIGN.md written', fs.existsSync(path.join(r.dir, 'DESIGN.md')));
  ok('STATE.md written', fs.existsSync(path.join(r.dir, 'STATE.md')));
  const design = fs.readFileSync(path.join(r.dir, 'DESIGN.md'), 'utf8');
  ok('DESIGN mentions task', design.indexOf('Add dark mode toggle') !== -1);
}

section('quick.setup rejects missing task');
{
  const dir = mkdir();
  const r = quick.setup({ projectDir: dir });
  ok('ok=false', !r.ok);
}

section('quick.setup uses custom slug when given');
{
  const dir = mkdir();
  const r = quick.setup({ task: 'X', slug: 'custom', projectDir: dir, now: new Date('2025-06-01T00:00:00Z') });
  ok('slug uses custom', r.slug === '2025-06-01-custom');
}

section('quick.setup refuses duplicate');
{
  const dir = mkdir();
  const t = new Date('2025-01-15T00:00:00Z');
  const r1 = quick.setup({ task: 'Foo', projectDir: dir, now: t });
  ok('first ok', r1.ok);
  const r2 = quick.setup({ task: 'Foo', projectDir: dir, now: t });
  ok('second refused', !r2.ok);
}

section('quick.finalize writes SUMMARY and updates STATE');
{
  const dir = mkdir();
  const r = quick.setup({ task: 'Y', projectDir: dir, now: new Date('2025-01-15T00:00:00Z') });
  const f = quick.finalize(r.slug, { projectDir: dir, outcome: 'Did the thing' });
  ok('finalize ok', f.ok, f.error);
  ok('SUMMARY exists', fs.existsSync(f.summaryPath));
  const summary = fs.readFileSync(f.summaryPath, 'utf8');
  ok('SUMMARY has outcome', summary.indexOf('Did the thing') !== -1);
  const state = fs.readFileSync(path.join(r.dir, 'STATE.md'), 'utf8');
  ok('STATE flipped to complete', /Status: complete/.test(state));
}

section('quick.finalize rejects unknown slug');
{
  const dir = mkdir();
  fs.mkdirSync(path.join(dir, '.planning', 'quick'), { recursive: true });
  const r = quick.finalize('2025-01-01-nope', { projectDir: dir });
  ok('ok=false', !r.ok);
}

// ---------- run-lifecycle ----------

function initRun(dir, slug, extra) {
  return supervisor.initRun(slug, Object.assign({ workflow: 'dev', status: 'in_progress' }, extra || {}), { projectDir: dir });
}

section('lifecycle.abandon flips state to abandoned');
{
  const dir = mkdir();
  initRun(dir, 'run-a');
  const r = lifecycle.abandon('run-a', { projectDir: dir, reason: 'pivot' });
  ok('ok=true', r.ok);
  const state = supervisor.readState('run-a', { projectDir: dir });
  ok('status=abandoned', state.status === 'abandoned');
  ok('reason recorded', state.abandon_reason === 'pivot');
}

section('lifecycle.abandon is idempotent');
{
  const dir = mkdir();
  initRun(dir, 'run-b');
  lifecycle.abandon('run-b', { projectDir: dir });
  const r = lifecycle.abandon('run-b', { projectDir: dir });
  ok('ok=true', r.ok);
  ok('already=true', r.already === true);
}

section('lifecycle.abandon fails on missing run');
{
  const dir = mkdir();
  fs.mkdirSync(path.join(dir, '.planning', 'runs'), { recursive: true });
  const r = lifecycle.abandon('nope', { projectDir: dir });
  ok('ok=false', !r.ok);
}

section('lifecycle.list enumerates runs and filters');
{
  const dir = mkdir();
  initRun(dir, 'run-x', { workflow: 'dev', status: 'in_progress' });
  initRun(dir, 'run-y', { workflow: 'quick', status: 'in_progress' });
  initRun(dir, 'run-z', { workflow: 'dev', status: 'completed' });
  const all = lifecycle.list({ projectDir: dir });
  ok('three runs', all.runs.length === 3);
  const dev = lifecycle.list({ projectDir: dir, workflow: 'dev' });
  ok('two dev runs', dev.runs.length === 2);
  const inProg = lifecycle.list({ projectDir: dir, status: 'in_progress' });
  ok('two in_progress', inProg.runs.length === 2);
}

section('lifecycle.list returns empty when runs dir absent');
{
  const dir = mkdir();
  const r = lifecycle.list({ projectDir: dir });
  ok('runs empty', r.ok && r.runs.length === 0);
}

section('lifecycle.singleRunStatus returns state');
{
  const dir = mkdir();
  initRun(dir, 'run-s');
  const r = lifecycle.singleRunStatus('run-s', { projectDir: dir });
  ok('ok=true', r.ok);
  ok('state.run_id matches', r.state.run_id === 'run-s');
}

section('lifecycle.singleRunStatus fails on missing run');
{
  const dir = mkdir();
  fs.mkdirSync(path.join(dir, '.planning', 'runs'), { recursive: true });
  const r = lifecycle.singleRunStatus('nope', { projectDir: dir });
  ok('ok=false', !r.ok);
}

console.log(`\n${failed === 0 ? 'All' : ''} run-lifecycle checks ${failed === 0 ? 'passed' : 'failed'}. (${passed} passed, ${failed} failed)`);
process.exit(failed === 0 ? 0 : 1);
