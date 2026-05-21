#!/usr/bin/env node
/**
 * Unit tests for lifecycle.tryAutoTick + bin/cp-hook subject parsing
 * — v0.8 Phase 28 (P12 tick-auto).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const lifecycle = require('../lib/lifecycle');
const cpHook = require('../bin/cp-hook');

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

// ----------------------------------------------------------------------
section('_parsePlanIdFromSubject');
{
  const f = cpHook._parsePlanIdFromSubject;
  ok('cp(28-01): foo', f('cp(28-01): foo') === '28-01');
  ok('cp(1-1): foo', f('cp(1-1): foo') === '1-1');
  ok('cp(28-01-extra): foo', f('cp(28-01-extra): foo') === '28-01');
  ok('rejects cp(reconcile):', f('cp(reconcile): foo') === null);
  ok('rejects cp(supersede):', f('cp(supersede): foo') === null);
  ok('rejects cp: foo', f('cp: foo') === null);
  ok('rejects gsd(28-01):', f('gsd(28-01): foo') === null);
  ok('rejects non-string', f(null) === null);
  ok('rejects empty', f('') === null);
}

// ----------------------------------------------------------------------
function freshRepoWithPlan(suffix, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cp-ta-${suffix}-`));
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
  const fm = opts.frontmatter || [
    '---',
    'phase: "28"',
    'name: Foo',
    'expected-key-files:',
    '  "28-01":',
    '    - lib/foo.js',
    '    - test/foo.js',
    '  "28-02":',
    '    - lib/bar.js',
    '---',
    '# Phase 28',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), fm);
  return root;
}

section('tryAutoTick — exact coverage → tick');
{
  const root = freshRepoWithPlan('exact');
  const d = lifecycle.tryAutoTick(root, '28-01', ['lib/foo.js', 'test/foo.js']);
  ok('decision tick', d.decision === 'tick', JSON.stringify(d));
  ok('matched 2', d.matched === 2);
}

section('tryAutoTick — extra files allowed → tick');
{
  const root = freshRepoWithPlan('extra');
  const d = lifecycle.tryAutoTick(root, '28-01', [
    'lib/foo.js',
    'test/foo.js',
    'README.md',
  ]);
  ok('still ticks with extras', d.decision === 'tick', JSON.stringify(d));
}

section('tryAutoTick — partial coverage → skip with missing');
{
  const root = freshRepoWithPlan('partial');
  const d = lifecycle.tryAutoTick(root, '28-01', ['lib/foo.js']);
  ok('skip partial', d.decision === 'skip', JSON.stringify(d));
  ok('reason partial', d.reason === 'partial');
  ok('missing includes test/foo.js', Array.isArray(d.missing) && d.missing.includes('test/foo.js'));
}

section('tryAutoTick — no commit files → skip');
{
  const root = freshRepoWithPlan('nof');
  const d = lifecycle.tryAutoTick(root, '28-01', []);
  ok('skip no-files', d.decision === 'skip' && d.reason === 'no-files');
}

section('tryAutoTick — PLAN.md without expected-key-files → skip');
{
  const root = freshRepoWithPlan('noexp', {
    frontmatter: '---\nphase: "28"\nname: Foo\n---\n# Phase 28\n',
  });
  const d = lifecycle.tryAutoTick(root, '28-01', ['lib/foo.js']);
  ok('skip no-expected', d.decision === 'skip' && d.reason === 'no-expected');
}

section('tryAutoTick — unknown plan → skip no-phase-dir');
{
  const root = freshRepoWithPlan('unknown');
  const d = lifecycle.tryAutoTick(root, '99-01', ['x']);
  ok('skip no-phase-dir', d.decision === 'skip' && d.reason === 'no-phase-dir');
}

section('tryAutoTick — windows backslash paths normalised');
{
  const root = freshRepoWithPlan('winpath');
  const d = lifecycle.tryAutoTick(root, '28-01', ['lib\\foo.js', 'test\\foo.js']);
  ok('tick after backslash normalisation', d.decision === 'tick', JSON.stringify(d));
}

section('tryAutoTick — plan 28-02 isolation');
{
  const root = freshRepoWithPlan('iso');
  // 28-02 expected = [lib/bar.js]. Touch only lib/foo.js — different plan.
  const d = lifecycle.tryAutoTick(root, '28-02', ['lib/foo.js']);
  ok('skip on partial for 28-02', d.decision === 'skip');
  ok('missing names bar', d.missing && d.missing.includes('lib/bar.js'));
}

// ----------------------------------------------------------------------
section('actionFor — defaults');
{
  ok('pre-commit default audit-high', cpHook.actionFor('pre-commit', {}) === 'audit-high');
  ok('post-commit default off', cpHook.actionFor('post-commit', {}) === 'off');
  ok('unknown event off', cpHook.actionFor('weird', {}) === 'off');
  const cfg = { cp: { behavior: { post_commit: 'tick-auto', pre_commit: 'audit-any' } } };
  ok('pre-commit configurable', cpHook.actionFor('pre-commit', cfg) === 'audit-any');
  ok('post-commit configurable', cpHook.actionFor('post-commit', cfg) === 'tick-auto');
}

// ----------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
