'use strict';

/**
 * Integration test for `cp state regen` CLI verb (v0.8 Phase 20).
 *
 * Spawns the cp binary in a temp project and verifies:
 *   - default invocation rewrites a stale STATE block
 *   - second run reports unchanged
 *   - --dry-run does not touch disk
 *   - --quiet suppresses output
 *   - usage / unknown subcommand prints help and exits 2
 *   - missing .planning => exit 0 with "skipped"
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const cpBin = path.resolve(__dirname, '..', 'bin', 'cp.js');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function mkFixture(suffix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-state-cli-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    `---\nproject: demo\n---\n# demo\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [ ] 01-01: hello\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: 1\nname: Greet\nplans: [01-01, 01-02]\n---\n# Phase 1\n\n## Plans\n- [ ] 01-01: hello\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    `# Project State\n\n## Current Position\n\nPhase: 99 (stale)\nPlan: 99-99\nStatus: stale-marker\nCurrent focus: stale\nLast activity: 1970-01-01 — stale\n\nProgress: [░░░░░░░░░░] 0%\n\n## Accumulated Context\n\n### Decisions\n\n(none yet)\n`);
  execSync('git add -A && git commit -q -m "cp: scaffold demo"', { cwd: dir });
  return dir;
}

function runCp(args, cwd) {
  return spawnSync(process.execPath, [cpBin, ...args], { cwd, encoding: 'utf8' });
}

// ---------- regen rewrites stale STATE ----------

section('cp state regen: rewrites stale STATE');
{
  const dir = mkFixture('rewrite');
  const r = runCp(['state', 'regen'], dir);
  ok('exit 0', r.status === 0, `stderr=${r.stderr} stdout=${r.stdout}`);
  ok('stdout reports rewritten', /rewritten/.test(r.stdout), `stdout=${JSON.stringify(r.stdout)}`);
  ok('stdout shows phase=1', /phase=1/.test(r.stdout));
  ok('stdout shows plan=01-01', /plan=01-01/.test(r.stdout));
  const after = fs.readFileSync(path.join(dir, '.planning', 'STATE.md'), 'utf8');
  ok('STATE.md no longer has stale marker', !/stale-marker/.test(after));
  ok('STATE.md curated Decisions preserved', /### Decisions/.test(after));
}

// ---------- second run is unchanged ----------

section('cp state regen: idempotent second run reports unchanged');
{
  const dir = mkFixture('noop');
  runCp(['state', 'regen'], dir);
  const r = runCp(['state', 'regen'], dir);
  ok('exit 0', r.status === 0);
  ok('stdout says unchanged', /unchanged/.test(r.stdout));
}

// ---------- --dry-run ----------

section('cp state regen --dry-run: no disk write');
{
  const dir = mkFixture('dry');
  const stPath = path.join(dir, '.planning', 'STATE.md');
  const before = fs.readFileSync(stPath, 'utf8');
  const r = runCp(['state', 'regen', '--dry-run'], dir);
  ok('exit 0', r.status === 0);
  ok('stdout mentions dry-run', /dry-run/.test(r.stdout), `stdout=${r.stdout}`);
  const after = fs.readFileSync(stPath, 'utf8');
  ok('STATE.md unchanged on disk', before === after);
}

// ---------- --quiet ----------

section('cp state regen --quiet: no output');
{
  const dir = mkFixture('quiet');
  const r = runCp(['state', 'regen', '--quiet'], dir);
  ok('exit 0', r.status === 0);
  ok('stdout empty', r.stdout === '', `stdout=${JSON.stringify(r.stdout)}`);
  ok('stderr empty', r.stderr === '', `stderr=${JSON.stringify(r.stderr)}`);
}

// ---------- unknown subcommand ----------

section('cp state: unknown subcommand exits 2');
{
  const dir = mkFixture('bad');
  const r = runCp(['state', 'wat'], dir);
  ok('exit 2', r.status === 2, `status=${r.status}`);
  ok('stderr mentions unknown', /unknown subcommand/.test(r.stderr));
}

// ---------- unknown flag ----------

section('cp state regen --bogus: exit 2');
{
  const dir = mkFixture('badflag');
  const r = runCp(['state', 'regen', '--bogus'], dir);
  ok('exit 2', r.status === 2);
  ok('stderr names the bad flag', /--bogus/.test(r.stderr));
}

// ---------- no .planning directory => skipped ----------

section('cp state regen: missing .planning => skipped (exit 0)');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-state-cli-noplan-'));
  execSync('git init -q -b main', { cwd: dir });
  const r = runCp(['state', 'regen'], dir);
  ok('exit 0', r.status === 0);
  ok('stderr says skipped', /skipped/.test(r.stderr), `stderr=${r.stderr}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
