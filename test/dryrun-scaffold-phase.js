'use strict';

/**
 * Integration test for `cp scaffold-phase --force` (v0.8 Phase 22, P6).
 *
 * Spawns the cp binary in a temp project and verifies:
 *   - default refuses (exit 2) when prior phase has missing SUMMARYs
 *   - --force bypasses (exit 0) with stderr override notice
 *   - --force no-drift case still succeeds silently (no override notice)
 *   - happy path with summaries written succeeds silently
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-sp-force-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    `---\nproject: demo\n---\n# demo\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [ ] 01-01: hello\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\n---\n# Phase 1\n\n## Plans\n- [ ] 01-01: hello\n- [ ] 01-02: bye\n`);
  execSync('git add -A && git commit -q -m "cp: scaffold demo"', { cwd: dir });
  return dir;
}

function runCp(args, cwd) {
  return spawnSync(process.execPath, [cpBin, ...args], { cwd, encoding: 'utf8' });
}

function tickPlan(dir, planId) {
  // Mark a plan done in BOTH ROADMAP and PLAN.md, then commit (so working
  // tree is clean for the next cp command).
  const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
  const planPath = path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md');
  const re = new RegExp(`- \\[ \\] ${planId}:`, 'g');
  fs.writeFileSync(roadmapPath, fs.readFileSync(roadmapPath, 'utf8').replace(re, `- [x] ${planId}:`));
  fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8').replace(re, `- [x] ${planId}:`));
  execSync(`git add -A && git commit -q -m "tick ${planId}"`, { cwd: dir });
}

function writeSummaryStub(dir, planId) {
  const summaryPath = path.join(dir, '.planning', 'phases', '01-greet', `${planId}-SUMMARY.md`);
  fs.writeFileSync(summaryPath,
    `---\nplan: ${planId}\nsubsystem: g\nkey-decisions:\n  - d\n---\n# Summary ${planId}\n`);
  execSync('git add -A && git commit -q -m "summary"', { cwd: dir });
}

// ---------- default refusal ----------

section('cp scaffold-phase refuses when prior phase has missing SUMMARY');
{
  const dir = mkFixture('refuse');
  tickPlan(dir, '01-01');
  const r = runCp(['scaffold-phase', '2', '--name', 'Two', '--plans', '1'], dir);
  ok('exit code 2 (drift block)', r.status === 2, `status=${r.status} stderr=${r.stderr}`);
  ok('stderr names refusal', /prior phase 1 has ticked plans without SUMMARY/.test(r.stderr),
    `stderr=${JSON.stringify(r.stderr)}`);
  ok('stderr lists 01-01', /- 01-01/.test(r.stderr));
  ok('stderr suggests fix command', /cp write-summary 01-01/.test(r.stderr));
  ok('stderr mentions --force', /--force/.test(r.stderr));
  // Verify no phase 2 dir or ROADMAP change
  const phaseDirs = fs.readdirSync(path.join(dir, '.planning', 'phases'));
  ok('no phase 2 dir created', !phaseDirs.some((d) => /^02-/.test(d)),
    `dirs=${phaseDirs.join(',')}`);
  const roadmap = fs.readFileSync(path.join(dir, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP unchanged', !/^### Phase 2:/m.test(roadmap));
}

// ---------- --force bypass ----------

section('cp scaffold-phase --force bypasses the audit (with override notice)');
{
  const dir = mkFixture('force');
  tickPlan(dir, '01-01');
  const r = runCp(['scaffold-phase', '2', '--name', 'Two', '--plans', '1', '--force'], dir);
  ok('exit code 0 with --force', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('stderr names override', /--force used, skipping prior-summary check/.test(r.stderr),
    `stderr=${JSON.stringify(r.stderr)}`);
  // Verify phase 2 dir exists
  const phaseDirs = fs.readdirSync(path.join(dir, '.planning', 'phases'));
  ok('phase 2 dir created', phaseDirs.some((d) => /^02-/.test(d)),
    `dirs=${phaseDirs.join(',')}`);
}

// ---------- happy path: SUMMARY exists ----------

section('cp scaffold-phase succeeds silently when prior fully summarised');
{
  const dir = mkFixture('happy');
  tickPlan(dir, '01-01');
  tickPlan(dir, '01-02');
  writeSummaryStub(dir, '01-01');
  writeSummaryStub(dir, '01-02');
  const r = runCp(['scaffold-phase', '2', '--name', 'Two', '--plans', '1'], dir);
  ok('exit code 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('no override notice', !/--force used/.test(r.stderr));
  ok('no refusal in stderr', !/prior phase/.test(r.stderr));
}

// ---------- --force no-drift: still emits notice (transparency) ----------

section('cp scaffold-phase --force always emits notice (even when no drift)');
{
  const dir = mkFixture('force-clean');
  // No ticks at all → no drift even without --force.
  const r = runCp(['scaffold-phase', '2', '--name', 'Two', '--plans', '1', '--force'], dir);
  ok('exit code 0', r.status === 0, `status=${r.status}`);
  ok('override notice present (audit transparency)',
    /--force used, skipping prior-summary check/.test(r.stderr),
    `stderr=${JSON.stringify(r.stderr)}`);
}

// ---------- first phase: no prior ----------

section('cp scaffold-phase 1 (no prior phase) succeeds silently');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sp-firstphase-'));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    `---\nproject: demo\n---\n# demo\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n`);
  execSync('git add -A && git commit -q -m "init"', { cwd: dir });
  const r = runCp(['scaffold-phase', '1', '--name', 'First', '--plans', '1'], dir);
  ok('exit code 0 for first phase', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('no drift refusal', !/prior phase/.test(r.stderr));
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
