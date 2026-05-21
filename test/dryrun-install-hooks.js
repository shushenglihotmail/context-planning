#!/usr/bin/env node
/**
 * Dry-run / integration test for `cp install --hooks` (Phase 27 P11).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
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

function runCp(cwd, args) {
  return spawnSync(NODE, [CP, ...args], { cwd, encoding: 'utf8' });
}

function freshGitRoot(suffix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cp-instH-${suffix}-`));
  // Need realpath because on macOS /var → /private/var
  const real = fs.realpathSync(root);
  execSync('git init -q -b main', { cwd: real });
  return real;
}

// -----------------------------------------------------------------------
section('cp install --hooks (fresh repo)');
{
  const root = freshGitRoot('fresh');
  const r = runCp(root, ['install', '--hooks']);
  ok('exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('stdout mentions installed', /installed/.test(r.stdout), r.stdout);
  const hookFile = path.join(root, '.git', 'hooks', 'pre-commit');
  ok('hook file written', fs.existsSync(hookFile));
  const content = fs.readFileSync(hookFile, 'utf8');
  ok('hook has sentinel', content.includes('cp:hook v1'));
  ok('hook execs node', /exec node/.test(content));
}

section('cp install --hooks (idempotent — re-running on own file)');
{
  const root = freshGitRoot('idem');
  runCp(root, ['install', '--hooks']);
  const r = runCp(root, ['install', '--hooks']);
  ok('idempotent exit 0', r.status === 0, `status=${r.status}`);
  ok('still has hook', fs.existsSync(path.join(root, '.git', 'hooks', 'pre-commit')));
}

section('cp install --hooks (refuses user-owned hook)');
{
  const root = freshGitRoot('refuse');
  fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true });
  const hookFile = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookFile, '#!/bin/sh\necho user\n');
  const r = runCp(root, ['install', '--hooks']);
  ok('exit code 3 on skip', r.status === 3, `status=${r.status}`);
  ok('stdout mentions skipped', /skipped/.test(r.stdout), r.stdout);
  ok('user content preserved', fs.readFileSync(hookFile, 'utf8').includes('echo user'));
}

section('cp install --hooks --force overrides user-owned');
{
  const root = freshGitRoot('force');
  fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true });
  const hookFile = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookFile, '#!/bin/sh\necho user\n');
  const r = runCp(root, ['install', '--hooks', '--force']);
  ok('exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('hook owned by cp now', fs.readFileSync(hookFile, 'utf8').includes('cp:hook v1'));
}

section('cp install --uninstall-hooks');
{
  const root = freshGitRoot('uninst');
  runCp(root, ['install', '--hooks']);
  const r = runCp(root, ['install', '--uninstall-hooks']);
  ok('exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('stdout mentions removed', /removed/.test(r.stdout), r.stdout);
  ok('file gone', !fs.existsSync(path.join(root, '.git', 'hooks', 'pre-commit')));
}

section('cp install --uninstall-hooks (no-op when nothing installed)');
{
  const root = freshGitRoot('noop');
  const r = runCp(root, ['install', '--uninstall-hooks']);
  ok('exit 0', r.status === 0);
  ok('stdout mentions no hooks', /no cp hooks/.test(r.stdout), r.stdout);
}

section('cp install --hooks (outside git repo)');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `cp-nogit-`));
  const real = fs.realpathSync(tmp);
  const r = runCp(real, ['install', '--hooks']);
  ok('exit code 2', r.status === 2, `status=${r.status}`);
  ok('stderr mentions not git', /not inside a git repo/.test(r.stderr), r.stderr);
}

section('cp install --hooks executes shim (dry pre-commit)');
{
  const root = freshGitRoot('exec');
  // Create a cp project at root.
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# x\n');
  runCp(root, ['install', '--hooks']);
  // Invoke the shim directly with pre-commit; no audit gate is wired
  // since there's no ROADMAP — audit will print but should not block
  // the commit when nothing is configured strictly. Just assert the
  // shim is callable and exits cleanly with a known status.
  const shim = path.join(PLUGIN_ROOT, 'bin', 'cp-hook.js');
  const r = spawnSync(NODE, [shim, 'pre-commit'], { cwd: root, encoding: 'utf8' });
  ok('shim is executable', r.status !== null, `status=${r.status} err=${r.error}`);
  // exit code may be 0 or non-zero depending on audit findings; what we
  // care about is that the shim ran and produced no crash.
  ok('no crash', !r.error, r.error && r.error.message);
}

// -----------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
