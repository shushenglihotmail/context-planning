#!/usr/bin/env node
/**
 * End-to-end round-trip test: prove cp can read, write, and coexist with a
 * realistic GSD project without corrupting GSD-shape state.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const CP = path.join(REPO, 'bin', 'cp.js');

const roadmap = require(path.join(REPO, 'lib', 'roadmap'));
const paths = require(path.join(REPO, 'lib', 'paths'));
const fm = require(path.join(REPO, 'lib', 'frontmatter'));

// ---------- tiny test runner ----------
let passed = 0;
let failed = 0;
const failures = [];
function ok(label, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ' :: ' + detail : ''}`);
    console.log(`  \u2717 ${label}${detail ? ' :: ' + detail : ''}`);
  }
}
function section(name) {
  console.log(`\n=== ${name} ===`);
}

// ---------- fixture builder ----------
function sha1(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}
function snapshot(root) {
  const out = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const rel = path.relative(root, full).replace(/\\/g, '/');
        const buf = fs.readFileSync(full);
        out[rel] = { size: buf.length, sha1: sha1(buf) };
      }
    }
  }
  walk(root);
  return out;
}
function diffSnap(before, after) {
  const changed = [];
  const added = [];
  const removed = [];
  for (const k of Object.keys(before)) {
    if (!(k in after)) removed.push(k);
    else if (before[k].sha1 !== after[k].sha1) changed.push(k);
  }
  for (const k of Object.keys(after)) {
    if (!(k in before)) added.push(k);
  }
  return { changed, added, removed };
}
function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function buildFixture(root) {
  const dot = path.join(root, '.planning');
  fs.mkdirSync(dot, { recursive: true });

  for (const d of ['research', 'todos/pending', 'todos/completed', 'seeds', 'codebase']) {
    fs.mkdirSync(path.join(dot, d), { recursive: true });
  }
  writeFile(path.join(dot, 'research', 'auth-libs.md'), '# Research: auth libs\n\nbcrypt vs argon2.\n');
  writeFile(path.join(dot, 'todos', 'pending', '2026-05-19-error-log.md'), '# Pending: pipe errors to log\n');
  writeFile(path.join(dot, 'seeds', 'idea-graph-viz.md'), '# Seed: build a graph viz\n');
  writeFile(path.join(dot, 'codebase', 'architecture.md'), '# Codebase architecture\n');

  writeFile(path.join(dot, 'PROJECT.md'), `# Project: TodoApp

## Vision
A no-bullshit todo app.

## Tech Stack
- Node.js
- Postgres
- React
`);

  writeFile(path.join(dot, 'REQUIREMENTS.md'), `# Requirements

- REQ-01: User can sign up with email
- REQ-02: User can create a todo
- REQ-03: User can mark a todo done
- REQ-04: User can share a list
- REQ-05: User can export to JSON
`);

  writeFile(path.join(dot, 'MILESTONES.md'), `# Milestones (archive)

## v1.0 MVP - shipped 2026-04-01

Phases 1-2 complete.
`);

  writeFile(path.join(dot, 'MILESTONE-CONTEXT.md'), `# Milestone Context: v1.1 Sharing

**Status**: in progress
**Started**: 2026-05-01
`);

  writeFile(path.join(dot, 'ROADMAP.md'), `# Roadmap: TodoApp

## Milestones

- \u2705 **v1.0 MVP** - Phases 1-2 (shipped 2026-04-01)
- \uD83D\uDEA7 **v1.1 Sharing** - Phases 3-4 (in progress)

## Phases

<details>
<summary>\u2705 v1.0 MVP (Phases 1-2) - SHIPPED 2026-04-01</summary>

### Phase 1: Foundation
**Goal**: Skeleton + auth
**Depends on**: Nothing (first phase)
**Requirements**: [REQ-01]
**Plans**: 2 plans

Plans:
- [x] 01-01: scaffold project
- [x] 01-02: signup endpoint

### Phase 2: Core Todos
**Goal**: Create/list/mark todos
**Depends on**: Phase 1
**Requirements**: [REQ-02, REQ-03]
**Plans**: 2 plans

Plans:
- [x] 02-01: todo model
- [x] 02-02: todo CRUD UI

</details>

### \uD83D\uDEA7 v1.1 Sharing (In Progress)

### Phase 3: Sharing
**Goal**: Share lists via link
**Depends on**: Phase 2
**Requirements**: [REQ-04]
**Plans**: 2 plans

Plans:
- [x] 03-01: share-token model
- [ ] 03-02: share UI

### Phase 3.1: Token expiry hotfix (INSERTED)
**Goal**: Expire stale tokens
**Depends on**: Phase 3
**Requirements**: [REQ-04]
**Plans**: 1 plan

Plans:
- [ ] 3.1-01: cron purge job

### Phase 4: Export
**Goal**: Export to JSON
**Depends on**: Phase 3
**Requirements**: [REQ-05]
**Plans**: 1 plan

Plans:
- [ ] 04-01: export endpoint

## Progress

**Execution Order:**
Phases execute in numeric order: 1 \u2192 2 \u2192 3 \u2192 3.1 \u2192 4

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 2/2 | Complete | 2026-03-15 |
| 2. Core Todos | v1.0 | 2/2 | Complete | 2026-04-01 |
| 3. Sharing | v1.1 | 1/2 | In progress | - |
| 3.1. Token expiry hotfix | v1.1 | 0/1 | Not started | - |
| 4. Export | v1.1 | 0/1 | Not started | - |
`);

  writeFile(path.join(dot, 'STATE.md'), `# Current State

**Last Updated**: 2026-05-19
**Current Position**: Phase 3, Plan 03-02

## Active Work
Working on share UI.

## Performance Metrics
- Avg plan duration: 2h

## Deferred Items
- Mobile UI - waiting on design

## Pending Todos
- 2026-05-19-error-log.md (pipe errors to log)

## Quick Tasks Completed

| Date | Slug | Summary |
|------|------|---------|
| 2026-05-10 | fix-cors-headers | added missing CORS for /api/share |
`);

  writeFile(path.join(dot, 'config.json'),
    JSON.stringify({
      mode: 'interactive',
      granularity: 'standard',
      project_code: 'todoapp',
      workflow: { research: true, plan_check: true, ui_check: false },
      gates: { confirm_project: true, plan_check: true },
      paths: { planning_dir: '.planning' },
    }, null, 2)
  );

  writeFile(
    path.join(dot, 'phases', '01-foundation', '01-01-PLAN.md'),
`---
phase: 01-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - src/server.js
autonomous: true
requirements:
  - REQ-01
must_haves:
  truths:
    - "App boots on port 3000"
  artifacts:
    - path: src/server.js
      provides: HTTP entrypoint
---

<objective>
Scaffold the project.
</objective>
`);

  writeFile(
    path.join(dot, 'phases', '01-foundation', '01-01-SUMMARY.md'),
`---
phase: 01-foundation
plan: 01
type: summary
subsystem: foundation
tags: [scaffold, server]
requires: []
provides:
  - HTTP entrypoint
affects:
  - src/server.js
tech-stack:
  added: [express]
  patterns: [express-default]
key-files:
  created: [package.json, src/server.js]
  modified: []
requirements-completed:
  - REQ-01
duration: 1h
completed: 2026-03-10
---

# Summary

Scaffolded the express server.
`);

  writeFile(
    path.join(dot, 'phases', '03-sharing', '03-01-PLAN.md'),
`---
phase: 03-sharing
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
autonomous: true
requirements:
  - REQ-04
---

<objective>
Add ShareToken model.
</objective>
`);

  writeFile(
    path.join(dot, 'phases', '03-sharing', '03-01-SUMMARY.md'),
`---
phase: 03-sharing
plan: 01
type: summary
subsystem: sharing
tags: [share-token]
requires: [foundation]
provides:
  - share-token model
affects:
  - prisma/schema.prisma
key-files:
  created: [src/models/share.js]
  modified: [prisma/schema.prisma]
requirements-completed:
  - REQ-04
duration: 45m
completed: 2026-05-15
---

# Summary

ShareToken model created with 7-day TTL.
`);

  writeFile(
    path.join(dot, 'phases', '03-sharing', '03-02-PLAN.md'),
`---
phase: 03-sharing
plan: 02
type: execute
wave: 2
depends_on:
  - "03-01"
files_modified:
  - src/components/ShareDialog.jsx
autonomous: true
requirements:
  - REQ-04
must_haves:
  truths:
    - "User can open share dialog from list view"
  artifacts:
    - path: src/components/ShareDialog.jsx
      provides: share UI
---

<objective>
Build the share dialog.
</objective>
`);

  writeFile(
    path.join(dot, 'phases', '3.1-token-expiry-hotfix', '3.1-01-PLAN.md'),
`---
phase: 3.1-token-expiry-hotfix
plan: 01
type: execute
wave: 1
depends_on:
  - "03-01"
files_modified:
  - src/jobs/purge-tokens.js
autonomous: true
requirements:
  - REQ-04
---

<objective>
Cron purge job for expired tokens.
</objective>
`);

  fs.mkdirSync(path.join(dot, 'phases', '04-export'), { recursive: true });

  return dot;
}

function listBlocksByPhase(content) {
  const phases = roadmap.listPhases(content);
  const result = {};
  for (const p of phases) {
    result[p.num] = content.slice(p.blockStart, p.blockEnd);
  }
  return result;
}

function run() {
  const sandbox = path.join(
    process.env.TEMP || '/tmp',
    'cp-roundtrip-' + Date.now()
  );
  fs.mkdirSync(sandbox, { recursive: true });
  console.log(`\nSandbox: ${sandbox}\n`);

  section('1. Build realistic GSD fixture');
  const dot = buildFixture(sandbox);
  ok('fixture .planning/ exists', fs.existsSync(dot));
  const initialFiles = Object.keys(snapshot(dot));
  ok('fixture has expected file count', initialFiles.length >= 15,
    `got ${initialFiles.length} files`);

  section('2. Snapshot before cp init');
  const before = snapshot(dot);

  section('3. Run `cp init` (must be additive only)');
  const initOut = execFileSync('node', [CP, 'init'], {
    cwd: sandbox,
    encoding: 'utf8',
  });
  console.log(initOut.split('\n').map((l) => '    ' + l).join('\n'));

  const after = snapshot(dot);
  const diff = diffSnap(before, after);
  ok('no files removed by cp init', diff.removed.length === 0,
    'removed: ' + diff.removed.join(','));
  ok(
    'only config.json changed (cp block injected)',
    diff.changed.length === 1 && diff.changed[0] === 'config.json',
    'changed: ' + diff.changed.join(', ')
  );
  ok(
    'no GSD files added (all already present)',
    diff.added.length === 0,
    'added: ' + diff.added.join(', ')
  );

  const cfg = JSON.parse(fs.readFileSync(path.join(dot, 'config.json'), 'utf8'));
  ok('config.json kept top-level `mode`', cfg.mode === 'interactive');
  ok('config.json kept top-level `granularity`', cfg.granularity === 'standard');
  ok('config.json kept top-level `project_code`', cfg.project_code === 'todoapp');
  ok('config.json kept nested `workflow.research`',
    cfg.workflow && cfg.workflow.research === true);
  ok('config.json kept nested `gates.confirm_project`',
    cfg.gates && cfg.gates.confirm_project === true);
  ok('config.json kept nested `paths.planning_dir`',
    cfg.paths && cfg.paths.planning_dir === '.planning');
  ok('config.json gained `cp` block', cfg.cp && typeof cfg.cp === 'object');
  ok('cp block has workflow_provider',
    cfg.cp.workflow_provider === 'superpowers');
  ok('cp block has providers.superpowers.skills',
    cfg.cp.providers && cfg.cp.providers.superpowers &&
    cfg.cp.providers.superpowers.skills);
  ok('cp block has gsd_compat_mode on',
    cfg.cp.behavior && cfg.cp.behavior.gsd_compat_mode === true);

  section('4. Run `cp doctor` and parse compat report');
  const docOut = execFileSync('node', [CP, 'doctor'], {
    cwd: sandbox,
    encoding: 'utf8',
  });
  console.log(docOut.split('\n').map((l) => '    ' + l).join('\n'));
  ok('doctor reports cp-aware', /cp-aware config:\s+\u2713/.test(docOut));
  ok('doctor reports GSD sentinels detected',
    /GSD sentinels:\s+\u2713 detected/.test(docOut));
  ok('doctor counted phase dirs',
    /phase dirs:\s+[1-9]/.test(docOut));
  ok('doctor lists shared files',
    /shared files:.*PROJECT\.md/.test(docOut));
  ok('doctor warning fires for GSD project',
    /warnings:/.test(docOut) && /GSD sentinels detected/.test(docOut));

  section('5. Parse real GSD files via cp libraries');
  const roadmapContent = fs.readFileSync(path.join(dot, 'ROADMAP.md'), 'utf8');
  const phases = roadmap.listPhases(roadmapContent);
  ok('parser found all 5 phases', phases.length === 5,
    `got ${phases.length}: ${phases.map(p=>p.num).join(',')}`);
  const phaseMap = Object.fromEntries(phases.map((p) => [p.num, p]));
  ok('Phase 1 has 2 done plans',
    phaseMap['1'] && phaseMap['1'].plans.length === 2 &&
    phaseMap['1'].plans.every(pl => pl.done));
  ok('Phase 3 has 1 done + 1 pending',
    phaseMap['3'] &&
    phaseMap['3'].plans.filter(p=>p.done).length === 1 &&
    phaseMap['3'].plans.filter(p=>!p.done).length === 1);
  ok('Phase 3.1 (decimal) parsed correctly',
    !!phaseMap['3.1'],
    `phase keys: ${Object.keys(phaseMap).join(',')}`);
  ok('Phase 4 has 1 pending plan',
    phaseMap['4'] && phaseMap['4'].plans.length === 1 &&
    !phaseMap['4'].plans[0].done);

  const planRaw = fs.readFileSync(
    path.join(dot, 'phases', '03-sharing', '03-02-PLAN.md'),
    'utf8'
  );
  const parsed = fm.parse(planRaw);
  const fmData = parsed.frontmatter;
  ok('frontmatter parser read GSD plan',
    fmData && fmData.phase === '03-sharing');
  ok('frontmatter parser kept `wave`', fmData.wave === 2);
  ok('frontmatter parser kept `depends_on` as list',
    Array.isArray(fmData.depends_on) &&
    fmData.depends_on[0] === '03-01');
  ok('frontmatter parser kept nested `must_haves`',
    fmData.must_haves &&
    Array.isArray(fmData.must_haves.truths));
  ok('frontmatter parser kept `must_haves.truths[0]`',
    fmData.must_haves &&
    /share dialog/.test(fmData.must_haves.truths[0]));
  ok('frontmatter parser kept `requirements` list',
    Array.isArray(fmData.requirements) &&
    fmData.requirements[0] === 'REQ-04');
  ok('frontmatter parser kept list-of-dict `artifacts`',
    fmData.must_haves &&
    Array.isArray(fmData.must_haves.artifacts) &&
    fmData.must_haves.artifacts[0] &&
    fmData.must_haves.artifacts[0].path === 'src/components/ShareDialog.jsx');

  // Round-trip: re-stringify and re-parse must be lossless for GSD shapes.
  const restrung = fm.stringify(fmData, parsed.body);
  const reparsedPlan = fm.parse(restrung).frontmatter;
  ok('frontmatter round-trip preserves `must_haves.truths`',
    JSON.stringify(reparsedPlan.must_haves.truths) ===
      JSON.stringify(fmData.must_haves.truths));
  ok('frontmatter round-trip preserves `depends_on`',
    JSON.stringify(reparsedPlan.depends_on) ===
      JSON.stringify(fmData.depends_on));
  ok('frontmatter round-trip preserves `files_modified`',
    JSON.stringify(reparsedPlan.files_modified) ===
      JSON.stringify(fmData.files_modified));

  const dir = paths.findPhaseDir('03-sharing', sandbox);
  ok('findPhaseDir returns existing GSD dir (by slug)',
    dir && /03-sharing$/.test(dir), `got: ${dir}`);
  const dirByNum = paths.findPhaseDir('3', sandbox);
  ok('findPhaseDir resolves bare phase number to slug dir',
    dirByNum && /03-sharing$/.test(dirByNum), `got: ${dirByNum}`);
  const dir31 = paths.findPhaseDir('3.1-token-expiry-hotfix', sandbox);
  ok('findPhaseDir handles decimal phase dir (by slug)',
    dir31 && /3\.1-token-expiry-hotfix$/.test(dir31), `got: ${dir31}`);
  const dir31ByNum = paths.findPhaseDir('3.1', sandbox);
  ok('findPhaseDir resolves bare decimal phase number',
    dir31ByNum && /3\.1-token-expiry-hotfix$/.test(dir31ByNum),
    `got: ${dir31ByNum}`);

  const nextPlan = paths.phasePlanPrefix('3', '3');
  ok('phasePlanPrefix(3, 3) == 03-03', nextPlan === '03-03',
    `got ${nextPlan}`);
  const decPlan = paths.phasePlanPrefix('3.1', '2');
  ok('phasePlanPrefix(3.1, 2) == 3.1-02', decPlan === '3.1-02',
    `got ${decPlan}`);

  section('6. Tick plan 03-02 via cp libs (round-trip writeback)');
  const beforeWrite = snapshot(dot);
  const updated = roadmap.setPlanDone(roadmapContent, '03-02', true);
  ok('setPlanDone produced a change', updated !== roadmapContent);
  const xCountBefore = (roadmapContent.match(/^\s*-\s+\[x\]/gm) || []).length;
  const xCountAfter = (updated.match(/^\s*-\s+\[x\]/gm) || []).length;
  ok('exactly one new [x] introduced',
    xCountAfter - xCountBefore === 1,
    `before=${xCountBefore} after=${xCountAfter}`);
  fs.writeFileSync(path.join(dot, 'ROADMAP.md'), updated);

  const reparsed = roadmap.listPhases(updated);
  const ph3 = reparsed.find((p) => p.num === '3');
  ok('after writeback, Phase 3 is fully complete (2/2)',
    ph3 && ph3.plans.length === 2 && ph3.plans.every(p=>p.done));

  const beforeBlocks = listBlocksByPhase(roadmapContent);
  const afterBlocks = listBlocksByPhase(updated);
  for (const num of ['1', '2', '3.1', '4']) {
    ok(`Phase ${num} block byte-identical after writeback`,
      beforeBlocks[num] === afterBlocks[num]);
  }

  section('7. Final snapshot diff (writeback edit only)');
  const finalSnap = snapshot(dot);
  const finalDiff = diffSnap(beforeWrite, finalSnap);
  ok('only ROADMAP.md changed in writeback step',
    finalDiff.changed.length === 1 &&
    finalDiff.changed[0] === 'ROADMAP.md',
    'changed: ' + finalDiff.changed.join(','));
  ok('no files added during writeback',
    finalDiff.added.length === 0);
  ok('no files removed during writeback',
    finalDiff.removed.length === 0);

  console.log(`\n----------------------------------------`);
  console.log(`Passed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  } else {
    console.log('\nAll round-trip checks passed.');
    console.log(`Inspect the fixture at: ${sandbox}`);
  }
}

run();
