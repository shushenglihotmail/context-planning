'use strict';

/**
 * Unit tests for lib/autonomous.js — the cp autonomous orchestrator.
 *
 * Pure unit tests: fixture repos + stubbed planPhase / executePhase
 * callbacks. No live cp execution, no agent reasoning. Target: ≥15
 * assertions per the v0.10 spec.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execSync } = require('node:child_process');

const autonomous = require('../lib/autonomous');

let passed = 0;
function t(name, fn) {
  fn();
  console.log('  ✓', name);
  passed++;
}

async function ta(name, fn) {
  await fn();
  console.log('  ✓', name);
  passed++;
}

console.log('unit-autonomous');

// ---------- fixture builder ----------

function mkFixture(opts = {}) {
  const {
    milestoneName = 'v0.1 Test',
    phases = [
      { num: '1', name: 'First', plans: [{ id: '01-01', done: false }] },
      { num: '2', name: 'Second', plans: [{ id: '02-01', done: false }, { id: '02-02', done: false }] },
      { num: '3', name: 'Third', plans: [{ id: '03-01', done: false }] },
    ],
    inProgress = true,
  } = opts;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-auto-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email cp@test', { cwd: dir });
  execSync('git config user.name cp-test', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });

  const planning = path.join(dir, '.planning');
  fs.mkdirSync(planning, { recursive: true });

  // ROADMAP.md
  const heading = inProgress
    ? `### 🚧 ${milestoneName} (In Progress)\n\n`
    : `### 📋 ${milestoneName} (Planned)\n\n`;
  let roadmap = `# Roadmap\n\n## Phases\n\n${heading}`;
  for (const ph of phases) {
    roadmap += `### Phase ${ph.num}: ${ph.name}\n\nPlans:\n`;
    for (const pl of ph.plans) {
      roadmap += `- [${pl.done ? 'x' : ' '}] ${pl.id}: stub\n`;
    }
    roadmap += '\n';
    // Create the phase dir with a filled PLAN.md so loop doesn't trip on stub
    const phDir = path.join(planning, 'phases', `${String(ph.num).padStart(2, '0')}-${ph.name.toLowerCase().replace(/\s+/g, '-')}`);
    fs.mkdirSync(phDir, { recursive: true });
    fs.writeFileSync(
      path.join(phDir, 'PLAN.md'),
      `# Phase ${ph.num}: ${ph.name}\n\nReal plan content (non-stub).\n\n## Plans\n\n${ph.plans.map((pl) => `- [${pl.done ? 'x' : ' '}] ${pl.id}: real`).join('\n')}\n`,
    );
  }
  roadmap += '## Progress\n\n';
  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), roadmap);

  // STATE.md
  const firstPending = phases.find((p) => p.plans.some((pl) => !pl.done));
  const state = [
    '# STATE',
    `Milestone: ${milestoneName}`,
    `Phase: ${firstPending ? firstPending.num : '-'}`,
    `Plan: ${firstPending && firstPending.plans.find((p) => !p.done) ? firstPending.plans.find((p) => !p.done).id : '-'}`,
    `Status: ${firstPending ? 'In progress' : 'Idle'}`,
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(planning, 'STATE.md'), state);

  return dir;
}

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- scope parser ----------

t('parseScope: default (undefined) → milestone', () => {
  assert.deepEqual(autonomous.parseScope(undefined), { kind: 'milestone' });
});

t('parseScope: "milestone" → milestone', () => {
  assert.deepEqual(autonomous.parseScope('milestone'), { kind: 'milestone' });
});

t('parseScope: "phase" → phase', () => {
  assert.deepEqual(autonomous.parseScope('phase'), { kind: 'phase' });
});

t('parseScope: "3" → count 3', () => {
  assert.deepEqual(autonomous.parseScope('3'), { kind: 'count', n: 3 });
});

t('parseScope: "2-5" → range 2..5', () => {
  assert.deepEqual(autonomous.parseScope('2-5'), { kind: 'range', from: '2', to: '5' });
});

t('parseScope: "1.5-3" → range with decimal', () => {
  assert.deepEqual(autonomous.parseScope('1.5-3'), { kind: 'range', from: '1.5', to: '3' });
});

t('parseScope: invalid input throws', () => {
  assert.throws(() => autonomous.parseScope('bogus'), /invalid-scope/);
  assert.throws(() => autonomous.parseScope('0'), /invalid-scope/);
});

// ---------- start resolver ----------

t('resolveStart: auto-detect from STATE.md when in-progress', () => {
  const dir = mkFixture();
  try {
    const r = autonomous.resolveStart(dir, undefined);
    assert.equal(r.phase, '1');
    assert.equal(r.milestoneName, 'v0.1 Test');
  } finally { rm(dir); }
});

t('resolveStart: phase number arg overrides auto-detect', () => {
  const dir = mkFixture();
  try {
    const r = autonomous.resolveStart(dir, '2');
    assert.equal(r.phase, '2');
  } finally { rm(dir); }
});

t('resolveStart: milestone name arg resolves to first pending phase', () => {
  const dir = mkFixture();
  try {
    const r = autonomous.resolveStart(dir, 'v0.1 Test');
    assert.equal(r.phase, '1');
    assert.equal(r.milestoneName, 'v0.1 Test');
  } finally { rm(dir); }
});

t('resolveStart: missing milestone throws with milestone-not-found', () => {
  const dir = mkFixture();
  try {
    let thrown = null;
    try { autonomous.resolveStart(dir, 'v9.9 Nope'); } catch (e) { thrown = e; }
    assert.ok(thrown);
    assert.equal(thrown.reason, 'milestone-not-found');
  } finally { rm(dir); }
});

// ---------- phase list resolution + milestone cap ----------

t('resolvePhases: scope=milestone returns all from START onward', () => {
  const dir = mkFixture();
  try {
    const r = autonomous.resolvePhases(dir, '1', { kind: 'milestone' }, 'v0.1 Test');
    assert.deepEqual(r.phases, ['1', '2', '3']);
  } finally { rm(dir); }
});

t('resolvePhases: scope=count clamps to milestone end (1-50 in 3-phase milestone)', () => {
  const dir = mkFixture();
  try {
    const r = autonomous.resolvePhases(dir, '1', { kind: 'count', n: 50 }, 'v0.1 Test');
    assert.deepEqual(r.phases, ['1', '2', '3']);
  } finally { rm(dir); }
});

t('resolvePhases: scope=range trims out-of-milestone "to" silently', () => {
  const dir = mkFixture();
  try {
    const r = autonomous.resolvePhases(dir, '1', { kind: 'range', from: '2', to: '99' }, 'v0.1 Test');
    assert.deepEqual(r.phases, ['2', '3']);
  } finally { rm(dir); }
});

// ---------- runAutonomous dry-run ----------

(async () => {
  await ta('runAutonomous dry-run reports phasesWouldRun + totalPlans', async () => {
    const dir = mkFixture();
    try {
      const r = await autonomous.runAutonomous(dir, {
        dryRun: true,
        skipTests: true,
        skipAudit: true,
      });
      assert.equal(r.ok, true);
      assert.equal(r.dryRun, true);
      assert.deepEqual(r.phasesWouldRun, ['1', '2', '3']);
      assert.equal(r.totalPlans, 4);
    } finally { rm(dir); }
  });

  await ta('runAutonomous dry-run skips already-done plans', async () => {
    const dir = mkFixture({
      phases: [
        { num: '1', name: 'A', plans: [{ id: '01-01', done: true }] },
        { num: '2', name: 'B', plans: [{ id: '02-01', done: false }] },
      ],
    });
    try {
      const r = await autonomous.runAutonomous(dir, {
        dryRun: true, skipTests: true, skipAudit: true,
      });
      // Phase 1 has zero pending plans → should not appear in phasesWouldRun
      assert.deepEqual(r.phasesWouldRun, ['2']);
      assert.equal(r.totalPlans, 1);
    } finally { rm(dir); }
  });

  // ---------- runAutonomous real loop (stubbed callbacks) ----------

  await ta('runAutonomous walks all pending plans via executePhase stub', async () => {
    const dir = mkFixture({
      phases: [
        { num: '1', name: 'A', plans: [{ id: '01-01', done: false }] },
        { num: '2', name: 'B', plans: [{ id: '02-01', done: false }, { id: '02-02', done: false }] },
      ],
    });
    try {
      const calls = [];
      const r = await autonomous.runAutonomous(dir, {
        executePhase: async (p, plan) => { calls.push(`${p}/${plan}`); },
        skipTests: true,
        skipAudit: true,
      });
      assert.equal(r.ok, true);
      assert.equal(r.stopped, false);
      assert.deepEqual(calls, ['1/01-01', '2/02-01', '2/02-02']);
      assert.equal(r.phasesProcessed.length, 2);
    } finally { rm(dir); }
  });

  await ta('runAutonomous stops on executor deviation and writes .continue-here.md', async () => {
    const dir = mkFixture({
      phases: [
        { num: '1', name: 'A', plans: [{ id: '01-01', done: false }] },
        { num: '2', name: 'B', plans: [{ id: '02-01', done: false }] },
      ],
    });
    try {
      const r = await autonomous.runAutonomous(dir, {
        executePhase: async (p, plan) => {
          if (plan === '02-01') throw new Error('synthetic executor deviation');
        },
        skipTests: true,
        skipAudit: true,
      });
      assert.equal(r.ok, false);
      assert.equal(r.stopped, true);
      assert.equal(r.stopReason, 'deviation');
      assert.equal(r.failedPhase, '2');
      assert.equal(r.failedPlan, '02-01');
      const continueHerePath = path.join(dir, '.planning', '.continue-here.md');
      assert.ok(fs.existsSync(continueHerePath));
      const body = fs.readFileSync(continueHerePath, 'utf8');
      assert.match(body, /Stopped at: phase 2, plan 02-01/);
      assert.match(body, /Reason: deviation/);
    } finally { rm(dir); }
  });

  await ta('runAutonomous hard-errors with missing-executor when callback absent', async () => {
    const dir = mkFixture();
    try {
      const r = await autonomous.runAutonomous(dir, {
        skipTests: true, skipAudit: true,
      });
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'missing-executor');
    } finally { rm(dir); }
  });

  await ta('runAutonomous returns invalid-scope reason for bad scope value', async () => {
    const dir = mkFixture();
    try {
      const r = await autonomous.runAutonomous(dir, {
        scope: 'totally-bogus',
        skipTests: true, skipAudit: true,
      });
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'invalid-scope');
    } finally { rm(dir); }
  });

  await ta('runAutonomous range scope honored end-to-end', async () => {
    const dir = mkFixture({
      phases: [
        { num: '1', name: 'A', plans: [{ id: '01-01', done: false }] },
        { num: '2', name: 'B', plans: [{ id: '02-01', done: false }] },
        { num: '3', name: 'C', plans: [{ id: '03-01', done: false }] },
        { num: '4', name: 'D', plans: [{ id: '04-01', done: false }] },
      ],
    });
    try {
      const calls = [];
      const r = await autonomous.runAutonomous(dir, {
        scope: '2-3',
        executePhase: async (p, plan) => { calls.push(`${p}/${plan}`); },
        skipTests: true,
        skipAudit: true,
      });
      assert.equal(r.ok, true);
      assert.deepEqual(calls, ['2/02-01', '3/03-01']);
    } finally { rm(dir); }
  });

  await ta('writeContinueHere captures position and reason verbatim', () => {
    const dir = mkFixture();
    try {
      const p = autonomous.writeContinueHere(dir, {
        failedPhase: '7',
        failedPlan: '07-02',
        reason: 'test-failure',
        details: 'FAIL test/foo.js > should pass',
      });
      const body = fs.readFileSync(p, 'utf8');
      assert.match(body, /phase 7, plan 07-02/);
      assert.match(body, /Reason: test-failure/);
      assert.match(body, /FAIL test\/foo\.js/);
    } finally { rm(dir); }
  });

  console.log(`unit-autonomous: ${passed} passed`);
  process.exit(0);
})().catch((e) => {
  console.error('unit-autonomous FAILED:', e);
  process.exit(1);
});
