#!/usr/bin/env node
/**
 * Dry-run for /cp-resume.
 *
 * /cp-resume is a read-mostly command: its only writes are to STATE.md's
 * Session Continuity block. The bulk of its work is *picking* the right
 * source of truth among three signals (in priority order):
 *
 *   (A) .planning/.continue-here.md  — explicit handoff from a previous session
 *   (B) STATE.md Status: In progress — implicit "we're mid-work" signal
 *   (C) neither — fall through to the next pending plan in ROADMAP
 *
 * This dry-run exercises all three branches by composing fixture scenarios,
 * then runs the cp-resume "logic" inline (the same logic the command will
 * follow) and asserts the output matches.
 *
 * We deliberately do NOT exec the markdown command itself — that requires
 * a live LLM. We exercise the *deterministic* parts: branch selection,
 * STATE.md updates, ROADMAP look-ups, manual fallback prompt resolution.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const roadmap = require(path.join(REPO, 'lib', 'roadmap'));
const state = require(path.join(REPO, 'lib', 'state'));
const paths = require(path.join(REPO, 'lib', 'paths'));
const fm = require(path.join(REPO, 'lib', 'frontmatter'));
const provider = require(path.join(REPO, 'lib', 'provider'));

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
function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
function mktmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-resume-' + prefix + '-'));
}
function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

// ---------- fixture builder ----------
function baseFixture(root) {
  const dot = path.join(root, '.planning');
  fs.mkdirSync(path.join(dot, 'phases', '01-foundation'), { recursive: true });
  fs.mkdirSync(path.join(dot, 'phases', '02-sharing'), { recursive: true });

  writeFile(path.join(dot, 'PROJECT.md'), '# Project: ResumeTest\n');
  writeFile(path.join(dot, 'ROADMAP.md'),
`# Roadmap

## Phases

### Phase 1: Foundation
Plans:
- [x] 01-01: scaffold
- [x] 01-02: auth

### Phase 2: Sharing
Plans:
- [x] 02-01: share-token model
- [ ] 02-02: share UI
- [ ] 02-03: token expiry

## Progress
| Phase | Plans Complete |
|-------|----------------|
| 1     | 2/2            |
| 2     | 1/3            |
`);

  writeFile(path.join(dot, 'STATE.md'),
`# Current State

**Last Updated**: 2026-05-19

## Current Position
Phase: 2
Plan: 02-02
Status: In progress
Last activity: 2026-05-19 — paused mid-UI

## Session Continuity
Last session: 2026-05-19
Stopped at: paused mid-UI
Resume file: (none)
`);

  // PLAN.md for the mid-work plan
  writeFile(path.join(dot, 'phases', '02-sharing', '02-02-PLAN.md'),
`---
phase: 02-sharing
plan: 02
type: execute
wave: 2
depends_on:
  - 02-01
autonomous: true
requirements:
  - REQ-04
must_haves:
  truths:
    - Share UI lets owner pick recipients
  artifacts:
    - path: src/components/ShareDialog.jsx
      provides: dialog component
---

# Plan 02-02: Share UI

<task name="add ShareDialog component">
<files>src/components/ShareDialog.jsx</files>
<verify>npm run test -- ShareDialog</verify>
</task>

<task name="wire dialog to share endpoint">
<files>src/components/ShareDialog.jsx, src/api/share.js</files>
<verify>npm run test -- share</verify>
</task>
`);

  writeFile(path.join(dot, 'phases', '02-sharing', '02-01-SUMMARY.md'),
`---
phase: 02-sharing
plan: 01
subsystem: sharing
---
# Done
`);

  writeFile(path.join(dot, 'config.json'),
    JSON.stringify({
      cp: provider.loadDefaults().cp,
    }, null, 2)
  );

  return dot;
}

// ---------- core logic (mirrors what /cp-resume must do) ----------

/**
 * The deterministic branch-selection logic from /cp-resume.md, expressed in
 * code so we can test it without a live LLM. Returns:
 *   { branch: 'continue-here'|'state-in-progress'|'fallback-next-plan',
 *     phaseNum, planId, planFile, planFrontmatter, milestone, nextPlan? }
 */
