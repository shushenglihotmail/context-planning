#!/usr/bin/env node
/**
 * Unit tests for lib/lifecycle.supersedePlan and lib/lifecycle.recordDeviation
 * — v0.8 Phase 26 (P10).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const lifecycle = require('../lib/lifecycle');
const roadmap = require('../lib/roadmap');

let passed = 0, failed = 0;
function ok(label, cond, detail = '') {
  if (cond) { passed++; console.log(`  \u2713 ${label}`); }
  else { failed++; console.log(`  \u2717 ${label}${detail ? ' :: ' + detail : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function freshRepo(suffix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cp-sd-${suffix}-`));
  execSync('git init -q -b main', { cwd: root });
  execSync('git config user.email t@l', { cwd: root });
  execSync('git config user.name t', { cwd: root });
  fs.mkdirSync(path.join(root, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    `# x\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [ ] 01-01: hi\n- [x] 01-02: bye\n`);
  fs.writeFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\n---\n# Phase 1\n\n## Plans\n- [ ] 01-01: hi\n- [x] 01-02: bye\n`);
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'),
    `# x\n\n## Current Position\n\nPhase: 1\nPlan: 01-01\nStatus: x\nCurrent focus: x\nLast activity: -\n\nProgress: [          ] 0%\n\n## Decisions\n\n(none)\n`);
  execSync('git add -A && git commit -q -m seed', { cwd: root });
  return root;
}

// ---------- roadmap.setPlanSuperseded ----------

section('roadmap.setPlanSuperseded: replaces [ ] with [~]');
{
  const before = `- [ ] 12-01: foo\n- [x] 12-02: bar\n`;
  const a = roadmap.setPlanSuperseded(before, '12-01');
  ok('12-01 -> [~]', /- \[~\] 12-01:/.test(a));
  const b = roadmap.setPlanSuperseded(before, '12-02');
  ok('12-02 -> [~] (from [x])', /- \[~\] 12-02:/.test(b));
  const c = roadmap.setPlanSuperseded(`- [~] 12-03: baz\n`, '12-03');
  ok('idempotent on [~]', /- \[~\] 12-03:/.test(c));
}

// ---------- supersedePlan ----------

section('supersedePlan: marks ROADMAP + PLAN and adds note');
{
  const root = freshRepo('sup');
  const r = lifecycle.supersedePlan(root, '01-01', { by: '02-03', reason: 'rescoped', today: '2026-05-22' });
  ok('roadmapChanged', r.roadmapChanged === true);
  ok('planChanged', r.planChanged === true);
  ok('actions=2', r.actions.length === 2);
  const roadmapAfter = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP 01-01 is [~]', /- \[~\] 01-01:/.test(roadmapAfter));
  const planAfter = fs.readFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  ok('PLAN 01-01 is [~]', /- \[~\] 01-01:/.test(planAfter));
  ok('PLAN has ## Notes section', /^##\s+Notes\s*$/m.test(planAfter));
  ok('PLAN has supersede note', /2026-05-22: plan 01-01 superseded by 02-03 — rescoped/.test(planAfter));
  // 01-02 unchanged
  ok('01-02 still [x]', /- \[x\] 01-02:/.test(roadmapAfter));
}

section('supersedePlan: --by required');
{
  const root = freshRepo('sup2');
  let threw = null;
  try { lifecycle.supersedePlan(root, '01-01', {}); } catch (e) { threw = e.message; }
  ok('throws on missing --by', threw && /--by/.test(threw));
}

section('supersedePlan: invalid plan id throws');
{
  const root = freshRepo('sup3');
  let threw = null;
  try { lifecycle.supersedePlan(root, 'bad', { by: '01-01' }); } catch (e) { threw = e.message; }
  ok('throws on bad plan id', threw && /invalid plan id/.test(threw));
}

section('supersedePlan: dry-run does not write');
{
  const root = freshRepo('sup4');
  const roadmapBefore = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  const planBefore = fs.readFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  const r = lifecycle.supersedePlan(root, '01-01', { by: '02-03', dryRun: true });
  ok('actions still produced', r.actions.length === 2);
  ok('ROADMAP unchanged', roadmapBefore === fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8'));
  ok('PLAN unchanged', planBefore === fs.readFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8'));
}

// ---------- recordDeviation ----------

section('recordDeviation: appends ## Deviation block');
{
  const root = freshRepo('dev');
  const r = lifecycle.recordDeviation(root, '1', {
    summary: 'swapped lib X for lib Y',
    reason: 'X has bug',
    today: '2026-05-22',
  });
  ok('planChanged', r.planChanged === true);
  ok('actions=1', r.actions.length === 1);
  const after = fs.readFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  ok('has ## Deviation 2026-05-22', /^##\s+Deviation\s+2026-05-22\s*$/m.test(after));
  ok('summary in block', /\*\*Summary\*\*: swapped lib X for lib Y/.test(after));
  ok('reason in block', /\*\*Reason\*\*: X has bug/.test(after));
}

section('recordDeviation: --summary required');
{
  const root = freshRepo('dev2');
  let threw = null;
  try { lifecycle.recordDeviation(root, '1', {}); } catch (e) { threw = e.message; }
  ok('throws', threw && /summary/.test(threw));
}

section('recordDeviation: missing phase throws');
{
  const root = freshRepo('dev3');
  let threw = null;
  try { lifecycle.recordDeviation(root, '99', { summary: 'x' }); } catch (e) { threw = e.message; }
  ok('throws', threw && /Phase 99/.test(threw));
}

section('recordDeviation: dry-run does not write');
{
  const root = freshRepo('dev4');
  const before = fs.readFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  const r = lifecycle.recordDeviation(root, '1', { summary: 'x', dryRun: true });
  ok('still produces actions', r.actions.length === 1);
  const after = fs.readFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  ok('PLAN unchanged', before === after);
}

section('recordDeviation: multiple deviations accumulate');
{
  const root = freshRepo('dev5');
  lifecycle.recordDeviation(root, '1', { summary: 'first', today: '2026-05-22' });
  lifecycle.recordDeviation(root, '1', { summary: 'second', today: '2026-05-23' });
  const after = fs.readFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'), 'utf8');
  const matches = after.match(/^##\s+Deviation\s+/gm) || [];
  ok('two deviation blocks', matches.length === 2);
  ok('both summaries present', /first/.test(after) && /second/.test(after));
}

console.log('\n----------------------------------------');
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
