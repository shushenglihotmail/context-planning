#!/usr/bin/env node
/**
 * Dry-run the /cp-progress command's logic against a realistic fixture to
 * confirm the command md actually produces a sensible report when an agent
 * follows it literally.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const roadmap = require(path.join(REPO, 'lib', 'roadmap'));
const paths = require(path.join(REPO, 'lib', 'paths'));
const state = require(path.join(REPO, 'lib', 'state'));

const sandbox = path.join(
  process.env.TEMP || '/tmp',
  'cp-progress-demo-' + Date.now()
);
fs.mkdirSync(sandbox, { recursive: true });

execFileSync('node', [path.join(REPO, 'bin', 'cp.js'), 'init'], {
  cwd: sandbox,
  stdio: 'pipe',
});

// Replace templated ROADMAP with a realistic mid-flight one
fs.writeFileSync(
  path.join(sandbox, '.planning', 'ROADMAP.md'),
`# Roadmap: DemoApp

## Milestones
- \u2705 **v1.0 MVP** \u2014 Phases 1-2 (shipped 2026-04-01)
- \uD83D\uDEA7 **v1.1 Sharing** \u2014 Phases 3-4 (in progress)

## Phases

### Phase 1: Foundation
**Goal**: scaffold
**Requirements**: [REQ-01]
**Plans**: 2 plans

Plans:
- [x] 01-01: init
- [x] 01-02: server

### Phase 2: Core
**Goal**: todo CRUD
**Requirements**: [REQ-02]
**Plans**: 2 plans

Plans:
- [x] 02-01: model
- [x] 02-02: UI

### Phase 3: Sharing
**Goal**: share lists
**Requirements**: [REQ-04]
**Plans**: 2 plans

Plans:
- [x] 03-01: token model
- [ ] 03-02: share UI

### Phase 4: Export
**Goal**: export json
**Requirements**: [REQ-05]
**Plans**: 1 plan

Plans:
- [ ] 04-01: export endpoint
`
);

// Drop in a real PLAN.md for phase 3 plan 03-02 so the "next" suggestion picks execute
fs.mkdirSync(path.join(sandbox, '.planning', 'phases', '03-sharing'), { recursive: true });
fs.writeFileSync(
  path.join(sandbox, '.planning', 'phases', '03-sharing', '03-02-PLAN.md'),
'---\nphase: 03-sharing\nplan: 02\ntype: execute\nwave: 2\n---\n\n# share UI\n'
);

// ===== simulate /cp-progress per the command's instructions =====
const roadmapContent = fs.readFileSync(
  path.join(sandbox, '.planning', 'ROADMAP.md'),
  'utf8'
);
const phases = roadmap.listPhases(roadmapContent);

let totalPlans = 0;
let donePlans = 0;
for (const p of phases) {
  totalPlans += p.plans.length;
  donePlans += p.plans.filter((pl) => pl.done).length;
}
const pct = totalPlans ? Math.round((donePlans / totalPlans) * 100) : 0;

// "current" = lowest-numbered phase that is in-progress; else lowest not-started w/ plans
let current = phases.find(
  (p) => p.plans.some((pl) => pl.done) && p.plans.some((pl) => !pl.done)
);
if (!current) {
  current = phases.find((p) => p.plans.length > 0 && !p.plans.some((pl) => pl.done));
}
const nextPlan = current ? current.plans.find((pl) => !pl.done) : null;

function sym(p) {
  if (p.plans.length === 0) return ' ';
  const done = p.plans.filter((pl) => pl.done).length;
  if (done === p.plans.length) return '\u2713';
  if (done > 0) return '\u25B6';
  return ' ';
}
function status(p) {
  if (p.plans.length === 0) return 'Planned';
  const done = p.plans.filter((pl) => pl.done).length;
  if (done === p.plans.length) return 'Complete';
  if (done > 0) return 'In progress';
  return 'Not started';
}

console.log('cp progress');
console.log('-----------');
console.log('');
console.log('Project:    DemoApp');
console.log('Milestone:  v1.1 Sharing');
console.log('');
console.log('You are here:');
console.log(
  '  Phase ' +
    current.num +
    ': ' +
    current.name +
    '   (' +
    current.plans.filter((p) => p.done).length +
    '/' +
    current.plans.length +
    ' plans complete - ' +
    status(current) +
    ')'
);
console.log(
  '  Plan  ' + nextPlan.id + ': ' + nextPlan.desc + '    <- next action'
);
console.log('');
console.log(
  'Overall:    ' +
    donePlans +
    '/' +
    totalPlans +
    ' plans complete   ' +
    state.progressBar(pct)
);
console.log('');
console.log('Phase breakdown:');
for (const p of phases) {
  const total = p.plans.length;
  const done = p.plans.filter((pl) => pl.done).length;
  console.log(
    '  ' +
      sym(p) +
      ' Phase ' +
      p.num +
      ': ' +
      (p.name + '                                ').slice(0, 28) +
      ' (' +
      done +
      '/' +
      total +
      ' - ' +
      status(p) +
      ')'
  );
}
console.log('');

const phaseDir = paths.findPhaseDir(current.num, sandbox);
const planFile = phaseDir
  ? path.join(phaseDir, nextPlan.id + '-PLAN.md')
  : null;
const planExists = planFile && fs.existsSync(planFile);
if (planExists) {
  console.log('Suggested next: /cp-execute-phase ' + current.num);
} else {
  console.log(
    'Suggested next: /cp-autonomous   (no PLAN.md yet for plan ' +
      nextPlan.id +
      ' — workflow plan phase will produce DESIGN.md)'
  );
}
