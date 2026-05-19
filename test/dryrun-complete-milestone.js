#!/usr/bin/env node
/**
 * Dry-run the /cp-complete-milestone command's logic against the realistic
 * GSD fixture. Proves that lib/milestone:
 *   1. finds the active milestone in ROADMAP
 *   2. correctly identifies which phases belong to it
 *   3. blocks completion when SUMMARYs are missing or plans aren't done
 *   4. after we simulate finishing all plans + writing SUMMARYs, verifies
 *      completion passes
 *   5. aggregates SUMMARY frontmatter across phases correctly
 *   6. renders a milestone digest that round-trips into MILESTONES.md
 *   7. collapses the milestone in ROADMAP.md inside <details>, preserving
 *      every `### Phase N: ...` block byte-for-byte (GSD-compat)
 *   8. produces the kind of report the command markdown promises
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const CP = path.join(REPO, 'bin', 'cp.js');
const milestone = require(path.join(REPO, 'lib', 'milestone'));
const roadmap = require(path.join(REPO, 'lib', 'roadmap'));
const fm = require(path.join(REPO, 'lib', 'frontmatter'));

// ---------- mini test runner ----------
let passed = 0,
  failed = 0;
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
function section(t) {
  console.log(`\n=== ${t} ===`);
}

// ---------- fixture builder (same shape as roundtrip-gsd.js) ----------
function buildFixture(root) {
  const dot = path.join(root, '.planning');
  fs.mkdirSync(dot, { recursive: true });

  fs.writeFileSync(
    path.join(dot, 'config.json'),
    JSON.stringify({ mode: 'interactive', project_code: 'demo' }, null, 2)
  );
  fs.writeFileSync(path.join(dot, 'PROJECT.md'), '# Project: DemoApp\n');
  fs.writeFileSync(
    path.join(dot, 'STATE.md'),
    `# Current State

## Current Position

Phase: 3 of 4 (Sharing)
Plan: 2 of 2 in current phase
Status: In progress
Last activity: 2026-05-19 \u2014 executing phase 3

Progress: [\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591] 71%
`
  );
  fs.writeFileSync(
    path.join(dot, 'MILESTONES.md'),
    `# Milestones (archive)

## v1.0 MVP - shipped 2026-04-01

Phases 1-2 complete.
`
  );
  fs.writeFileSync(
    path.join(dot, 'MILESTONE-CONTEXT.md'),
    '# Milestone: v1.1 Sharing\n\nActive.\n'
  );

  fs.writeFileSync(
    path.join(dot, 'ROADMAP.md'),
    `# Roadmap: DemoApp

## Milestones

- \u2705 **v1.0 MVP** \u2014 Phases 1-2 (shipped 2026-04-01)
- \uD83D\uDEA7 **v1.1 Sharing** \u2014 Phases 3-4 (in progress)

## Phases

### \u2705 v1.0 MVP (Shipped 2026-04-01)

### Phase 1: Foundation
**Goal**: scaffold
**Requirements**: [REQ-01]
**Plans**: 2 plans

Plans:
- [x] 01-01: init
- [x] 01-02: server

### Phase 2: Core
**Goal**: crud
**Requirements**: [REQ-02]
**Plans**: 2 plans

Plans:
- [x] 02-01: model
- [x] 02-02: UI

### \uD83D\uDEA7 v1.1 Sharing (In Progress)

### Phase 3: Sharing
**Goal**: share lists via link
**Requirements**: [REQ-04]
**Plans**: 2 plans

Plans:
- [x] 03-01: share-token model
- [ ] 03-02: share UI

### Phase 3.1: Token expiry hotfix (INSERTED)
**Goal**: expire tokens
**Requirements**: [REQ-04]
**Plans**: 1 plan

Plans:
- [ ] 3.1-01: cron purge job

### Phase 4: Export
**Goal**: export json
**Requirements**: [REQ-05]
**Plans**: 1 plan

Plans:
- [ ] 04-01: export endpoint

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1     | v1.0      | 2/2   | Complete | 2026-04-01 |
| 2     | v1.0      | 2/2   | Complete | 2026-04-01 |
| 3     | v1.1      | 1/2   | In progress | - |
| 3.1   | v1.1      | 0/1   | Not started | - |
| 4     | v1.1      | 0/1   | Not started | - |
`
  );

  // Phase 3 (partial — only 03-01 has a SUMMARY)
  fs.mkdirSync(path.join(dot, 'phases', '03-sharing'), { recursive: true });
  fs.writeFileSync(
    path.join(dot, 'phases', '03-sharing', '03-01-PLAN.md'),
    '---\nphase: 03-sharing\nplan: 01\ntype: execute\nwave: 1\n---\n\nshare-token model.\n'
  );
  fs.writeFileSync(
    path.join(dot, 'phases', '03-sharing', '03-01-SUMMARY.md'),
`---
phase: 03-sharing
plan: 01
type: summary
subsystem: sharing
tags: [share-token, model]
requires: [foundation]
provides:
  - share-token model
affects:
  - prisma/schema.prisma
  - src/models/share.js
tech-stack:
  added: ["@scure/randomid"]
  patterns: [prisma-uuid-pk]
key-files:
  created: [src/models/share.js]
  modified: [prisma/schema.prisma]
key-decisions:
  - Use crypto.randomUUID for share tokens (no extra dep)
patterns-established:
  - tokens TTL = 7d default
requirements-completed:
  - REQ-04
duration: 45m
completed: 2026-05-15
---

# Summary

ShareToken model created.
`
  );
  fs.writeFileSync(
    path.join(dot, 'phases', '03-sharing', '03-02-PLAN.md'),
    '---\nphase: 03-sharing\nplan: 02\ntype: execute\nwave: 2\ndepends_on:\n  - "03-01"\n---\n\nshare UI.\n'
  );

  // Phase 3.1 (no SUMMARY yet)
  fs.mkdirSync(path.join(dot, 'phases', '3.1-token-expiry-hotfix'), { recursive: true });
  fs.writeFileSync(
    path.join(dot, 'phases', '3.1-token-expiry-hotfix', '3.1-01-PLAN.md'),
    '---\nphase: 3.1-token-expiry-hotfix\nplan: 01\ntype: execute\nwave: 1\n---\n\ncron purge.\n'
  );

  // Phase 4
  fs.mkdirSync(path.join(dot, 'phases', '04-export'), { recursive: true });
  fs.writeFileSync(
    path.join(dot, 'phases', '04-export', '04-01-PLAN.md'),
    '---\nphase: 04-export\nplan: 01\ntype: execute\nwave: 1\n---\n\nexport endpoint.\n'
  );

  return dot;
}

// ---------- the test ----------
const sandbox = path.join(
  process.env.TEMP || '/tmp',
  'cp-complete-demo-' + Date.now()
);
fs.mkdirSync(sandbox, { recursive: true });

section('Setup: build realistic fixture');
const dot = buildFixture(sandbox);
ok('fixture .planning/ exists', fs.existsSync(dot));

section('1. lib/milestone.findMilestoneInRoadmap');
let roadmapContent = fs.readFileSync(path.join(dot, 'ROADMAP.md'), 'utf8');
const found = milestone.findMilestoneInRoadmap(roadmapContent, 'v1.1 Sharing');
ok('milestone found by exact name', found && found.name === 'v1.1 Sharing');
ok('milestone status reads "in-progress"', found && found.status === 'in-progress');
ok(
  'phases under v1.1 == [3, 3.1, 4]',
  found && JSON.stringify(found.phases) === JSON.stringify(['3', '3.1', '4']),
  found ? 'got: ' + JSON.stringify(found.phases) : 'null'
);
const fuzzy = milestone.findMilestoneInRoadmap(roadmapContent, 'sharing');
ok('milestone also resolves by substring match', fuzzy && fuzzy.name === 'v1.1 Sharing');
const v10 = milestone.findMilestoneInRoadmap(roadmapContent, 'v1.0 MVP');
ok('shipped milestone v1.0 found', v10 && v10.status === 'shipped');
ok('phases under v1.0 == [1, 2]', v10 && JSON.stringify(v10.phases) === JSON.stringify(['1', '2']));

section('2. verifyMilestoneComplete BLOCKS when plans pending');
const ver1 = milestone.verifyMilestoneComplete(roadmapContent, found.phases, sandbox);
ok('ver1 NOT ok (incomplete plans)', ver1.ok === false);
const ph3report = ver1.reports.find((r) => r.phaseNum === '3');
ok('phase 3 reports 1/2 plans done', ph3report && ph3report.plansDone === 1 && ph3report.plansTotal === 2);
ok('phase 3 summaries: 03-01 present, 03-02 missing',
  ph3report &&
    ph3report.summariesPresent.includes('03-01') &&
    ph3report.summariesMissing.includes('03-02')
);
const ph31 = ver1.reports.find((r) => r.phaseNum === '3.1');
ok('phase 3.1 reports 0/1 plans done', ph31 && ph31.plansDone === 0 && ph31.plansTotal === 1);

section('3. Simulate finishing all plans + writing SUMMARYs');
// tick remaining checkboxes
let rc = roadmapContent;
rc = roadmap.setPlanDone(rc, '03-02', true);
rc = roadmap.setPlanDone(rc, '3.1-01', true);
rc = roadmap.setPlanDone(rc, '04-01', true);
fs.writeFileSync(path.join(dot, 'ROADMAP.md'), rc);
roadmapContent = rc;

// write the missing SUMMARYs with realistic GSD-shape frontmatter
fs.writeFileSync(
  path.join(dot, 'phases', '03-sharing', '03-02-SUMMARY.md'),
`---
phase: 03-sharing
plan: 02
type: summary
subsystem: sharing
tags: [share-ui, modal]
requires: [03-01]
provides:
  - share UI
affects:
  - src/components/ShareDialog.jsx
  - src/routes/share.js
tech-stack:
  added: []
  patterns: [react-modal-portal]
key-files:
  created: [src/components/ShareDialog.jsx]
  modified: [src/routes/index.js]
key-decisions:
  - Modal in portal, not inline (avoid z-index war)
patterns-established:
  - all dialogs use Portal
requirements-completed:
  - REQ-04
duration: 1h30m
completed: 2026-05-19
---

# Summary

ShareDialog ships with portal-based modal.
`
);
fs.writeFileSync(
  path.join(dot, 'phases', '3.1-token-expiry-hotfix', '3.1-01-SUMMARY.md'),
`---
phase: 3.1-token-expiry-hotfix
plan: 01
type: summary
subsystem: sharing
tags: [cron, cleanup]
requires: [03-01]
provides:
  - token purge job
affects:
  - src/jobs/purge-tokens.js
tech-stack:
  added: [node-cron]
  patterns: [cron-every-5m]
key-files:
  created: [src/jobs/purge-tokens.js]
  modified: []
key-decisions:
  - cron every 5 minutes (not every 1m \u2014 too noisy)
patterns-established:
  - cron jobs in src/jobs/
requirements-completed:
  - REQ-04
duration: 30m
completed: 2026-05-19
---

# Summary

Expired tokens purged every 5 minutes.
`
);
fs.writeFileSync(
  path.join(dot, 'phases', '04-export', '04-01-SUMMARY.md'),
`---
phase: 04-export
plan: 01
type: summary
subsystem: export
tags: [json-export]
requires: []
provides:
  - export endpoint
affects:
  - src/api/export.js
tech-stack:
  added: []
  patterns: [stream-json]
key-files:
  created: [src/api/export.js]
  modified: [src/routes/index.js]
key-decisions:
  - Stream JSON for large exports (no in-memory aggregation)
patterns-established:
  - export endpoints return chunked NDJSON
requirements-completed:
  - REQ-05
duration: 45m
completed: 2026-05-19
---

# Summary

Export to JSON with streaming.
`
);

section('4. verifyMilestoneComplete now PASSES');
const ver2 = milestone.verifyMilestoneComplete(roadmapContent, found.phases, sandbox);
ok('ver2 ok after completion', ver2.ok === true);
for (const r of ver2.reports) {
  ok(`phase ${r.phaseNum} verified complete`,
    r.ok === true,
    `done=${r.plansDone}/${r.plansTotal} missingSummaries=${r.summariesMissing.join(',') || '(none)'}`);
}

section('5. readSummaries + aggregateSummaries');
const sums = milestone.readSummaries(found.phases, sandbox);
ok('read 4 SUMMARY files (03-01, 03-02, 3.1-01, 04-01)', sums.length === 4, `got ${sums.length}`);
const agg = milestone.aggregateSummaries(sums);
ok('aggregator unions subsystems',
  JSON.stringify(agg.subsystems.sort()) === JSON.stringify(['export', 'sharing']),
  `got ${JSON.stringify(agg.subsystems)}`);
ok('aggregator unions tech-stack.added (drops empties)',
  agg.techAdded.includes('@scure/randomid') && agg.techAdded.includes('node-cron'),
  `got ${JSON.stringify(agg.techAdded)}`);
ok('aggregator dedupes requirements-completed',
  JSON.stringify(agg.requirementsCompleted.sort()) === JSON.stringify(['REQ-04', 'REQ-05']),
  `got ${JSON.stringify(agg.requirementsCompleted)}`);
ok('aggregator collected 4 key-decisions', agg.keyDecisions.length === 4);
ok('decisions are tagged by phase',
  agg.keyDecisions.every((d) => ['3', '3.1', '4'].includes(d.phase)),
  `phases: ${agg.keyDecisions.map((d) => d.phase).join(',')}`);
ok('aggregator collected patterns-established (4)', agg.patternsEstablished.length === 4);
ok('aggregator unions files-created',
  agg.filesCreated.includes('src/components/ShareDialog.jsx') &&
    agg.filesCreated.includes('src/jobs/purge-tokens.js') &&
    agg.filesCreated.includes('src/api/export.js'),
  `got ${JSON.stringify(agg.filesCreated)}`);
ok('aggregator unions files-modified',
  agg.filesModified.includes('prisma/schema.prisma') &&
    agg.filesModified.includes('src/routes/index.js'),
  `got ${JSON.stringify(agg.filesModified)}`);
ok('plan count == 4', agg.planCount === 4);
ok('durationSummary contains "45m"', /45m/.test(agg.durationSummary));

section('6. renderDigest produces parseable markdown');
const phaseNames = { '3': 'Sharing', '3.1': 'Token expiry hotfix', '4': 'Export' };
const digest = milestone.renderDigest('v1.1 Sharing', '2026-05-19', found.phases, agg, phaseNames);
console.log('\n--- DIGEST ---\n' + digest + '\n--- /DIGEST ---\n');
ok('digest header is GSD-shape h2', /^## v1\.1 Sharing\s+\u2014 shipped 2026-05-19$/m.test(digest));
ok('digest lists phases 3-4', /\*\*Phases:\*\* 3-4/.test(digest));
ok('digest credits decisions by phase', /\(phase 3\)/.test(digest) && /\(phase 4\)/.test(digest));
ok('digest lists files (created)', /\*\*Files \(created\):\*\* .*ShareDialog/.test(digest));

section('7. appendToMilestonesMd is additive');
const milestonesBefore = fs.readFileSync(path.join(dot, 'MILESTONES.md'), 'utf8');
const milestonesAfter = milestone.appendToMilestonesMd(milestonesBefore, digest);
ok('append preserves prior v1.0 archive entry', milestonesAfter.includes('v1.0 MVP - shipped 2026-04-01'));
ok('append adds v1.1 digest', milestonesAfter.includes('## v1.1 Sharing  \u2014 shipped 2026-05-19'));
ok('append leaves exactly one blank line between entries',
  /v1\.0 MVP[\s\S]*?\n\n## v1\.1 Sharing/.test(milestonesAfter));
fs.writeFileSync(path.join(dot, 'MILESTONES.md'), milestonesAfter);

section('8. collapseMilestoneInRoadmap');
const before = roadmapContent;
const { content: collapsed, changed } = milestone.collapseMilestoneInRoadmap(before, 'v1.1 Sharing', '2026-05-19');
ok('collapse reported change', changed === true);
ok('milestone heading wrapped in <details>',
  /<details>\s*\n<summary>\u2705 v1\.1 Sharing \(Phases 3-4\) \u2014 SHIPPED 2026-05-19<\/summary>/.test(collapsed));
ok('all 3 phase headings preserved inside <details>',
  /### Phase 3: Sharing/.test(collapsed) &&
    /### Phase 3\.1: Token expiry hotfix/.test(collapsed) &&
    /### Phase 4: Export/.test(collapsed));
ok('Milestones bullet rewritten to shipped',
  /^- \u2705 \*\*v1\.1 Sharing\*\* \u2014 Phases 3-4 \(shipped 2026-05-19\)/m.test(collapsed));
ok('original v1.0 details block still present',
  /### \u2705 v1\.0 MVP/.test(collapsed) && /### Phase 1: Foundation/.test(collapsed));

// Confirm v1.1's `### Phase N` blocks survived byte-for-byte in their
// content lines (heading through last `- [ ]` bullet). Boundary creep into
// `<details>`/`</details>` and `## Progress` after collapse is expected, not
// corruption.
function phaseContentLines(content, num) {
  const p = roadmap.listPhases(content).find((x) => x.num === num);
  if (!p) return null;
  const block = content.slice(p.blockStart, p.blockEnd);
  const lines = block.split(/\r?\n/);
  const out = [];
  let sawHeading = false;
  for (const ln of lines) {
    if (!sawHeading) {
      out.push(ln);
      if (/^###\s+Phase\s+/.test(ln)) sawHeading = true;
      continue;
    }
    if (/^<\/?details/.test(ln)) break;
    if (/^<summary/.test(ln)) break;
    if (/^###\s+/.test(ln)) break;
    if (/^##\s+/.test(ln)) break;
    out.push(ln);
  }
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out.join('\n');
}
for (const num of ['3', '3.1', '4']) {
  ok(`Phase ${num} content lines preserved after collapse`,
    phaseContentLines(before, num) === phaseContentLines(collapsed, num),
    'content drift detected');
}
// And the v1.0 blocks must also be untouched
for (const num of ['1', '2']) {
  ok(`Phase ${num} content lines preserved after collapse (untouched milestone)`,
    phaseContentLines(before, num) === phaseContentLines(collapsed, num));
}

fs.writeFileSync(path.join(dot, 'ROADMAP.md'), collapsed);

section('9. Re-verification after writeback');
// after collapse, GSD should still see all 5 phase blocks
const reparsed = roadmap.listPhases(collapsed);
ok('all 5 phase blocks still discoverable after collapse', reparsed.length === 5,
  `got ${reparsed.length}: ${reparsed.map((p) => p.num).join(',')}`);
ok('Phase 3 is fully done in collapsed roadmap',
  reparsed.find((p) => p.num === '3').plans.every((pl) => pl.done));

section('10. cp doctor still parses the post-shipping state');
const docOut = execFileSync('node', [CP, 'doctor'], { cwd: sandbox, encoding: 'utf8' });
ok('doctor still reports cp-aware', /cp-aware config:\s+\u2713/.test(docOut));
ok('doctor counts phase dirs >= 3', /phase dirs:\s+[3-9]/.test(docOut));

// summary
console.log(`\n----------------------------------------`);
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('\nFAILURES:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log('\nAll complete-milestone dry-run checks passed.');
  console.log(`Inspect the post-shipping fixture at: ${sandbox}`);
}
