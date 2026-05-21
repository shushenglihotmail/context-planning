#!/usr/bin/env node
/**
 * Unit tests for lib/reconcile.js — v0.8 Phase 26 (P10).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const reconcile = require('../lib/reconcile');
const fm = require('../lib/frontmatter');

let passed = 0, failed = 0;
function ok(label, cond, detail = '') {
  if (cond) { passed++; console.log(`  \u2713 ${label}`); }
  else { failed++; console.log(`  \u2717 ${label}${detail ? ' :: ' + detail : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function freshRepo(suffix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cp-rec-${suffix}-`));
  execSync('git init -q -b main', { cwd: root });
  execSync('git config user.email t@l', { cwd: root });
  execSync('git config user.name t', { cwd: root });
  fs.mkdirSync(path.join(root, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    `# x\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [ ] 01-01: hi\n`);
  // PLAN.md WITHOUT base-commit (so reconcile can fill it)
  fs.writeFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\n---\n# Phase 1\n\n## Plans\n- [ ] 01-01: hi\n`);
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'),
    `# x\n\n## Current Position\n\nPhase: 1\nPlan: 01-01\nStatus: x\nCurrent focus: x\nLast activity: -\n\nProgress: [          ] 0%\n\n## Decisions\n\n(none)\n`);
  execSync('git add -A && git commit -q -m "seed"', { cwd: root });
  return root;
}

// ---------- inferBaseCommit ----------

section('inferBaseCommit: writes base-commit from first cp(N-MM) commit');
{
  const root = freshRepo('base');
  // Simulate a plan commit
  fs.writeFileSync(path.join(root, 'a.txt'), 'x');
  execSync('git add -A && git commit -q -m "cp(01-01): work A"', { cwd: root });
  const targetSha = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  // Add another so HEAD differs
  fs.writeFileSync(path.join(root, 'b.txt'), 'y');
  execSync('git add -A && git commit -q -m "cp(01-01): work B"', { cwd: root });

  const r = reconcile.inferBaseCommit(root, '1');
  ok('action=written', r.action === 'written');
  ok('sha matches first plan commit', r.sha === targetSha);
  ok('changedPaths includes PLAN.md', r.changedPaths.some((p) => p.endsWith('PLAN.md')));

  const planContents = fs.readFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  const parsed = fm.parse(planContents);
  ok('PLAN frontmatter base-commit equals sha', parsed.frontmatter['base-commit'] === targetSha);
}

section('inferBaseCommit: already-set is idempotent (no rewrite)');
{
  const root = freshRepo('base2');
  // Pre-stamp
  const planPath = path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md');
  fs.writeFileSync(planPath,
    `---\nphase: "1"\nname: Greet\nbase-commit: abc123def456abc123def456abc123def456abcd\n---\n# Phase 1\n`);
  const r = reconcile.inferBaseCommit(root, '1');
  ok('action=already-set', r.action === 'already-set');
  ok('changedPaths is empty', r.changedPaths.length === 0);
}

section('inferBaseCommit: unresolvable when no commits match phase');
{
  const root = freshRepo('base3');
  // Wipe phase dir so commit pattern AND dir lookup both fail.
  fs.rmSync(path.join(root, '.planning', 'phases', '01-greet'), { recursive: true });
  let threw = null;
  try { reconcile.inferBaseCommit(root, '1'); } catch (e) { threw = e.message; }
  ok('throws "phase not found"', threw && threw.includes('not found'));
}

section('inferBaseCommit: dry-run does not write');
{
  const root = freshRepo('basedry');
  fs.writeFileSync(path.join(root, 'a.txt'), 'x');
  execSync('git add -A && git commit -q -m "cp(01-01): work"', { cwd: root });
  const planPath = path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md');
  const before = fs.readFileSync(planPath, 'utf8');
  const r = reconcile.inferBaseCommit(root, '1', { dryRun: true });
  ok('action=would-write', r.action === 'would-write');
  ok('sha set', typeof r.sha === 'string' && r.sha.length >= 7);
  const after = fs.readFileSync(planPath, 'utf8');
  ok('file untouched', before === after);
}

// ---------- inferEndCommit ----------

section('inferEndCommit: writes end-commit to SUMMARY.md');
{
  const root = freshRepo('end');
  fs.writeFileSync(path.join(root, 'a.txt'), 'x');
  execSync('git add -A && git commit -q -m "cp(01-01): work"', { cwd: root });
  const sha = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  // Write a SUMMARY without end-commit
  const sumPath = path.join(root, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md');
  fs.writeFileSync(sumPath, `---\nplan: "01-01"\n---\n# Summary\n`);

  const r = reconcile.inferEndCommit(root, '01-01');
  ok('action=written', r.action === 'written');
  ok('sha matches', r.sha === sha);
  const parsed = fm.parse(fs.readFileSync(sumPath, 'utf8'));
  ok('SUMMARY end-commit set', parsed.frontmatter['end-commit'] === sha);
}

section('inferEndCommit: throws on missing SUMMARY');
{
  const root = freshRepo('end2');
  let threw = null;
  try { reconcile.inferEndCommit(root, '01-99'); } catch (e) { threw = e.message; }
  ok('throws "SUMMARY for ... not found"', threw && threw.includes('SUMMARY'));
}

section('inferEndCommit: invalid plan id throws');
{
  const root = freshRepo('end3');
  let threw = null;
  try { reconcile.inferEndCommit(root, 'garbage'); } catch (e) { threw = e.message; }
  ok('throws "invalid plan id"', threw && threw.includes('invalid plan id'));
}

// ---------- acceptExpectedKeyFiles ----------

section('acceptExpectedKeyFiles: rewrites PLAN.md expected-key-files from SUMMARY');
{
  const root = freshRepo('accept');
  const sumPath = path.join(root, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md');
  fs.writeFileSync(sumPath,
    `---\nplan: "01-01"\nkey-files:\n  created: ["src/a.js", "src/b.js"]\n  modified: ["lib/x.js"]\n---\n# Summary\n`);
  const r = reconcile.acceptExpectedKeyFiles(root, '01-01');
  ok('action=written', r.action === 'written');
  const planContents = fs.readFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  const parsed = fm.parse(planContents);
  const ekf = parsed.frontmatter['expected-key-files'];
  ok('ekf is object', ekf && typeof ekf === 'object' && !Array.isArray(ekf));
  ok('ekf has 01-01 key', Array.isArray(ekf['01-01']));
  ok('ekf has 3 entries', ekf['01-01'].length === 3);
  ok('ekf includes lib/x.js', ekf['01-01'].includes('lib/x.js'));
}

section('acceptExpectedKeyFiles: throws when SUMMARY lacks structured key-files');
{
  const root = freshRepo('accept2');
  const sumPath = path.join(root, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md');
  fs.writeFileSync(sumPath, `---\nplan: "01-01"\n---\n# Summary\n`);
  let threw = null;
  try { reconcile.acceptExpectedKeyFiles(root, '01-01'); } catch (e) { threw = e.message; }
  ok('throws "no structured key-files"', threw && threw.includes('key-files'));
}

// ---------- reconcileFinding dispatch ----------

section('reconcileFinding: dispatches to inferBase for missing-base-commit');
{
  const root = freshRepo('disp1');
  fs.writeFileSync(path.join(root, 'a.txt'), 'x');
  execSync('git add -A && git commit -q -m "cp(01-01): work"', { cwd: root });
  const f = { id: 'missing-base-commit', phaseNum: '1' };
  const r = reconcile.reconcileFinding(root, f);
  ok('written', r.action === 'written');
}

section('reconcileFinding: requires --accept for drift');
{
  const root = freshRepo('disp2');
  const sumPath = path.join(root, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md');
  fs.writeFileSync(sumPath,
    `---\nplan: "01-01"\nkey-files:\n  created: ["x.js"]\n  modified: []\n---\n`);
  const f = { id: 'expected-vs-actual-drift', planId: '01-01' };
  let threw = null;
  try { reconcile.reconcileFinding(root, f); } catch (e) { threw = e.message; }
  ok('throws without accept', threw && threw.includes('accept'));
  // With accept it should succeed
  const r = reconcile.reconcileFinding(root, f, { accept: true });
  ok('written with accept', r.action === 'written');
}

section('reconcileFinding: unknown id throws');
{
  const root = freshRepo('disp3');
  let threw = null;
  try { reconcile.reconcileFinding(root, { id: 'nope' }); } catch (e) { threw = e.message; }
  ok('throws "no operation"', threw && threw.includes('no operation'));
}

// ---------- audit-fix integration ----------

section('audit-fix FIXERS: missing-base-commit uses reconcile');
{
  const auditFix = require('../lib/audit-fix');
  const root = freshRepo('afix');
  fs.writeFileSync(path.join(root, 'a.txt'), 'x');
  execSync('git add -A && git commit -q -m "cp(01-01): work"', { cwd: root });
  const fixer = auditFix.FIXERS['missing-base-commit'];
  ok('fixer exists', typeof fixer === 'function');
  const r = fixer(root, { id: 'missing-base-commit', phaseNum: '1' });
  ok('returns changedPaths', Array.isArray(r.changedPaths) && r.changedPaths.length > 0);
  ok('PLAN now has base-commit',
    fm.parse(fs.readFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8'))
      .frontmatter['base-commit'] !== undefined);
}

section('audit-fix FIXERS: missing-base-commit on already-set throws (no-op detection)');
{
  const auditFix = require('../lib/audit-fix');
  const root = freshRepo('afix2');
  const planPath = path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md');
  fs.writeFileSync(planPath,
    `---\nphase: "1"\nname: Greet\nbase-commit: deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\n---\n# Phase\n`);
  let threw = null;
  try {
    auditFix.FIXERS['missing-base-commit'](root, { id: 'missing-base-commit', phaseNum: '1' });
  } catch (e) { threw = e.message; }
  ok('throws on already-set', threw && /already set/.test(threw));
}

console.log('\n----------------------------------------');
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
