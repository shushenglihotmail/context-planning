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
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
