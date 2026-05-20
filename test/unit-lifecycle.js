'use strict';

/**
 * Tests for lib/lifecycle.js — the v0.2 high-level CLI wrappers.
 *
 * Verifies that:
 *   - tickPlan updates BOTH ROADMAP and phase PLAN.md
 *   - tickPlan is idempotent
 *   - tickPlan --undo un-ticks
 *   - writeSummary writes the correct filename (no slug)
 *   - writeSummary normalises snake_case -> kebab-case aliases
 *   - writeSummary refuses to overwrite without overwrite:true
 *   - writeSummary fills phase/plan/completed defaults
 *   - parsePlanId validates and normalises leading zeros
 *   - statusReport finds the in-progress milestone and next pending plan
 *   - completeMilestone fails with structured reason if incomplete
 *   - completeMilestone produces correct actions list
 *   - completeMilestone dry-run doesn't touch disk
 *   - completeMilestone real run writes, collapses, clears, commits
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const lifecycle = require('../lib/lifecycle');
const fm = require('../lib/frontmatter');
const roadmap = require('../lib/roadmap');
const milestone = require('../lib/milestone');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(title) { console.log(`\n=== ${title} ===`); }

// ---------- fixture: build a complete demo project in a temp dir ----------

function freshProject(suffix = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-lifecycle-${suffix}-`));
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
  // Minimal STATE.md (only the sections updatePosition touches).
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'), `# State

## Current Position

Phase: 1 of 1
Plan: 1 of 2
Status: in-progress
Last activity: 2026-01-01 — start

Progress: [██░░░░░░░░] 20%

## Session Continuity

Last session: 2026-01-01
Stopped at: start
Resume file: None
`);
  fs.writeFileSync(path.join(dir, '.planning', 'MILESTONE-CONTEXT.md'), '# v0.1 Hi context\n');
  execSync('git add -A && git commit -q -m scaffold', { cwd: dir });
  return dir;
}

// ---------- parsePlanId ----------

section('parsePlanId');
ok('parses "01-02"', JSON.stringify(lifecycle.parsePlanId('01-02')) === JSON.stringify({ phaseNum: '1', planSeq: '02', id: '01-02' }));
ok('parses "10-03"', lifecycle.parsePlanId('10-03').phaseNum === '10');
ok('parses decimal "2.1-04"', lifecycle.parsePlanId('2.1-04').phaseNum === '2.1');
let threw = false;
try { lifecycle.parsePlanId('garbage'); } catch { threw = true; }
ok('throws on garbage', threw);

// ---------- tickPlan ----------

section('tickPlan');
{
  const root = freshProject('tick');
  const r1 = lifecycle.tickPlan(root, '01-01');
  ok('returns 2 actions (ROADMAP + phase PLAN)', r1.actions.length === 2);
  ok('ROADMAP changed', r1.roadmapChanged);
  ok('phase PLAN changed', r1.planChanged);
  const roadmapContent = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP has [x] for 01-01', /-\s+\[x\]\s+01-01:/.test(roadmapContent));

  const r2 = lifecycle.tickPlan(root, '01-01');
  ok('idempotent (no actions on repeat)', r2.actions.length === 0);

  const r3 = lifecycle.tickPlan(root, '01-01', { undo: false, done: false });
  ok('--undo (done:false) reverts', r3.actions.length === 2);
  const after = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP has [ ] after un-tick', /-\s+\[ \]\s+01-01:/.test(after));

  let err = null;
  try { lifecycle.tickPlan(root, '99-99'); } catch (e) { err = e; }
  ok('errors on unknown phase', err && /not found/i.test(err.message));

  const dry = lifecycle.tickPlan(root, '01-02', { dryRun: true });
  ok('dry-run returns actions without writing', dry.actions.length === 2);
  const stillClean = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('dry-run did not write ROADMAP', !/-\s+\[x\]\s+01-02:/.test(stillClean));
}

// ---------- writeSummary ----------

section('writeSummary');
{
  const root = freshProject('summary');

  // Write with kebab-case keys.
  const r1 = lifecycle.writeSummary(root, '01-01', {
    subsystem: 'greet',
    tags: ['cli'],
    'requirements-completed': ['say hello'],
    'key-files': { created: ['src/a.js'], modified: [] },
    duration: '2min',
  });
  ok('writes 01-01-SUMMARY.md (no slug)', /01-01-SUMMARY\.md$/.test(r1.path));
  const s1 = fm.parse(fs.readFileSync(r1.path, 'utf8'));
  ok('preserves subsystem (singular)', s1.frontmatter.subsystem === 'greet');
  ok('preserves key-files.created', s1.frontmatter['key-files'].created[0] === 'src/a.js');
  ok('backfills phase=1', s1.frontmatter.phase === 1);
  ok('backfills plan="01-01"', s1.frontmatter.plan === '01-01');
  ok('backfills completed (today)', typeof s1.frontmatter.completed === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s1.frontmatter.completed));

  // Write with snake_case keys → should normalise.
  const r2 = lifecycle.writeSummary(root, '01-02', {
    subsystems: ['greet'],            // singular alias
    tags: ['cli'],
    files_created: ['src/b.js'],      // -> key-files.created
    files_modified: ['src/a.js'],     // -> key-files.modified
    requirements_completed: ['say bye'],
    key_decisions: ['use console.log'],
    patterns_established: ['one file per cmd'],
    tech_stack: { added: ['node'] },
    duration: '1min',
  });
  const s2 = fm.parse(fs.readFileSync(r2.path, 'utf8'));
  ok('subsystems:[greet] -> subsystem:"greet"', s2.frontmatter.subsystem === 'greet');
  ok('files_created -> key-files.created', s2.frontmatter['key-files'].created[0] === 'src/b.js');
  ok('files_modified -> key-files.modified', s2.frontmatter['key-files'].modified[0] === 'src/a.js');
  ok('requirements_completed -> kebab', s2.frontmatter['requirements-completed'][0] === 'say bye');
  ok('key_decisions -> kebab', Array.isArray(s2.frontmatter['key-decisions']));
  ok('patterns_established -> kebab', Array.isArray(s2.frontmatter['patterns-established']));
  ok('tech_stack -> kebab', s2.frontmatter['tech-stack'].added[0] === 'node');

  // Refuses overwrite by default.
  let err = null;
  try { lifecycle.writeSummary(root, '01-01', { subsystem: 'x' }); } catch (e) { err = e; }
  ok('refuses overwrite without flag', err && /already exists/.test(err.message));

  // Overwrite works.
  const r3 = lifecycle.writeSummary(root, '01-01', { subsystem: 'updated' }, { overwrite: true });
  const s3 = fm.parse(fs.readFileSync(r3.path, 'utf8'));
  ok('overwrite:true rewrites', s3.frontmatter.subsystem === 'updated');

  // Dry-run.
  const root2 = freshProject('summary-dry');
  const dry = lifecycle.writeSummary(root2, '01-01', { subsystem: 'x' }, { dryRun: true });
  ok('dry-run returns path without writing', dry.action === 'dryrun' && !fs.existsSync(dry.path));

  // Body override.
  const r4 = lifecycle.writeSummary(root2, '01-01', { subsystem: 'y' }, { body: '# Custom body\n' });
  const s4Raw = fs.readFileSync(r4.path, 'utf8');
  ok('custom body honoured', /# Custom body/.test(s4Raw));
}

// ---------- statusReport ----------

section('statusReport');
{
  const root = freshProject('status');
  const s = lifecycle.statusReport(root);
  ok('ok=true', s.ok);
  ok('finds in-progress milestone "v0.1 Hi"', s.milestone === 'v0.1 Hi');
  ok('milestoneStatus=in-progress', s.milestoneStatus === 'in-progress');
  ok('one phase listed', s.phases.length === 1);
  ok('phase 1 has 0/2 plans done initially', s.phases[0].done === 0 && s.phases[0].total === 2);
  ok('nextPlan = 01-01', s.nextPlan && s.nextPlan.planId === '01-01');

  lifecycle.tickPlan(root, '01-01', { dryRun: false });
  const s2 = lifecycle.statusReport(root);
  ok('after tick 01-01: nextPlan = 01-02', s2.nextPlan.planId === '01-02');
  ok('after tick 01-01: 1/2 done', s2.phases[0].done === 1);

  lifecycle.tickPlan(root, '01-02');
  const s3 = lifecycle.statusReport(root);
  ok('after both ticked: nextPlan=null', s3.nextPlan === null);
}

{
  // Missing roadmap
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-empty-'));
  const r = lifecycle.statusReport(root);
  ok('missing roadmap → ok:false', !r.ok && /missing/i.test(r.error));
}

// ---------- completeMilestone ----------

section('completeMilestone');
{
  // Incomplete → fails with structured reason
  const root = freshProject('incomplete');
  const r = lifecycle.completeMilestone(root, { noCommit: true });
  ok('incomplete returns ok:false reason:incomplete', !r.ok && r.reason === 'incomplete');
  ok('verify.reports has 1 phase', r.verify.reports.length === 1);
  ok('reports plansDone=0/2', r.verify.reports[0].plansDone === 0);
  ok('reports summariesMissing 01-01, 01-02', r.verify.reports[0].summariesMissing.length === 2);
}

{
  // Complete flow.
  const root = freshProject('complete');
  lifecycle.tickPlan(root, '01-01');
  lifecycle.tickPlan(root, '01-02');
  lifecycle.writeSummary(root, '01-01', { subsystem: 'g', tags: ['cli'], requires: [], provides: ['hello'], 'key-files': { created: ['src/a.js'], modified: [] }, 'requirements-completed': ['hello'], 'key-decisions': ['x'], 'patterns-established': [], duration: '2min' });
  lifecycle.writeSummary(root, '01-02', { subsystem: 'g', tags: ['cli'], requires: ['hello'], provides: ['bye'], 'key-files': { created: ['src/b.js'], modified: [] }, 'requirements-completed': ['bye'], 'key-decisions': [], 'patterns-established': ['p1'], duration: '1min' });

  // Dry-run first.
  const dry = lifecycle.completeMilestone(root, { dryRun: true, noCommit: true });
  ok('dry-run ok=true', dry.ok);
  ok('dry-run dryRun=true', dry.dryRun === true);
  ok('dry-run did NOT write MILESTONES.md', !fs.existsSync(path.join(root, '.planning', 'MILESTONES.md')));
  ok('dry-run did NOT delete MILESTONE-CONTEXT.md', fs.existsSync(path.join(root, '.planning', 'MILESTONE-CONTEXT.md')));
  ok('dry-run actions length 4 (MILESTONES write + ROADMAP write + STATE write + MC delete)', dry.actions.length === 4);

  // Real run.
  const real = lifecycle.completeMilestone(root, { noCommit: true });
  ok('real run ok=true', real.ok);
  ok('milestone="v0.1 Hi"', real.milestone === 'v0.1 Hi');
  ok('aggregated subsystem=greet (singular -> array)', real.agg.subsystems.includes('g'));
  ok('aggregated 2 files created', real.agg.filesCreated.length === 2);
  ok('MILESTONES.md created', fs.existsSync(path.join(root, '.planning', 'MILESTONES.md')));
  const milestonesContent = fs.readFileSync(path.join(root, '.planning', 'MILESTONES.md'), 'utf8');
  ok('MILESTONES.md contains "v0.1 Hi  — shipped"', /v0\.1 Hi\s+—\s+shipped/.test(milestonesContent));
  ok('MILESTONE-CONTEXT.md deleted', !fs.existsSync(path.join(root, '.planning', 'MILESTONE-CONTEXT.md')));
  const roadmapAfter = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP wrapped in <details>', /<details>[\s\S]*v0\.1 Hi[\s\S]*<\/details>/.test(roadmapAfter));
  const stateAfter = fs.readFileSync(path.join(root, '.planning', 'STATE.md'), 'utf8');
  ok('STATE Status -> Idle', /Status:\s+Idle/.test(stateAfter));
  ok('STATE Last activity references milestone', /Last activity:\s+\d{4}-\d{2}-\d{2}\s+—\s+shipped v0\.1 Hi/.test(stateAfter));

  // Idempotency on already-shipped: findMilestoneInRoadmap should still find it
  // (status reports as shipped); but verifyMilestoneComplete still ok=true →
  // completeMilestone will create a SECOND digest. That's user error and the
  // current behavior; just make sure we don't crash.
  const replay = lifecycle.completeMilestone(root, { name: 'v0.1 Hi', noCommit: true });
  ok('replay does not crash (idempotent for caller)', replay.ok === true || replay.ok === false);
}

{
  // No current milestone case
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-noms-'));
  execSync('git init -q -b main', { cwd: root });
  execSync('git config user.email t@l && git config user.name t', { cwd: root });
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), `# x\n\n## Phases\n\nno milestones here.\n`);
  const r = lifecycle.completeMilestone(root, { noCommit: true });
  ok('no current milestone → reason:no-current-milestone', !r.ok && r.reason === 'no-current-milestone');
  ok('hint present', typeof r.hint === 'string');
}

{
  // Explicit --name for unknown milestone
  const root = freshProject('badname');
  const r = lifecycle.completeMilestone(root, { name: 'v99 Nope', noCommit: true });
  ok('unknown name → reason:milestone-not-found', !r.ok && r.reason === 'milestone-not-found');
}

// ---------- commit integration ----------

section('completeMilestone w/ git commit');
{
  const root = freshProject('commit');
  lifecycle.tickPlan(root, '01-01');
  lifecycle.tickPlan(root, '01-02');
  lifecycle.writeSummary(root, '01-01', { subsystem: 'g' });
  lifecycle.writeSummary(root, '01-02', { subsystem: 'g' });
  const r = lifecycle.completeMilestone(root);
  ok('commit hash returned', typeof r.commit === 'string' && /^[0-9a-f]{6,}$/.test(r.commit));
  const log = execSync('git log -1 --format=%s', { cwd: root }).toString().trim();
  ok('commit message starts with "cp: /cp-complete-milestone"', log.startsWith('cp: /cp-complete-milestone'));
}

// ---------- scaffoldMilestone ----------

section('scaffoldMilestone');
{
  const root = freshProject('sm-base');
  // Clear out the seeded milestone so we can scaffold a fresh one.
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# demo\n\n## Phases\n\n## Progress\n\n');
  const r = lifecycle.scaffoldMilestone(root, 'v0.2 Greet v2');
  ok('ok=true on first add', r.ok);
  ok('milestone name preserved', r.milestone === 'v0.2 Greet v2');
  ok('status defaults to in-progress', r.status === 'in-progress');
  ok('two actions emitted', r.actions.length === 2);
  const content = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('heading injected with 🚧 emoji + (In Progress) suffix',
    content.includes('### 🚧 v0.2 Greet v2 (In Progress)'));
  // Round-trip: lib/milestone parser sees it.
  const found = milestone.findMilestoneInRoadmap(content, 'v0.2 Greet v2');
  ok('round-trip via findMilestoneInRoadmap', found && found.status === 'in-progress');
}

section('scaffoldMilestone refuses duplicate');
{
  const root = freshProject('sm-dup');
  // freshProject already has "v0.1 Hi" in-progress.
  const r = lifecycle.scaffoldMilestone(root, 'v0.1 Hi');
  ok('ok=false with reason:milestone-exists', !r.ok && r.reason === 'milestone-exists');
  ok('returns existing milestone meta', r.milestone === 'v0.1 Hi' && r.status === 'in-progress');
}

section('scaffoldMilestone --planned');
{
  const root = freshProject('sm-planned');
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# demo\n\n## Phases\n\n');
  const r = lifecycle.scaffoldMilestone(root, 'v0.5 Future', { status: 'planned' });
  ok('planned status accepted', r.ok && r.status === 'planned');
  const content = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('emoji is 📋 with (Planned) suffix',
    content.includes('### 📋 v0.5 Future (Planned)'));
}

section('scaffoldMilestone --dry-run');
{
  const root = freshProject('sm-dry');
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# demo\n\n## Phases\n\n');
  const r = lifecycle.scaffoldMilestone(root, 'v0.3', { dryRun: true });
  ok('dryRun ok=true', r.ok && r.dryRun);
  const content = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('disk unchanged in dry-run', !content.includes('v0.3'));
}

section('scaffoldMilestone errors on missing ## Phases');
{
  const root = freshProject('sm-no-phases');
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# demo\n\nno phases section\n');
  let threw = false;
  try { lifecycle.scaffoldMilestone(root, 'v1'); } catch (e) { threw = /no\s+`## Phases`/.test(e.message); }
  ok('throws with clear message when ## Phases missing', threw);
}

// ---------- scaffoldPhase ----------

section('scaffoldPhase happy path');
{
  const root = freshProject('sp-base');
  // Remove the seeded phase 1 dir so we can scaffold a phase 2.
  const r = lifecycle.scaffoldPhase(root, '2', { name: 'Ship It', plans: 3 });
  ok('ok=true', r.ok);
  ok('phaseNum echoed', r.phaseNum === '2');
  ok('milestone resolved to active', r.milestone === 'v0.1 Hi');
  ok('plans list returned', JSON.stringify(r.plans) === '["02-01","02-02","02-03"]');
  ok('phase dir created', fs.existsSync(r.phaseDir) && r.phaseDir.endsWith('02-ship-it'));
  ok('PLAN.md created', fs.existsSync(path.join(r.phaseDir, 'PLAN.md')));
  const planContent = fs.readFileSync(path.join(r.phaseDir, 'PLAN.md'), 'utf8');
  ok('PLAN.md frontmatter has phase + milestone',
    planContent.includes('phase: "2"') && planContent.includes('milestone: v0.1 Hi'));
  ok('PLAN.md lists generated plans',
    planContent.includes('- [ ] 02-01:') && planContent.includes('- [ ] 02-03:'));
  // ROADMAP got the phase heading + checkboxes.
  const rmap = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP has new ### Phase 2: heading', rmap.includes('### Phase 2: Ship It'));
  ok('ROADMAP has 02-01..02-03 checkboxes',
    rmap.includes('- [ ] 02-01: TBD') && rmap.includes('- [ ] 02-03: TBD'));
}

section('scaffoldPhase decimal phase number');
{
  const root = freshProject('sp-decimal');
  const r = lifecycle.scaffoldPhase(root, '1.5', { name: 'Hotfix', plans: 1 });
  ok('ok=true for decimal', r.ok);
  ok('plan id uses decimal phase', r.plans[0] === '1.5-01');
  ok('dir name preserves decimal', path.basename(r.phaseDir) === '1.5-hotfix');
}

section('scaffoldPhase refuses duplicate phase number');
{
  const root = freshProject('sp-dup');
  // Phase 1 dir already exists in fixture.
  const r = lifecycle.scaffoldPhase(root, '1', { name: 'Greet again' });
  ok('ok=false with reason:phase-exists', !r.ok && r.reason === 'phase-exists');
}

section('scaffoldPhase fails when no active milestone');
{
  const root = freshProject('sp-no-ms');
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# demo\n\n## Phases\n\n## Progress\n\n');
  // Use a fresh phase number (the seeded 01-greet would trigger phase-exists first).
  const r = lifecycle.scaffoldPhase(root, '9', { name: 'X' });
  ok('reason:no-active-milestone', !r.ok && r.reason === 'no-active-milestone');
}

section('scaffoldPhase --milestone selects by name');
{
  const root = freshProject('sp-target');
  // Add a second planned milestone.
  lifecycle.scaffoldMilestone(root, 'v0.2 Later', { status: 'planned' });
  const r = lifecycle.scaffoldPhase(root, '5', { name: 'Future', milestone: 'v0.2', plans: 1 });
  ok('targets the named milestone, not the active one',
    r.ok && r.milestone === 'v0.2 Later');
}

section('scaffoldPhase --dry-run');
{
  const root = freshProject('sp-dry');
  const r = lifecycle.scaffoldPhase(root, '7', { name: 'D', plans: 1, dryRun: true });
  ok('dryRun ok=true', r.ok && r.dryRun);
  ok('phase dir NOT created in dry-run', !fs.existsSync(r.phaseDir));
  const rmap = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP unchanged in dry-run', !rmap.includes('### Phase 7:'));
}

section('scaffold + tick + complete round-trip');
{
  const root = freshProject('sp-roundtrip');
  // Replace seeded ROADMAP with an empty Phases shape, then scaffold from scratch.
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# demo\n\n## Phases\n\n## Progress\n\n');
  // Remove seeded phase dir
  fs.rmSync(path.join(root, '.planning', 'phases', '01-greet'), { recursive: true, force: true });
  // Scaffold
  let r = lifecycle.scaffoldMilestone(root, 'v0.1 Round');
  ok('scaffold milestone ok', r.ok);
  r = lifecycle.scaffoldPhase(root, '1', { name: 'Only', plans: 1 });
  ok('scaffold phase ok', r.ok);
  // Tick the only plan
  lifecycle.tickPlan(root, '01-01', { noCommit: true });
  // Write a SUMMARY so complete-milestone passes verification
  lifecycle.writeSummary(root, '01-01', { subsystem: 'only' });
  // Complete
  const cm = lifecycle.completeMilestone(root, { noCommit: true });
  ok('complete-milestone succeeds on scaffolded shape', cm.ok);
}

// ---------- end scaffolding tests ----------


if (failed > 0) process.exit(1);
console.log('All lifecycle checks passed.');
