#!/usr/bin/env node
/**
 * Unit tests for lib/audit-fix.js — v0.8 Phase 25 (P8).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const auditFix = require('../lib/audit-fix');
const audit = require('../lib/audit');
const lifecycle = require('../lib/lifecycle');

let passed = 0, failed = 0;
function ok(label, cond, detail = '') {
  if (cond) { passed++; console.log(`  \u2713 ${label}`); }
  else { failed++; console.log(`  \u2717 ${label}${detail ? ' :: ' + detail : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function freshRepo(suffix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cp-fix-${suffix}-`));
  execSync('git init -q -b main', { cwd: root });
  execSync('git config user.email t@l', { cwd: root });
  execSync('git config user.name t', { cwd: root });
  fs.mkdirSync(path.join(root, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    `# x\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [ ] 01-01: hi\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\n---\n# Phase 1\n\n## Plans\n- [ ] 01-01: hi\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'),
    `# Project State\n\n## Current Position\n\nPhase: 1\nPlan: 01-01\nStatus: Ready\nCurrent focus: x\nLast activity: -\n\nProgress: [██████████] 0%\n\n## Decisions\n\n(none)\n`);
  execSync('git add -A && git commit -q -m seed', { cwd: root });
  return root;
}

section('_passesSeverityFilter');
{
  const h = { severity: 'HIGH' };
  const m = { severity: 'MEDIUM' };
  const l = { severity: 'LOW' };
  ok('all passes everything', auditFix._passesSeverityFilter(l, 'all') && auditFix._passesSeverityFilter(h, 'all'));
  ok('HIGH only blocks MED/LOW', auditFix._passesSeverityFilter(h, 'high') && !auditFix._passesSeverityFilter(m, 'high') && !auditFix._passesSeverityFilter(l, 'high'));
  ok('MEDIUM lets HIGH+MED through', auditFix._passesSeverityFilter(h, 'medium') && auditFix._passesSeverityFilter(m, 'medium') && !auditFix._passesSeverityFilter(l, 'medium'));
}

section('classify: partitions into auto/manual/skip');
{
  const findings = [
    { id: 'state-stale', severity: 'LOW' },
    { id: 'summary-without-tick', severity: 'MEDIUM', planId: '01-01' },
    { id: 'ticked-without-summary', severity: 'HIGH', fix: 'cp write-summary' },
    { id: 'missing-base-commit', severity: 'MEDIUM', fix: 'cp reconcile --infer-shas', phaseNum: '1' },
    { id: 'phantom-id', severity: 'LOW', fix: 'manual' },
  ];
  const r = auditFix.classify(findings);
  ok('3 auto (state-stale + summary-without-tick + missing-base-commit)', r.auto.length === 3);
  ok('auto includes reconcile-backed missing-base-commit',
    r.auto.some(f => f.id === 'missing-base-commit'));
  ok('2 manual (ticked-without-summary + phantom-id)', r.manual.length === 2);
  ok('manual suggestion uses finding.fix', r.manual[0].suggestion.startsWith('cp ') || r.manual[0].suggestion === 'manual');
  ok('skip empty by default', r.skip.length === 0);
}

section('classify: severity filter moves LOW to skip');
{
  const findings = [
    { id: 'state-stale', severity: 'LOW' },
    { id: 'summary-without-tick', severity: 'MEDIUM', planId: '01-01' },
  ];
  const r = auditFix.classify(findings, { severity: 'medium' });
  ok('1 skip (state-stale)', r.skip.length === 1 && r.skip[0].id === 'state-stale');
  ok('1 auto remains', r.auto.length === 1);
}

section('applyFixes dry-run: no commits, no mutations');
{
  const root = freshRepo('dryapply');
  const auto = [{ id: 'state-stale', severity: 'LOW', location: '.planning/STATE.md' }];
  const before = fs.readFileSync(path.join(root, '.planning', 'STATE.md'), 'utf8');
  const r = auditFix.applyFixes(root, auto, { dryRun: true });
  ok('applied=1', r.applied.length === 1);
  ok('applied[0].dryRun', r.applied[0].dryRun === true);
  ok('applied[0].commit=null', r.applied[0].commit === null);
  const after = fs.readFileSync(path.join(root, '.planning', 'STATE.md'), 'utf8');
  ok('STATE.md NOT touched', before === after);
  // git log should still be just the seed.
  const logCount = execSync('git rev-list --count HEAD', { cwd: root }).toString().trim();
  ok('no new commits', logCount === '1');
}

section('applyFixes: state-stale fixer applies + commits atomically');
{
  const root = freshRepo('staleapply');
  const auto = [{ id: 'state-stale', severity: 'LOW', location: '.planning/STATE.md' }];
  const r = auditFix.applyFixes(root, auto);
  ok('applied=1', r.applied.length === 1, JSON.stringify(r));
  ok('commit hash present', typeof r.applied[0].commit === 'string' && /^[0-9a-f]{6,}$/.test(r.applied[0].commit));
  const log = execSync('git log -1 --format=%s', { cwd: root }).toString().trim();
  ok('commit subject matches', /^cp\(audit-fix\): state-stale/.test(log), log);
}

section('applyFixes: summary-without-tick fixer ticks + commits');
{
  const root = freshRepo('sumwithouttick');
  // Write a SUMMARY for 01-01 to create the inconsistency
  fs.writeFileSync(
    path.join(root, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md'),
    `---\nplan: 01-01\nphase: 1\nsubsystem: g\nkey-files:\n  created: []\n  modified: []\nkey-decisions: [x]\n---\nbody\n`);
  execSync('git add -A && git commit -q -m "stray SUMMARY"', { cwd: root });
  const auto = [{ id: 'summary-without-tick', severity: 'MEDIUM', planId: '01-01', location: '.planning/phases/01-greet/01-01-SUMMARY.md' }];
  const r = auditFix.applyFixes(root, auto);
  ok('applied=1', r.applied.length === 1, JSON.stringify(r));
  ok('commit hash present', /^[0-9a-f]{6,}$/.test(r.applied[0].commit));
  const planContent = fs.readFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  ok('plan 01-01 ticked', /\[x\]\s*01-01/.test(planContent));
}

section('applyFixes: --max caps the loop');
{
  const root = freshRepo('maxcap');
  // 3 state-stale findings — only 2 should apply with max=2.
  const auto = [
    { id: 'state-stale', severity: 'LOW', location: '.planning/STATE.md' },
    { id: 'state-stale', severity: 'LOW', location: '.planning/STATE.md' },
    { id: 'state-stale', severity: 'LOW', location: '.planning/STATE.md' },
  ];
  const r = auditFix.applyFixes(root, auto, { max: 2 });
  ok('applied=2 not 3', r.applied.length === 2);
  ok('no failed', r.failed.length === 0);
}

section('applyFixes: fixer throw → failed + stopped');
{
  const root = freshRepo('throw');
  // No SUMMARY exists for 01-01 → tickPlan ticks but then check: the plan is
  // already unchecked; tickPlan returns plan-unchanged when both are already
  // [ ]. Let's check what our fixer does: it errors when noop. So provide
  // 01-01 with a SUMMARY but ALREADY tick the plan to make tickPlan noop.
  fs.writeFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\n---\n# Phase 1\n\n## Plans\n- [x] 01-01: hi\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    `# x\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [x] 01-01: hi\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(root, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md'),
    `---\nplan: 01-01\nphase: 1\n---\nbody\n`);
  execSync('git add -A && git commit -q -m "pre-tick"', { cwd: root });

  const auto = [
    { id: 'summary-without-tick', severity: 'MEDIUM', planId: '01-01' },
    { id: 'state-stale', severity: 'LOW', location: '.planning/STATE.md' },
  ];
  const r = auditFix.applyFixes(root, auto);
  ok('failed has 1 entry', r.failed.length === 1, JSON.stringify(r));
  ok('failed id summary-without-tick', r.failed[0].finding.id === 'summary-without-tick');
  ok('stopped=true', r.stopped === true);
  ok('applied=0 (stopped on first)', r.applied.length === 0);
}

section('FIXERS registry shape');
{
  ok('has state-stale', typeof auditFix.FIXERS['state-stale'] === 'function');
  ok('has summary-without-tick', typeof auditFix.FIXERS['summary-without-tick'] === 'function');
  ok('has missing-base-commit (reconcile)', typeof auditFix.FIXERS['missing-base-commit'] === 'function');
  ok('has missing-end-commit (reconcile)', typeof auditFix.FIXERS['missing-end-commit'] === 'function');
  ok('no fixer for ticked-without-summary (manual)', auditFix.FIXERS['ticked-without-summary'] === undefined);
}

section('summarize');
{
  const s = auditFix.summarize([{}, {}], [{}], []);
  ok('applied=2', s.applied === 2);
  ok('manual=1', s.manual === 1);
  ok('failed=0', s.failed === 0);
  ok('stopped=false', s.stopped === false);
  const s2 = auditFix.summarize([], [], [{}]);
  ok('stopped=true when failed', s2.stopped === true);
}

console.log('\n----------------------------------------');
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