function resolveResumeContext(root) {
  const dot = path.join(root, '.planning');
  const continueHere = path.join(dot, '.continue-here.md');
  const statePath = path.join(dot, 'STATE.md');
  const roadmapPath = path.join(dot, 'ROADMAP.md');

  // Branch A: .continue-here.md wins
  if (fs.existsSync(continueHere)) {
    const text = fs.readFileSync(continueHere, 'utf8');
    const stoppedAt = (text.match(/^##\s+Stopped at\s*$/m) ? matchSection(text, 'Stopped at') : null);
    const next = matchSection(text, 'Next');
    // Try to find a phase/plan reference inside the file
    const ref = text.match(/(\d+(?:\.\d+)?)-(\d{2})/);
    let phaseNum = null;
    let planId = null;
    if (ref) {
      // Normalise to ROADMAP-shape: integer phases lose leading zeros ("02"
      // -> "2"), decimal phases stay as-is ("3.1" -> "3.1").
      phaseNum = ref[1].includes('.') ? ref[1] : String(parseInt(ref[1], 10));
      planId = ref[0];
    }
    const planFile = planId && phaseNum ? findPlanFile(root, phaseNum, planId) : null;
    return {
      branch: 'continue-here',
      phaseNum,
      planId,
      planFile,
      planFrontmatter: planFile ? fm.parse(fs.readFileSync(planFile, 'utf8')).frontmatter : null,
      stoppedAt,
      nextHint: next,
    };
  }

  // Branch B: STATE.md says In progress
  const stateText = fs.readFileSync(statePath, 'utf8');
  const status = stateText.match(/^Status:\s*(.+)$/m);
  if (status && /in\s*progress/i.test(status[1])) {
    const phase = stateText.match(/^Phase:\s*(.+)$/m);
    const plan = stateText.match(/^Plan:\s*(.+)$/m);
    const lastActivity = stateText.match(/^Last activity:\s*(.+)$/m);
    const phaseNum = phase ? phase[1].trim() : null;
    const planId = plan ? plan[1].trim() : null;
    const planFile = planId && phaseNum ? findPlanFile(root, phaseNum, planId) : null;
    return {
      branch: 'state-in-progress',
      phaseNum,
      planId,
      planFile,
      planFrontmatter: planFile ? fm.parse(fs.readFileSync(planFile, 'utf8')).frontmatter : null,
      stoppedAt: lastActivity ? lastActivity[1] : null,
    };
  }

  // Branch C: nothing in progress — find next pending plan in ROADMAP
  const rmContent = fs.readFileSync(roadmapPath, 'utf8');
  const phases = roadmap.listPhases(rmContent);
  for (const p of phases) {
    const pending = p.plans.find((pl) => !pl.done);
    if (pending) {
      return {
        branch: 'fallback-next-plan',
        phaseNum: p.num,
        planId: pending.id,
        planFile: findPlanFile(root, p.num, pending.id),
        nextPlan: { phase: p.num, plan: pending.id, desc: pending.desc },
      };
    }
  }
  return { branch: 'fallback-next-plan', phaseNum: null, planId: null, planFile: null };
}

function findPlanFile(root, phaseNum, planId) {
  const dir = paths.findPhaseDir(phaseNum, root);
  if (!dir) return null;
  const candidate = path.join(dir, `${planId}-PLAN.md`);
  return fs.existsSync(candidate) ? candidate : null;
}

function matchSection(text, heading) {
  const re = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'm');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ---------- tests ----------

const created = [];
function track(root) { created.push(root); return root; }

try {
  section('Branch A: .continue-here.md is the source of truth');
  {
    const root = track(mktmp('A'));
    baseFixture(root);
    writeFile(path.join(root, '.planning', '.continue-here.md'),
`# Continue Here

## Stopped at
mid-ShareDialog 02-02 — recipient list rendering broken

## Next
- finish ShareDialog recipient autocomplete
- wire it into 02-02-PLAN's second task

## Context
- branch: feat/share-ui
- last failing test: ShareDialog renders recipients
`);

    const ctx = resolveResumeContext(root);
    ok('branch is continue-here', ctx.branch === 'continue-here', ctx.branch);
    ok('phase number extracted from continue-here', ctx.phaseNum === '2', ctx.phaseNum);
    ok('plan id extracted from continue-here', ctx.planId === '02-02', ctx.planId);
    ok('plan file located', ctx.planFile && fs.existsSync(ctx.planFile));
    ok('plan frontmatter parsed', ctx.planFrontmatter && ctx.planFrontmatter.phase === '02-sharing');
    ok('plan frontmatter preserved autonomous flag', ctx.planFrontmatter && ctx.planFrontmatter.autonomous === true);
    ok('plan frontmatter preserved depends_on', Array.isArray(ctx.planFrontmatter && ctx.planFrontmatter.depends_on));
    ok('stoppedAt captured from continue-here',
      ctx.stoppedAt && /recipient list/.test(ctx.stoppedAt), ctx.stoppedAt);
    ok('nextHint captured from continue-here',
      ctx.nextHint && /autocomplete/.test(ctx.nextHint), ctx.nextHint);
  }

  section('Branch B: STATE.md Status: In progress');
  {
    const root = track(mktmp('B'));
    baseFixture(root);
    // no continue-here.md — STATE.md alone should drive
    const ctx = resolveResumeContext(root);
    ok('branch is state-in-progress', ctx.branch === 'state-in-progress', ctx.branch);
    ok('phase from STATE.md', ctx.phaseNum === '2');
    ok('plan from STATE.md', ctx.planId === '02-02');
    ok('plan file located via STATE.md', ctx.planFile && /02-02-PLAN\.md$/.test(ctx.planFile));
    ok('plan frontmatter parses',
      ctx.planFrontmatter && (ctx.planFrontmatter.plan === '02' || ctx.planFrontmatter.plan === 2),
      JSON.stringify(ctx.planFrontmatter && ctx.planFrontmatter.plan));
    ok('stoppedAt captured from STATE.md Last activity',
      ctx.stoppedAt && /paused mid-UI/.test(ctx.stoppedAt), ctx.stoppedAt);
  }

  section('Branch C: nothing in progress -> next pending plan');
  {
    const root = track(mktmp('C'));
    baseFixture(root);
    // Mark current work done, so STATE doesn't say "In progress" anymore
    let st = fs.readFileSync(path.join(root, '.planning', 'STATE.md'), 'utf8');
    st = st.replace('Status: In progress', 'Status: Idle');
    fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), st);

    // Also mark 02-02 done in ROADMAP so next pending is 02-03
    let rm = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
    rm = rm.replace('- [ ] 02-02: share UI', '- [x] 02-02: share UI');
    fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), rm);

    const ctx = resolveResumeContext(root);
    ok('branch is fallback-next-plan', ctx.branch === 'fallback-next-plan', ctx.branch);
    ok('next pending plan picked from ROADMAP', ctx.planId === '02-03', ctx.planId);
    ok('next pending phase is 2', ctx.phaseNum === '2', ctx.phaseNum);
    ok('nextPlan.desc carries the ROADMAP description',
      ctx.nextPlan && /token expiry/.test(ctx.nextPlan.desc), ctx.nextPlan && ctx.nextPlan.desc);
    ok('no plan file yet (not created)', ctx.planFile === null);
  }

  section('STATE.md Session Continuity update (only allowed write)');
  {
    const root = track(mktmp('D'));
    baseFixture(root);
    const statePath = path.join(root, '.planning', 'STATE.md');
    const before = fs.readFileSync(statePath, 'utf8');

    // The command's only allowed write: update Session Continuity
    let next = state.updateSessionContinuity(before, {
      date: '2026-05-25',
      stoppedAt: 'mid-recipient-autocomplete',
      resumeFile: '.planning/.continue-here.md',
    });
    fs.writeFileSync(statePath, next);

    const after = fs.readFileSync(statePath, 'utf8');
    ok('Last session line updated', /Last session: 2026-05-25/.test(after));
    ok('Stopped at line updated', /Stopped at: mid-recipient-autocomplete/.test(after));
    ok('Resume file line updated', /Resume file: \.planning\/\.continue-here\.md/.test(after));

    // Critical: must NOT touch Current Position
    ok('Current Position Phase unchanged', /Phase: 2/.test(after));
    ok('Current Position Plan unchanged', /Plan: 02-02/.test(after));
    ok('Current Position Status unchanged', /Status: In progress/.test(after));

    // Critical: every other section preserved byte-for-byte except Session Continuity
    const beforeOther = before.split('## Session Continuity')[0];
    const afterOther = after.split('## Session Continuity')[0];
    ok('Everything above Session Continuity is byte-identical', beforeOther === afterOther);
  }

  section('Workspace verification surface');
  {
    const root = track(mktmp('E'));
    baseFixture(root);
    // Simulate uncommitted work by writing a stray file
    writeFile(path.join(root, 'src', 'components', 'ShareDialog.jsx'),
`export function ShareDialog() { return null; }
`);
    // The command surfaces git status; we just check the file exists so the
    // command HAS something to surface.
    ok('uncommitted file exists for git status to find',
      fs.existsSync(path.join(root, 'src', 'components', 'ShareDialog.jsx')));

    // Verify the depends_on cross-check (02-02 depends on 02-01)
    const planText = fs.readFileSync(
      path.join(root, '.planning', 'phases', '02-sharing', '02-02-PLAN.md'),
      'utf8'
    );
    const planFm = fm.parse(planText).frontmatter;
    ok('depends_on declares 02-01', planFm.depends_on.includes('02-01'));

    const rmText = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
    const phases = roadmap.listPhases(rmText);
    const phase2 = phases.find((p) => p.num === '2');
    const dep = phase2.plans.find((pl) => pl.id === '02-01');
    ok('02-01 dependency is ticked in ROADMAP', dep && dep.done === true);
  }

  section('Manual-provider prompts are wired and resolvable');
  {
    const root = track(mktmp('F'));
    baseFixture(root);
    const oldCwd = process.cwd();
    process.chdir(root);
    try {
      const cfg = provider.loadConfig(root);
      ok('manual provider exists', !!(cfg.cp && cfg.cp.providers && cfg.cp.providers.manual));
      const manual = cfg.cp.providers.manual;
      ok('manual.detect.always === true', manual.detect && manual.detect.always === true);
      const roles = ['brainstorm', 'plan', 'execute', 'review', 'finish', 'tdd', 'debug', 'verify'];
      for (const r of roles) {
        const p = provider.resolvePrompt(r, root);
        ok(`manual prompt for ${r} present`, typeof p === 'string' && p.length > 40);
      }
      // Resolve a role end-to-end: superpowers must NOT be detected so we
      // fall back to manual. existsAnywhere() probes ~/.claude, ~/.copilot, ...
      // for sentinels, so sandbox the host via os.homedir monkey-patch (the
      // dev machine may have a real Superpowers install).
      const realHomedir = os.homedir;
      const tmpHome = track(mktmp('F-home'));
      let res;
      try {
        os.homedir = () => tmpHome;
        res = provider.resolveSkill('plan', root);
      } finally {
        os.homedir = realHomedir;
      }
      ok('plan role falls back when superpowers not installed',
        res.fallback === true && res.name === 'manual', JSON.stringify(res));
      ok('plan role still names a skill', typeof res.skill === 'string');
    } finally {
      process.chdir(oldCwd);
    }
  }

  console.log(`\nPassed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log('  - ' + f);
    process.exitCode = 1;
  } else {
    console.log('All resume dry-run checks passed.');
  }
} finally {
  for (const d of created) {
    try { rmrf(d); } catch { /* best effort */ }
  }
}
