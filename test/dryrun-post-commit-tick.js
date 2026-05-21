#!/usr/bin/env node
/**
 * Integration test for post-commit tick-auto via bin/cp-hook.js
 * — v0.8 Phase 28 (P12).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const SHIM = path.join(PLUGIN_ROOT, 'bin', 'cp-hook.js');
const CP = path.join(PLUGIN_ROOT, 'bin', 'cp.js');
const NODE = process.execPath;

let passed = 0,
  failed = 0;
function ok(label, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.log(`  \u2717 ${label}${detail ? ' :: ' + detail : ''}`);
  }
}
function section(t) {
  console.log(`\n=== ${t} ===`);
}

function run(cmd, cwd, opts = {}) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function setupProject(suffix, opts = {}) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), `cp-pc-${suffix}-`))
  );
  execSync('git init -q -b main', { cwd: root });
  execSync('git config user.email t@l', { cwd: root });
  execSync('git config user.name t', { cwd: root });
  const phaseDir = path.join(root, '.planning', 'phases', '28-foo');
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(
    path.join(root, '.planning', 'ROADMAP.md'),
    `# x\n\n## Phases\n\n### 🚧 v0.8 (In Progress)\n\n### Phase 28: Foo\n\n- [ ] 28-01: alpha\n- [ ] 28-02: beta\n`
  );
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# x\n');
  fs.writeFileSync(
    path.join(phaseDir, 'PLAN.md'),
    [
      '---',
      'phase: "28"',
      'name: Foo',
      'expected-key-files:',
      '  "28-01":',
      '    - lib/foo.js',
      '    - test/foo.js',
      '---',
      '# Phase 28',
      '',
    ].join('\n')
  );
  // Enable tick-auto via config.
  fs.writeFileSync(
    path.join(root, '.planning', 'config.json'),
    JSON.stringify(
      {
        cp: opts.cp || { behavior: { post_commit: 'tick-auto' } },
      },
      null,
      2
    ) + '\n'
  );
  // Initial commit so HEAD exists.
  execSync('git add -A', { cwd: root });
  execSync('git commit -q -m "init"', { cwd: root });
  return root;
}

function runShim(cwd, event) {
  return spawnSync(NODE, [SHIM, event], { cwd, encoding: 'utf8' });
}

function readRoadmap(root) {
  return fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
}

// ----------------------------------------------------------------------
section('post-commit tick-auto — exact coverage triggers tick + commit');
{
  const root = setupProject('exact');
  // Make a commit that touches both expected files for 28-01.
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'test'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib', 'foo.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(root, 'test', 'foo.js'), '// t\n');
  execSync('git add -A', { cwd: root });
  execSync('git commit -q -m "cp(28-01): implement alpha"', { cwd: root });

  const before = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  const r = runShim(root, 'post-commit');
  ok('shim exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('stderr mentions auto-ticked', /auto-ticked plan 28-01/.test(r.stderr), r.stderr);
  const after = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  ok('new commit added', Number(after) === Number(before) + 1, `before=${before} after=${after}`);
  const lastSubject = execSync('git log -1 --format=%s', { cwd: root, encoding: 'utf8' }).trim();
  ok('last commit is tick', /cp: tick plan 28-01/.test(lastSubject), lastSubject);
  ok('ROADMAP shows 28-01 done', /\[x\] 28-01/.test(readRoadmap(root)));
  ok('ROADMAP 28-02 still pending', /\[ \] 28-02/.test(readRoadmap(root)));
}

section('post-commit tick-auto — partial coverage is silent no-op');
{
  const root = setupProject('partial');
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib', 'foo.js'), 'x\n');
  execSync('git add -A', { cwd: root });
  execSync('git commit -q -m "cp(28-01): partial"', { cwd: root });

  const before = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  const r = runShim(root, 'post-commit');
  ok('shim exit 0', r.status === 0, `status=${r.status}`);
  ok('no auto-tick stderr', !/auto-ticked/.test(r.stderr));
  const after = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  ok('no extra commit', after === before);
  ok('ROADMAP 28-01 untouched', /\[ \] 28-01/.test(readRoadmap(root)));
}

section('post-commit tick-auto — non-cp commit subject ignored');
{
  const root = setupProject('subj');
  fs.writeFileSync(path.join(root, 'README.md'), '# x\n');
  execSync('git add -A', { cwd: root });
  execSync('git commit -q -m "docs: README"', { cwd: root });

  const before = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  const r = runShim(root, 'post-commit');
  ok('shim exit 0', r.status === 0);
  const after = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  ok('no auto-tick', after === before);
}

section('post-commit tick-auto — reconcile / housekeeping subjects ignored');
{
  const root = setupProject('reconcile');
  fs.writeFileSync(path.join(root, 'README.md'), '# x\n');
  execSync('git add -A', { cwd: root });
  execSync('git commit -q -m "cp(reconcile): backfill"', { cwd: root });
  const before = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  const r = runShim(root, 'post-commit');
  ok('shim exit 0', r.status === 0);
  const after = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  ok('no auto-tick on reconcile', after === before);
}

section('post-commit tick-auto — disabled by default (post_commit=off)');
{
  const root = setupProject('off', {
    cp: { behavior: { post_commit: 'off' } },
  });
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'test'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib', 'foo.js'), 'x\n');
  fs.writeFileSync(path.join(root, 'test', 'foo.js'), 'x\n');
  execSync('git add -A', { cwd: root });
  execSync('git commit -q -m "cp(28-01): alpha"', { cwd: root });
  const before = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  const r = runShim(root, 'post-commit');
  ok('shim exit 0', r.status === 0);
  const after = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  ok('no auto-tick when off', after === before);
  ok('ROADMAP 28-01 still pending', /\[ \] 28-01/.test(readRoadmap(root)));
}

section('post-commit tick-auto — idempotent on second invocation');
{
  const root = setupProject('idem');
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'test'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib', 'foo.js'), 'x\n');
  fs.writeFileSync(path.join(root, 'test', 'foo.js'), 'x\n');
  execSync('git add -A', { cwd: root });
  execSync('git commit -q -m "cp(28-01): alpha"', { cwd: root });
  runShim(root, 'post-commit'); // first tick
  const after1 = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  // second invocation — HEAD is now `cp: tick plan 28-01` which the parser
  // rejects; even if it didn't, tickPlan is idempotent.
  const r2 = runShim(root, 'post-commit');
  const after2 = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  ok('no infinite tick loop', after1 === after2, `${after1} vs ${after2}`);
  ok('shim still exit 0', r2.status === 0);
}

// ----------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
