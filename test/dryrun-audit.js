'use strict';

/**
 * Integration test for `cp audit` CLI (v0.8 Phase 24).
 *
 * Spawns the cp binary in temp projects with various drift scenarios
 * and verifies exit codes, JSON shape, severity rendering, filters.
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

function runCp(args, cwd) {
  return spawnSync(process.execPath, [cpBin, ...args], { cwd, encoding: 'utf8' });
}

function mkFixture(suffix, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-audit-cli-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    `---\nproject: demo\n---\n# demo\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [ ] 01-01: hello\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\n---\n# Phase 1\n\n## Plans\n- [ ] 01-01: hello\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    `# Project State\n\n## Current Position\n\nPhase: 1\nPlan: 01-01\nStatus: Ready\nCurrent focus: x\nLast activity: x\n\nProgress: [██████████] 0%\n\n## Decisions\n\n(none)\n`);
  execSync('git add -A && git commit -q -m seed', { cwd: dir });
  // Inject the real HEAD SHA so the test doesn't spuriously hit invalid-base-commit.
  if (opts.realBaseCommit !== false) {
    const sha = execSync('git rev-parse HEAD', { cwd: dir }).toString().trim();
    const planPath = path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md');
    let pc = fs.readFileSync(planPath, 'utf8');
    pc = pc.replace(/^---\n/, `---\nbase-commit: ${sha}\n`);
    fs.writeFileSync(planPath, pc);
    execSync('git add -A && git commit -q -m pin', { cwd: dir });
  }
  // Regenerate STATE so the "state-stale" check doesn't fire on clean
  // fixtures. Tests that need a stale STATE can overwrite afterwards.
  if (opts.regenState !== false) {
    try { require('../lib/state').regenerate(dir); } catch (_) {}
    try {
      execSync('git add -A && git commit -q -m state-regen', { cwd: dir });
    } catch (_) {}
  }
  return dir;
}

// ---------- clean project ----------

section('cp audit (clean) -> exit 0 + "no findings"');
{
  const dir = mkFixture('clean');
  const r = runCp(['audit'], dir);
  ok('exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr} stdout=${r.stdout}`);
  ok('mentions no findings', /no findings/.test(r.stdout));
}

section('cp audit --quiet (clean) -> exit 0 + silent');
{
  const dir = mkFixture('clean-q');
  const r = runCp(['audit', '--quiet'], dir);
  ok('exit 0', r.status === 0);
  ok('stdout empty', r.stdout.trim() === '', `stdout=${JSON.stringify(r.stdout)}`);
}

// ---------- planted HIGH drift ----------

section('cp audit (tick without SUMMARY) -> exit 2 + HIGH finding');
{
  const dir = mkFixture('high');
  // Tick 01-01 without writing SUMMARY (manual tick to avoid touching files)
  const rmd = path.join(dir, '.planning', 'ROADMAP.md');
  const pmd = path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md');
  fs.writeFileSync(rmd, fs.readFileSync(rmd, 'utf8').replace('- [ ] 01-01', '- [x] 01-01'));
  fs.writeFileSync(pmd, fs.readFileSync(pmd, 'utf8').replace('- [ ] 01-01', '- [x] 01-01'));
  execSync('git add -A && git commit -q -m tick', { cwd: dir });
  const r = runCp(['audit'], dir);
  ok('exit 2 (HIGH)', r.status === 2, `status=${r.status}`);
  ok('HIGH section in stdout', /\[HIGH\]/.test(r.stdout));
  ok('ticked-without-summary listed', /ticked-without-summary/.test(r.stdout));
  ok('fix hint shown', /cp write-summary 01-01/.test(r.stdout));
}

// ---------- LOW only ----------

section('cp audit (LOW only) -> exit 1');
{
  const dir = mkFixture('low');
  // Create a SUMMARY for 01-02 with end-commit + matching expected-key-files
  // mismatch to trigger LOW. Simplest: just create a SUMMARY without tick
  // -> MEDIUM. Then for LOW: hand-edit STATE to make it stale.
  // For simplicity: stale STATE.md derived block.
  const statePath = path.join(dir, '.planning', 'STATE.md');
  fs.writeFileSync(statePath,
    `# Project State\n\n## Current Position\n\nPhase: 99 (stale)\nPlan: 99-99\nStatus: stale\nCurrent focus: stale\nLast activity: stale\n\nProgress: [░░░░░░░░░░] 0%\n\n## Decisions\n\n(none)\n`);
  execSync('git add -A && git commit -q -m stale', { cwd: dir });
  const r = runCp(['audit'], dir);
  // Exit 1 if only LOW/MEDIUM. May be 1 or 2 depending on what else fires.
  ok('exit 1 or 2 (some finding)', r.status === 1 || r.status === 2, `status=${r.status} stdout=${r.stdout}`);
  ok('state-stale listed', /state-stale/.test(r.stdout));
}

// ---------- --json output ----------

section('cp audit --json -> valid JSON with shape');
{
  const dir = mkFixture('json');
  const r = runCp(['audit', '--json'], dir);
  ok('exit 0 (clean)', r.status === 0, `status=${r.status}`);
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch (e) { parsed = null; }
  ok('valid JSON', parsed !== null, `stdout=${JSON.stringify(r.stdout).slice(0, 200)}`);
  ok('has findings', parsed && Array.isArray(parsed.findings));
  ok('has summary', parsed && parsed.summary && typeof parsed.summary.high === 'number');
  ok('has exit_code', parsed && typeof parsed.exit_code === 'number');
}

// ---------- --strict ----------

section('cp audit --strict (no HIGH but has LOW) -> exit 2');
{
  const dir = mkFixture('strict');
  // Hand-edit STATE so state-stale (LOW) fires
  const statePath = path.join(dir, '.planning', 'STATE.md');
  fs.writeFileSync(statePath,
    `# Project State\n\n## Current Position\n\nPhase: 99\nPlan: 99-99\nStatus: stale\nCurrent focus: stale\nLast activity: stale\n\nProgress: [░░░░░░░░░░] 0%\n\n## Decisions\n\n(none)\n`);
  execSync('git add -A && git commit -q -m stale', { cwd: dir });
  // First: confirm without --strict it's exit 1
  const r1 = runCp(['audit'], dir);
  ok('without --strict: exit 1', r1.status === 1, `status=${r1.status} stdout=${r1.stdout}`);
  // With --strict: should be exit 2
  const r2 = runCp(['audit', '--strict'], dir);
  ok('with --strict: exit 2', r2.status === 2, `status=${r2.status}`);
  ok('strict notice in stdout', /--strict/.test(r2.stdout));
}

// ---------- --phase filter ----------

section('cp audit --phase 99 -> no findings');
{
  const dir = mkFixture('phasefilter');
  // Plant: tick 01-01 without SUMMARY
  const rmd = path.join(dir, '.planning', 'ROADMAP.md');
  const pmd = path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md');
  fs.writeFileSync(rmd, fs.readFileSync(rmd, 'utf8').replace('- [ ] 01-01', '- [x] 01-01'));
  fs.writeFileSync(pmd, fs.readFileSync(pmd, 'utf8').replace('- [ ] 01-01', '- [x] 01-01'));
  execSync('git add -A && git commit -q -m tick', { cwd: dir });
  const r99 = runCp(['audit', '--phase', '99', '--json'], dir);
  ok('phase 99 exit 0', r99.status === 0, `status=${r99.status}`);
  const r1 = runCp(['audit', '--phase', '1'], dir);
  ok('phase 1 exit 2', r1.status === 2);
}

// ---------- unknown flag ----------

section('cp audit --bogus -> exit 2');
{
  const dir = mkFixture('bogus');
  const r = runCp(['audit', '--bogus'], dir);
  ok('exit 2', r.status === 2, `status=${r.status}`);
  ok('stderr names flag', /--bogus/.test(r.stderr));
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
