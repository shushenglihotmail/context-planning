'use strict';

/**
 * Integration test for `cp write-summary` CLI flag handling.
 *
 * v0.8 P2: verifies --no-auto-key-files opt-out and the default-on
 * behavior + stderr notice contents.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-ws-cli-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), `---\nproject: demo\n---\n# demo\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [ ] 01-01: hello\n`);
  fs.writeFileSync(path.join(dir, 'README.md'), '# initial\n');
  execSync('git add -A && git commit -q -m base', { cwd: dir });
  const baseSha = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: 1\nname: Greet\nbase-commit: ${baseSha}\nplans: [01-01]\n---\n# Phase 1\n\n## Plans\n- [ ] 01-01: hello\n`);
  fs.writeFileSync(path.join(dir, 'README.md'), '# touched\n');
  fs.writeFileSync(path.join(dir, 'src.js'), 'x\n');
  execSync('git add -A && git commit -q -m work', { cwd: dir });
  return dir;
}

function runCp(args, cwd) {
  return spawnSync(process.execPath, [cpBin, ...args], {
    cwd, encoding: 'utf8',
  });
}

section('cp write-summary auto-fills key-files by default (v0.8 P2)');
{
  const dir = mkFixture('default');
  const fromPath = path.join(dir, 'from.json');
  fs.writeFileSync(fromPath, JSON.stringify({
    subsystem: 'greet',
    'key-decisions': ['x'],
  }));
  const r = runCp(['write-summary', '01-01', '--from', fromPath], dir);
  ok('exit code 0', r.status === 0, `stderr: ${r.stderr}`);
  ok('stderr has auto-fill notice', /key-files auto-filled/.test(r.stderr),
    `stderr=${JSON.stringify(r.stderr)}`);
  const summary = fs.readFileSync(path.join(dir, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md'), 'utf8');
  ok('summary has key-files block', /key-files:/.test(summary));
  ok('summary lists src.js (created)', /src\.js/.test(summary));
  ok('summary lists README.md (modified)', /README\.md/.test(summary));
}

section('cp write-summary --no-auto-key-files opts out (v0.8 P2)');
{
  const dir = mkFixture('opt-out');
  const fromPath = path.join(dir, 'from.json');
  fs.writeFileSync(fromPath, JSON.stringify({
    subsystem: 'greet',
    'key-decisions': ['x'],
  }));
  const r = runCp(['write-summary', '01-01', '--from', fromPath, '--no-auto-key-files'], dir);
  ok('exit code 0', r.status === 0, `stderr: ${r.stderr}`);
  ok('NO auto-fill notice in stderr', !/auto-filled/.test(r.stderr),
    `stderr=${JSON.stringify(r.stderr)}`);
  const summary = fs.readFileSync(path.join(dir, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md'), 'utf8');
  ok('summary has no src.js/README key-files entries',
    !/src\.js/.test(summary) && !/README\.md/.test(summary));
}

section('cp write-summary usage string lists --no-auto-key-files');
{
  const dir = mkFixture('usage');
  const r = runCp(['write-summary'], dir);
  ok('exit code 2', r.status === 2);
  ok('usage mentions --no-auto-key-files',
    /--no-auto-key-files/.test(r.stderr), `stderr=${JSON.stringify(r.stderr)}`);
  ok('usage mentions --no-file-check',
    /--no-file-check/.test(r.stderr), `stderr=${JSON.stringify(r.stderr)}`);
}

// ---------- v0.8 P3 (Phase 19): file-existence hard-block via CLI ----------

section('cp write-summary blocks phantom key-files path (v0.8 P3)');
{
  const dir = mkFixture('p3-phantom');
  const fromPath = path.join(dir, 'from.json');
  fs.writeFileSync(fromPath, JSON.stringify({
    subsystem: 'x',
    'key-decisions': ['x'],
    'key-files': { created: ['lib/phantom-cli.js'], modified: [] },
  }));
  const r = runCp(['write-summary', '01-01', '--from', fromPath, '--no-auto-key-files'], dir);
  ok('exit code 2', r.status === 2, `stderr=${r.stderr}`);
  ok('stderr says missing on disk', /missing on disk/.test(r.stderr));
  ok('stderr names lib/phantom-cli.js',
    /lib\/phantom-cli\.js/.test(r.stderr), `stderr=${r.stderr}`);
  ok('summary NOT written',
    !fs.existsSync(path.join(dir, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md')));
}

section('cp write-summary --no-file-check bypasses P3 hard-block');
{
  const dir = mkFixture('p3-opt-out');
  const fromPath = path.join(dir, 'from.json');
  fs.writeFileSync(fromPath, JSON.stringify({
    subsystem: 'x',
    'key-decisions': ['x'],
    'key-files': { created: ['lib/phantom-cli.js'], modified: [] },
  }));
  const r = runCp(['write-summary', '01-01', '--from', fromPath, '--no-auto-key-files', '--no-file-check'], dir);
  ok('exit code 0 with --no-file-check', r.status === 0, `stderr=${r.stderr}`);
  const summary = fs.readFileSync(path.join(dir, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md'), 'utf8');
  ok('summary preserves phantom path when opted out',
    /lib\/phantom-cli\.js/.test(summary));
}

// ---------- v0.8 P5: --strict-expected and --no-expected-check (Phase 21) ----------

function addExpectedToPlan(dir, expectedLine) {
  // expectedLine: e.g. `  - lib/x.js`
  const planPath = path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md');
  const orig = fs.readFileSync(planPath, 'utf8');
  const next = orig.replace(/^---\n/, `---\nexpected-key-files:\n${expectedLine}\n`);
  fs.writeFileSync(planPath, next);
  execSync('git add -A && git commit -q -m "add expected"', { cwd: dir });
}

section('cp write-summary emits drift notice with PLAN expected-key-files (v0.8 P5)');
{
  const dir = mkFixture('p5-drift');
  addExpectedToPlan(dir, '  - lib/x.js');
  const fromPath = path.join(dir, 'from.json');
  fs.writeFileSync(fromPath, JSON.stringify({ subsystem: 'g', 'key-decisions': ['x'] }));
  const r = runCp(['write-summary', '01-01', '--from', fromPath], dir);
  ok('exit code 0 (soft notice, not block)', r.status === 0, `stderr=${r.stderr}`);
  ok('stderr names drift', /expected-vs-actual drift/.test(r.stderr),
    `stderr=${JSON.stringify(r.stderr)}`);
  const summary = fs.readFileSync(path.join(dir, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md'), 'utf8');
  ok('summary key-decisions records drift', /expected-vs-actual drift/.test(summary));
}

section('cp write-summary --strict-expected hard-blocks on drift');
{
  const dir = mkFixture('p5-strict');
  addExpectedToPlan(dir, '  - lib/x.js');
  const fromPath = path.join(dir, 'from.json');
  fs.writeFileSync(fromPath, JSON.stringify({ subsystem: 'g', 'key-decisions': ['x'] }));
  const r = runCp(['write-summary', '01-01', '--from', fromPath, '--strict-expected'], dir);
  ok('exit code 2 (validation error)', r.status === 2, `status=${r.status}`);
  ok('stderr names drift', /expected-vs-actual drift/.test(r.stderr));
  ok('no SUMMARY written', !fs.existsSync(path.join(dir, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md')));
}

section('cp write-summary --no-expected-check opts out');
{
  const dir = mkFixture('p5-optout');
  addExpectedToPlan(dir, '  - lib/x.js');
  const fromPath = path.join(dir, 'from.json');
  fs.writeFileSync(fromPath, JSON.stringify({ subsystem: 'g', 'key-decisions': ['x'] }));
  const r = runCp(['write-summary', '01-01', '--from', fromPath, '--no-expected-check'], dir);
  ok('exit code 0', r.status === 0);
  ok('no drift notice in stderr', !/expected-vs-actual drift/.test(r.stderr),
    `stderr=${JSON.stringify(r.stderr)}`);
  const summary = fs.readFileSync(path.join(dir, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md'), 'utf8');
  ok('summary has no drift sentence', !/expected-vs-actual drift/.test(summary));
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
