'use strict';

/**
 * Tests for v0.8 Phase 20 (Derived STATE.md):
 *   - lib/state.deriveState
 *   - lib/state._splitState
 *   - lib/state._renderDerivedBlock
 *   - lib/state.regenerate
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const state = require('../lib/state');
const lifecycle = require('../lib/lifecycle');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

// ---------- fixture ----------

function freshProject(suffix = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-state-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), `---
project: demo
---
# demo

## Phases

### 🚧 v0.1 Hi (In Progress)

Goal: test.

### Phase 1: Greet

- [ ] 01-01: hello
- [ ] 01-02: bye

`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'), `---
phase: 1
name: Greet
plans: [01-01, 01-02]
---
# Phase 1

## Plans
- [ ] 01-01: hello
- [ ] 01-02: bye
`);
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'), `# Project State

## Current Position

Phase: 1 (v0.1 Hi)
Plan: 01-01
Status: Ready to execute
Current focus: Greet
Last activity: 2026-01-01 — start

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

(none yet)

## Accumulated Context

### Decisions

(none yet)

### Pending Todos

(none yet)

### Blockers / Concerns

(none yet)

## Session Continuity

Last session: 2026-01-01
Stopped at: start
Resume file: None
`);
  execSync('git add -A && git commit -q -m "cp: scaffold demo"', { cwd: dir });
  return dir;
}

// ---------- _splitState ----------

section('_splitState');
{
  const sample = `# Project State

## Current Position

Phase: 1 (v0.1)
Plan: 01-01
Status: Ready to execute

Progress: [████░░░░░░] 40%

## Accumulated Context

### Decisions

(none yet)
`;
  const split = state._splitState(sample);
  ok('preamble contains H1', /# Project State/.test(split.preamble));
  ok('derivedBlock starts with Current Position', split.derivedBlock.startsWith('## Current Position'));
  ok('derivedBlock contains Progress', /Progress:\s*\[/.test(split.derivedBlock));
  ok('curatedTail begins (after blank) with Accumulated Context', split.curatedTail.trimStart().startsWith('## Accumulated Context'));
  ok('round-trip recomposes', split.preamble + split.derivedBlock + split.curatedTail === sample);
}
{
  // No Current Position header at all.
  const sample = `# Some Notes\n\nNothing structured here.\n`;
  const split = state._splitState(sample);
  ok('no-header: preamble empty', split.preamble === '');
  ok('no-header: derived empty', split.derivedBlock === '');
  ok('no-header: curated has everything', split.curatedTail === sample);
}
{
  // Progress line is final line of the file.
  const sample = `## Current Position\n\nPhase: 1\n\nProgress: [██░░░░░░░░] 20%`;
  const split = state._splitState(sample);
  ok('progress-as-last-line: derivedBlock covers it all', split.derivedBlock.includes('Progress:'));
  ok('progress-as-last-line: curatedTail empty', split.curatedTail === '');
}

// ---------- _renderDerivedBlock ----------

section('_renderDerivedBlock');
{
  const rendered = state._renderDerivedBlock({
    phase: 1, plan: '01-01', status: 'Ready to execute',
    currentFocus: 'Greet', progressPercent: 50,
    totalPlans: 2, donePlans: 1,
    lastActivity: 'tick 01-01', activeMilestone: 'v0.1 Hi',
  });
  ok('starts with H2', rendered.startsWith('## Current Position'));
  ok('phase line includes milestone', /Phase: 1 \(v0\.1 Hi\)/.test(rendered));
  ok('plan line', /Plan: 01-01/.test(rendered));
  ok('status line', /Status: Ready to execute/.test(rendered));
  ok('progress 50%', /Progress: \[█{5}░{5}\] 50%/.test(rendered));
  ok('last activity', /Last activity: tick 01-01/.test(rendered));
}
{
  // No plan / no activity → safe defaults.
  const rendered = state._renderDerivedBlock({
    phase: null, plan: null, status: 'idle',
    currentFocus: null, progressPercent: 0,
    totalPlans: 0, donePlans: 0,
    lastActivity: null, activeMilestone: null,
  });
  ok('idle: Phase -', /Phase: -/.test(rendered));
  ok('idle: Plan -', /Plan: -/.test(rendered));
  ok('idle: focus -', /Current focus: -/.test(rendered));
  ok('idle: activity -', /Last activity: -/.test(rendered));
}

// ---------- deriveState ----------

section('deriveState');
{
  const root = freshProject('derive');
  const d = state.deriveState(root);
  ok('phase = 1', d.phase === '1');
  ok('plan = 01-01', d.plan === '01-01');
  ok('status = Ready to execute', d.status === 'Ready to execute');
  ok('currentFocus = Greet', d.currentFocus === 'Greet');
  ok('progress 0%', d.progressPercent === 0);
  ok('milestone present', /v0\.1 Hi/.test(d.activeMilestone || ''));
  ok('lastActivity from git log', d.lastActivity === 'scaffold demo');
}
{
  // Tick one plan, expect 50% and next plan = 01-02.
  const root = freshProject('derive-mid');
  lifecycle.tickPlan(root, '01-01');
  const d = state.deriveState(root);
  ok('mid: plan = 01-02', d.plan === '01-02');
  ok('mid: progress 50%', d.progressPercent === 50);
}
{
  // All ticked, no SUMMARYs → Ready to write summary.
  const root = freshProject('derive-allticked');
  lifecycle.tickPlan(root, '01-01');
  lifecycle.tickPlan(root, '01-02');
  const d = state.deriveState(root);
  ok('all-ticked: status=Ready to write summary', d.status === 'Ready to write summary', `got ${d.status}`);
  ok('all-ticked: progress 100%', d.progressPercent === 100);
  ok('all-ticked: phase=1', d.phase === '1');
}
{
  // Missing ROADMAP → no-roadmap.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-state-noroad-'));
  execSync('git init -q -b main', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  const d = state.deriveState(dir);
  ok('no-roadmap status', d.status === 'no-roadmap');
}

// ---------- regenerate ----------

section('regenerate');
{
  const root = freshProject('regen-rewrite');
  // Corrupt the derived block to force a rewrite.
  const stPath = path.join(root, '.planning', 'STATE.md');
  let st = fs.readFileSync(stPath, 'utf8');
  st = st.replace(/Status: Ready to execute/, 'Status: stale-marker');
  fs.writeFileSync(stPath, st);

  const result = state.regenerate(root);
  ok('action=rewritten', result.action === 'rewritten', `got ${result.action}`);
  const after = fs.readFileSync(stPath, 'utf8');
  ok('stale marker gone', !/stale-marker/.test(after));
  ok('curated Decisions preserved', /### Decisions/.test(after));
  ok('curated Session Continuity preserved', /## Session Continuity/.test(after));
}
{
  // Idempotent: second call is unchanged.
  const root = freshProject('regen-noop');
  state.regenerate(root);
  const r2 = state.regenerate(root);
  ok('second call unchanged', r2.action === 'unchanged', `got ${r2.action}`);
}
{
  // Missing STATE.md gets scaffolded with a derived block.
  const root = freshProject('regen-missing');
  fs.unlinkSync(path.join(root, '.planning', 'STATE.md'));
  const r = state.regenerate(root);
  ok('missing STATE.md: rewritten', r.action === 'rewritten');
  const after = fs.readFileSync(path.join(root, '.planning', 'STATE.md'), 'utf8');
  ok('scaffold has H1', /^# Project State/m.test(after));
  ok('scaffold has Current Position', /## Current Position/.test(after));
  ok('scaffold has Progress', /Progress:\s*\[/.test(after));
}
{
  // No .planning at all → skipped, no throw.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-state-empty-'));
  execSync('git init -q -b main', { cwd: dir });
  const r = state.regenerate(dir);
  ok('no-planning: skipped', r.action === 'skipped');
}
{
  // Dry run does not touch disk.
  const root = freshProject('regen-dry');
  const stPath = path.join(root, '.planning', 'STATE.md');
  const before = fs.readFileSync(stPath, 'utf8');
  // Make the derived block stale to ensure dryRun would otherwise rewrite.
  fs.writeFileSync(stPath, before.replace(/Status:[^\n]+/, 'Status: stale'));
  const stale = fs.readFileSync(stPath, 'utf8');
  const r = state.regenerate(root, { dryRun: true });
  ok('dryRun returns rewritten', r.action === 'rewritten' && r.dryRun === true);
  const stillStale = fs.readFileSync(stPath, 'utf8');
  ok('dryRun did not write', stillStale === stale);
}

// ---------- integration with tickPlan / writeSummary ----------

section('integration: tickPlan regenerates STATE');
{
  const root = freshProject('integ-tick');
  // Stale STATE — wrong plan number.
  const stPath = path.join(root, '.planning', 'STATE.md');
  let st = fs.readFileSync(stPath, 'utf8');
  st = st.replace(/Plan: 01-01/, 'Plan: 99-99');
  fs.writeFileSync(stPath, st);
  lifecycle.tickPlan(root, '01-01');
  const after = fs.readFileSync(stPath, 'utf8');
  ok('tickPlan resyncs Plan line', /Plan: 01-02/.test(after), 'STATE was not regenerated after tick');
}

section('integration: writeSummary regenerates STATE');
{
  const root = freshProject('integ-summary');
  lifecycle.tickPlan(root, '01-01');
  // Create the key-file so file-existence check passes.
  fs.writeFileSync(path.join(root, 'a.js'), '// hi');
  execSync('git add -A && git commit -q -m "cp: add a.js"', { cwd: root });
  lifecycle.writeSummary(root, '01-01', {
    'key-decisions': ['went with option A'],
    'key-files': { created: [], modified: ['a.js'] },
  }, { checkFileExistence: false });
  const after = fs.readFileSync(path.join(root, '.planning', 'STATE.md'), 'utf8');
  // After writing summary for 01-01, the next plan should still be 01-02
  // (we ticked 01-01 already), so Progress should show 50%.
  ok('writeSummary keeps Plan=01-02', /Plan: 01-02/.test(after));
  ok('writeSummary updates Progress to 50%', /50%/.test(after));
}

// ---------- summary ----------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
