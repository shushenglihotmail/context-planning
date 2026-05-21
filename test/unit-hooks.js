#!/usr/bin/env node
/**
 * Unit tests for lib/hooks.js — v0.8 Phase 27 (P11 pre-commit hook).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const hooks = require('../lib/hooks');

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

function freshGitRoot(suffix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cp-hooks-${suffix}-`));
  execSync('git init -q -b main', { cwd: root });
  return root;
}

function makeCpProject(root, rel) {
  const proj = path.join(root, rel);
  fs.mkdirSync(path.join(proj, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.planning', 'STATE.md'), '# x\n');
  return proj;
}

// -----------------------------------------------------------------------
section('hookScript / ownsHook');
{
  const script = hooks._hookScript('/plugin/root', 'pre-commit');
  ok(
    'script starts with shebang',
    script.startsWith('#!/bin/sh\n'),
    script.slice(0, 30)
  );
  ok('script contains sentinel', script.includes(hooks.HOOK_SENTINEL));
  ok('script exec line present', script.includes('exec node'));
  ok(
    'script references pre-commit arg',
    /\bpre-commit\b/.test(script)
  );
  ok('script uses forward slashes', !script.includes('\\'));
  ok('owns own script', hooks._ownsHook(script));
  ok('does not own foreign script', !hooks._ownsHook('#!/bin/sh\necho hi\n'));
  ok('does not own null', !hooks._ownsHook(null));
}

// -----------------------------------------------------------------------
section('findCpProjects — single repo');
{
  const root = freshGitRoot('single');
  makeCpProject(root, '.');
  const projects = hooks.findCpProjects(root);
  ok('finds root project', projects.length === 1 && projects[0] === root);
}

section('findCpProjects — monorepo with siblings');
{
  const root = freshGitRoot('mono');
  const a = makeCpProject(root, path.join('services', 'a'));
  const b = makeCpProject(root, path.join('apps', 'b'));
  // Decoy: nested cp project under a (should NOT be found — we stop recursion
  // into a cp project once we hit one).
  makeCpProject(root, path.join('services', 'a', 'nested'));
  const projects = hooks.findCpProjects(root);
  ok('found 2 sibling projects', projects.length === 2, JSON.stringify(projects));
  ok('contains apps/b', projects.includes(b));
  ok('contains services/a', projects.includes(a));
  ok('does NOT contain nested-inside-a', !projects.some((p) => p.endsWith('nested')));
}

section('findCpProjects — respects skip dirs');
{
  const root = freshGitRoot('skip');
  // cp project hidden inside node_modules should be skipped.
  makeCpProject(root, path.join('node_modules', 'pkg'));
  const projects = hooks.findCpProjects(root);
  ok('skip node_modules', projects.length === 0);
}

section('findCpProjects — respects maxDepth');
{
  const root = freshGitRoot('depth');
  makeCpProject(root, path.join('a', 'b', 'c', 'd', 'e', 'f'));
  ok(
    'not found at default depth',
    hooks.findCpProjects(root).length === 0
  );
  ok(
    'found at deeper opts',
    hooks.findCpProjects(root, { maxDepth: 10 }).length === 1
  );
}

// -----------------------------------------------------------------------
section('installHooks / uninstallHooks / status');
{
  const root = freshGitRoot('install');
  const before = hooks.hookStatus(root);
  ok('status starts not-installed', before.every((s) => !s.exists));

  const r = hooks.installHooks(root);
  ok('installed at least pre-commit', r.installed.some((h) => h.name === 'pre-commit'));
  ok('no skipped', r.skipped.length === 0);

  const hookFile = path.join(root, '.git', 'hooks', 'pre-commit');
  ok('hook file exists', fs.existsSync(hookFile));
  const content = fs.readFileSync(hookFile, 'utf8');
  ok('hook contains sentinel', content.includes(hooks.HOOK_SENTINEL));

  const mid = hooks.hookStatus(root);
  const pre = mid.find((s) => s.name === 'pre-commit');
  ok('status: exists', pre && pre.exists);
  ok('status: ownedByCp', pre && pre.ownedByCp);

  const u = hooks.uninstallHooks(root);
  ok('uninstalled pre-commit', u.removed.some((h) => h.name === 'pre-commit'));
  ok('file removed', !fs.existsSync(hookFile));
}

section('installHooks — refuses to overwrite user-owned hook');
{
  const root = freshGitRoot('refuse');
  fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true });
  const hookFile = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookFile, '#!/bin/sh\necho user hook\n');

  const r = hooks.installHooks(root);
  // pre-commit skipped (user-owned); post-commit installed cleanly.
  ok('pre-commit not in installed', !r.installed.some((h) => h.name === 'pre-commit'));
  ok('pre-commit in skipped', r.skipped.some((s) => s.name === 'pre-commit' && s.reason === 'user-owned'));

  const after = fs.readFileSync(hookFile, 'utf8');
  ok('user content preserved', after.includes('echo user hook'));

  // --force overrides.
  const r2 = hooks.installHooks(root, { force: true });
  ok('force installed pre-commit', r2.installed.some((h) => h.name === 'pre-commit'));
  ok('force wrote sentinel', fs.readFileSync(hookFile, 'utf8').includes(hooks.HOOK_SENTINEL));

  // uninstall now owns it and removes
  const u = hooks.uninstallHooks(root);
  ok('uninstall removes pre-commit after force', u.removed.some((h) => h.name === 'pre-commit'));
}

section('uninstallHooks — leaves user-owned hook alone');
{
  const root = freshGitRoot('keep');
  fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true });
  const hookFile = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookFile, '#!/bin/sh\necho mine\n');
  const u = hooks.uninstallHooks(root);
  ok('uninstall skipped user-owned', u.removed.length === 0 && u.skipped.length === 1);
  ok('user file preserved', fs.existsSync(hookFile));
}

section('gitDir resolves regular .git dir');
{
  const root = freshGitRoot('gd');
  const gd = hooks._gitDir(root);
  ok('resolved', gd && fs.existsSync(gd));
  ok('ends with .git', gd.endsWith('.git') || gd.endsWith(path.sep + '.git'));
}

// -----------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
