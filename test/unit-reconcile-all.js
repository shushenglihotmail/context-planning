#!/usr/bin/env node
/**
 * Unit tests for reconcile.reconcileAll + _parsePhaseRange — v0.8 Phase 29.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const reconcile = require('../lib/reconcile');

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
section('_parsePhaseRange');
{
  const p = reconcile._parsePhaseRange;
  ok('single: "5" → [5]', JSON.stringify(p('5')) === '[5]');
  ok('hyphen: "5-8" → [5..8]', JSON.stringify(p('5-8')) === '[5,6,7,8]');
  ok('dots: "5..8" → [5..8]', JSON.stringify(p('5..8')) === '[5,6,7,8]');
  ok('reversed: "8-5" → [5..8]', JSON.stringify(p('8-5')) === '[5,6,7,8]');
  ok('comma: "5,7,9" → [5,7,9]', JSON.stringify(p('5,7,9')) === '[5,7,9]');
  ok('mixed: "5,7-9" → [5,7,8,9]', JSON.stringify(p('5,7-9')) === '[5,7,8,9]');
  ok('dedup: "5,5,5" → [5]', JSON.stringify(p('5,5,5')) === '[5]');
  ok('whitespace: " 5 , 7 " → [5,7]', JSON.stringify(p(' 5 , 7 ')) === '[5,7]');
  ok('null → null', p(null) === null);
  ok('undefined → null', p(undefined) === null);
  let threw = false;
  try { p(''); } catch (_) { threw = true; }
  ok('empty throws', threw);
  threw = false;
  try { p('abc'); } catch (_) { threw = true; }
  ok('alpha throws', threw);
  threw = false;
  try { p('5-'); } catch (_) { threw = true; }
  ok('half-range throws', threw);
}

// ----------------------------------------------------------------------
section('_listAllPhaseNums');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cp-list-`));
  fs.mkdirSync(path.join(root, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.mkdirSync(path.join(root, '.planning', 'phases', '12-cli'), { recursive: true });
  fs.mkdirSync(path.join(root, '.planning', 'phases', '03-state'), { recursive: true });
  fs.mkdirSync(path.join(root, '.planning', 'phases', 'no-num-here'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'phases', '12-cli', 'README'), 'x');
  const nums = reconcile._listAllPhaseNums(root);
  ok('returns sorted unique nums', JSON.stringify(nums) === '[1,3,12]', JSON.stringify(nums));
  ok('skips non-numeric', !nums.includes(NaN));
}

section('_listAllPhaseNums — empty / missing');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cp-list-e-`));
  const nums = reconcile._listAllPhaseNums(root);
  ok('returns [] when phases dir missing', JSON.stringify(nums) === '[]');
}

// ----------------------------------------------------------------------
section('reconcileAll — fixes missing base-commits across multiple phases');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cp-rall-`));
  execSync('git init -q -b main', { cwd: root });
  execSync('git config user.email t@l', { cwd: root });
  execSync('git config user.name t', { cwd: root });

  // Set up 2 phases, both missing base-commits.
  for (const [num, slug] of [['1', '01-alpha'], ['2', '02-beta']]) {
    const dir = path.join(root, '.planning', 'phases', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'PLAN.md'),
      `---\nphase: "${num}"\nname: ${slug}\n---\n# Phase ${num}\n`
    );
  }
  fs.writeFileSync(
    path.join(root, '.planning', 'ROADMAP.md'),
    `# x\n\n## Phases\n\n### 🚧 v0 (In Progress)\n\n### Phase 1: alpha\n\n- [ ] 1-01: a\n\n### Phase 2: beta\n\n- [ ] 2-01: b\n`
  );
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# x\n');

  // Commit one file per phase so the inferer has a candidate.
  fs.writeFileSync(path.join(root, 'a.txt'), 'a\n');
  execSync('git add -A && git commit -q -m "cp(1-01): initial"', { cwd: root });
  fs.writeFileSync(path.join(root, 'b.txt'), 'b\n');
  execSync('git add -A && git commit -q -m "cp(2-01): initial"', { cwd: root });

  // Use synthetic findings instead of running audit (audit has heavy expects).
  const findings = [
    { id: 'missing-base-commit', phaseNum: '1', severity: 'medium' },
    { id: 'missing-base-commit', phaseNum: '2', severity: 'medium' },
  ];
  const result = reconcile.reconcileAll(root, { findings, dryRun: false });
  ok('summary.fixed = 2', result.summary.fixed === 2, JSON.stringify(result.summary));
  ok('summary.errors = 0', result.summary.errors === 0);
  ok('per-phase: 2 phases', result.phases.length === 2);

  // PLAN.md files should now have base-commit
  for (const slug of ['01-alpha', '02-beta']) {
    const c = fs.readFileSync(path.join(root, '.planning', 'phases', slug, 'PLAN.md'), 'utf8');
    ok(`${slug} has base-commit`, /base-commit:/.test(c));
  }
}

section('reconcileAll — phaseNums option scopes work');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cp-rall2-`));
  execSync('git init -q -b main', { cwd: root });
  execSync('git config user.email t@l', { cwd: root });
  execSync('git config user.name t', { cwd: root });
  for (const [num, slug] of [['1', '01-a'], ['2', '02-b'], ['3', '03-c']]) {
    const dir = path.join(root, '.planning', 'phases', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'PLAN.md'),
      `---\nphase: "${num}"\nname: x\n---\n`
    );
  }
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# x\n');
  fs.writeFileSync(path.join(root, 'x.txt'), 'x\n');
  execSync('git add -A && git commit -q -m "cp(1-01): a"', { cwd: root });
  fs.writeFileSync(path.join(root, 'y.txt'), 'y\n');
  execSync('git add -A && git commit -q -m "cp(2-01): b"', { cwd: root });
  fs.writeFileSync(path.join(root, 'z.txt'), 'z\n');
  execSync('git add -A && git commit -q -m "cp(3-01): c"', { cwd: root });

  const findings = [
    { id: 'missing-base-commit', phaseNum: '1', severity: 'medium' },
    { id: 'missing-base-commit', phaseNum: '2', severity: 'medium' },
    { id: 'missing-base-commit', phaseNum: '3', severity: 'medium' },
  ];
  const result = reconcile.reconcileAll(root, { findings, phaseNums: [1, 3], dryRun: false });
  ok('scoped to 2 phases', result.phases.length === 2);
  ok('scanned 2', result.summary.phasesScanned === 2);
  // Phase 02 PLAN should NOT have base-commit.
  const phase2 = fs.readFileSync(path.join(root, '.planning', 'phases', '02-b', 'PLAN.md'), 'utf8');
  ok('phase 2 untouched', !/base-commit:/.test(phase2));
}

section('reconcileAll — dryRun does not write');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cp-rall3-`));
  execSync('git init -q -b main', { cwd: root });
  execSync('git config user.email t@l', { cwd: root });
  execSync('git config user.name t', { cwd: root });
  const dir = path.join(root, '.planning', 'phases', '01-a');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'PLAN.md'), `---\nphase: "1"\n---\n`);
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# x\n');
  fs.writeFileSync(path.join(root, 'x.txt'), 'x\n');
  execSync('git add -A && git commit -q -m "cp(1-01): a"', { cwd: root });
  const findings = [{ id: 'missing-base-commit', phaseNum: '1', severity: 'medium' }];
  const result = reconcile.reconcileAll(root, { findings, dryRun: true });
  ok('would fix counted', result.summary.fixed >= 1);
  const after = fs.readFileSync(path.join(dir, 'PLAN.md'), 'utf8');
  ok('PLAN.md not modified', !/base-commit:/.test(after));
}

// ----------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
