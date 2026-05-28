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

  await ta('runAutonomous walks all pending phases via runPhase stub', async () => {
    const dir = mkFixture({
      phases: [
        { num: '1', name: 'A', plans: [{ id: '01-01', done: false }] },
        { num: '2', name: 'B', plans: [{ id: '02-01', done: false }, { id: '02-02', done: false }] },
      ],
    });
    try {
      const calls = [];
      const r = await autonomous.runAutonomous(dir, {
        runPhase: async (p, wf) => { calls.push(`${p}/${wf}`); },
        skipTests: true,
        skipAudit: true,
      });
      assert.equal(r.ok, true);
      assert.equal(r.stopped, false);
      assert.deepEqual(calls, ['1/dev', '2/dev']);
      assert.equal(r.phasesProcessed.length, 2);
      assert.equal(r.workflow, 'dev');
    } finally { rm(dir); }
  });

  await ta('runAutonomous honors opts.workflow override', async () => {
    const dir = mkFixture({
      phases: [
        { num: '1', name: 'A', plans: [{ id: '01-01', done: false }] },
      ],
    });
    try {
      const calls = [];
      const r = await autonomous.runAutonomous(dir, {
        workflow: 'quick',
        runPhase: async (p, wf) => { calls.push(`${p}/${wf}`); },
        skipTests: true,
        skipAudit: true,
      });
      assert.equal(r.ok, true);
      assert.deepEqual(calls, ['1/quick']);
      assert.equal(r.workflow, 'quick');
    } finally { rm(dir); }
  });

  await ta('runAutonomous stops on runner error and writes .continue-here.md', async () => {
    const dir = mkFixture({
      phases: [
        { num: '1', name: 'A', plans: [{ id: '01-01', done: false }] },
        { num: '2', name: 'B', plans: [{ id: '02-01', done: false }] },
      ],
    });
    try {
      const r = await autonomous.runAutonomous(dir, {
        runPhase: async (p) => {
          if (p === '2') throw new Error('synthetic runner failure');
        },
        skipTests: true,
        skipAudit: true,
      });
      assert.equal(r.ok, false);
      assert.equal(r.stopped, true);
      assert.equal(r.stopReason, 'phase-failed');
      assert.equal(r.failedPhase, '2');
      const continueHerePath = path.join(dir, '.planning', '.continue-here.md');
      assert.ok(fs.existsSync(continueHerePath));
      const body = fs.readFileSync(continueHerePath, 'utf8');
      assert.match(body, /Stopped at: phase 2/);
      assert.match(body, /Reason: phase-failed/);
    } finally { rm(dir); }
  });

  await ta('runAutonomous hard-errors with missing-runner when callback absent', async () => {
    const dir = mkFixture();
    try {
      const r = await autonomous.runAutonomous(dir, {
        skipTests: true, skipAudit: true,
      });
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'missing-runner');
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
        runPhase: async (p) => { calls.push(p); },
        skipTests: true,
        skipAudit: true,
      });
      assert.equal(r.ok, true);
      assert.deepEqual(calls, ['2', '3']);
    } finally { rm(dir); }
  });

  await ta('runAutonomous skips already-fully-done phases mid-loop', async () => {
    const dir = mkFixture({
      phases: [
        { num: '1', name: 'A', plans: [{ id: '01-01', done: false }] },
        { num: '2', name: 'B', plans: [{ id: '02-01', done: true }] },
        { num: '3', name: 'C', plans: [{ id: '03-01', done: false }] },
      ],
    });
    try {
      const calls = [];
      const r = await autonomous.runAutonomous(dir, {
        runPhase: async (p) => { calls.push(p); },
        skipTests: true,
        skipAudit: true,
      });
      assert.equal(r.ok, true);
      assert.deepEqual(calls, ['1', '3']);
    } finally { rm(dir); }
  });

  await ta('writeContinueHere captures position and reason verbatim', () => {
    const dir = mkFixture();
    try {
      const p = autonomous.writeContinueHere(dir, {
        failedPhase: '7',
        reason: 'test-failure',
        details: 'FAIL test/foo.js > should pass',
      });
      const body = fs.readFileSync(p, 'utf8');
      assert.match(body, /phase 7/);
      assert.match(body, /Reason: test-failure/);
      assert.match(body, /FAIL test\/foo\.js/);
    } finally { rm(dir); }
  });

  // ---------- 51-05: smart-gate parity ----------

  await ta('smart gate: testCommand pass — phase completes normally', async () => {
    const dir = mkFixture({
      phases: [{ num: '1', name: 'A', plans: [{ id: '01-01', done: false }] }],
    });
    try {
      const calls = [];
      const r = await autonomous.runAutonomous(dir, {
        runPhase: async (p) => { calls.push(p); },
        testCommand: process.platform === 'win32' ? 'cmd /c exit 0' : 'true',
        skipAudit: true,
      });
      assert.equal(r.ok, true);
      assert.equal(r.stopped, false);
      assert.deepEqual(calls, ['1']);
    } finally { rm(dir); }
  });

  await ta('smart gate: testCommand fail — stops with test-failure + .continue-here.md', async () => {
    const dir = mkFixture({
      phases: [
        { num: '1', name: 'A', plans: [{ id: '01-01', done: false }] },
        { num: '2', name: 'B', plans: [{ id: '02-01', done: false }] },
      ],
    });
    try {
      const calls = [];
      const r = await autonomous.runAutonomous(dir, {
        runPhase: async (p) => { calls.push(p); },
        testCommand: process.platform === 'win32' ? 'cmd /c exit 1' : 'false',
        skipAudit: true,
      });
      assert.equal(r.ok, false);
      assert.equal(r.stopped, true);
      assert.equal(r.stopReason, 'test-failure');
      assert.equal(r.failedPhase, '1');
      // Smart gate fires AFTER phase 1 runs but BEFORE phase 2 starts.
      assert.deepEqual(calls, ['1']);
      const ch = path.join(dir, '.planning', '.continue-here.md');
      assert.ok(fs.existsSync(ch));
      assert.match(fs.readFileSync(ch, 'utf8'), /Reason: test-failure/);
    } finally { rm(dir); }
  });

  await ta('smart gate: skipTests bypasses testCommand entirely', async () => {
    const dir = mkFixture({
      phases: [{ num: '1', name: 'A', plans: [{ id: '01-01', done: false }] }],
    });
    try {
      const r = await autonomous.runAutonomous(dir, {
        runPhase: async () => {},
        // This command WOULD fail — but skipTests:true makes it dead code.
        testCommand: process.platform === 'win32' ? 'cmd /c exit 99' : 'false',
        skipTests: true,
        skipAudit: true,
      });
      assert.equal(r.ok, true);
      assert.equal(r.stopped, false);
    } finally { rm(dir); }
  });

  await ta('smart gate: runTests returns skipped when no test command + no package.json', () => {
    const dir = mkFixture();
    try {
      const r = autonomous.runTests(dir);
      assert.equal(r.ok, true);
      assert.equal(r.skipped, true);
      assert.equal(r.reason, 'no-test-command');
    } finally { rm(dir); }
  });

  await ta('smart gate: runTests honors opts.testCommand on failure', () => {
    const dir = mkFixture();
    try {
      const r = autonomous.runTests(dir, {
        testCommand: process.platform === 'win32' ? 'cmd /c exit 1' : 'false',
      });
      assert.equal(r.ok, false);
      assert.ok(typeof r.output === 'string');
    } finally { rm(dir); }
  });

  await ta('smart gate: runAuditGate on a no-planning-issues fixture returns ok=true', () => {
    const dir = mkFixture();
    try {
      const r = autonomous.runAuditGate(dir);
      // No HIGH findings expected for a synthetic in-progress fixture.
      assert.equal(r.ok, true);
      assert.equal(typeof r.high, 'number');
      assert.equal(typeof r.medium, 'number');
      assert.equal(typeof r.low, 'number');
      assert.ok(Array.isArray(r.findings));
    } finally { rm(dir); }
  });

  await ta('smart gate: test gate fires per phase (not once per run)', async () => {
    const dir = mkFixture({
      phases: [
        { num: '1', name: 'A', plans: [{ id: '01-01', done: false }] },
        { num: '2', name: 'B', plans: [{ id: '02-01', done: false }] },
        { num: '3', name: 'C', plans: [{ id: '03-01', done: false }] },
      ],
    });
    try {
      // Count testCommand invocations via a marker file.
      const marker = path.join(dir, 'tests-ran.log');
      const cmd = process.platform === 'win32'
        ? `cmd /c echo ran>>"${marker}"`
        : `sh -c 'echo ran >> ${marker}'`;
      const r = await autonomous.runAutonomous(dir, {
        runPhase: async () => {},
        testCommand: cmd,
        skipAudit: true,
      });
      assert.equal(r.ok, true);
      const ranLines = fs.readFileSync(marker, 'utf8').split(/\r?\n/).filter(Boolean);
      assert.equal(ranLines.length, 3, `expected 3 test runs, got ${ranLines.length}`);
    } finally { rm(dir); }
  });

  // ---------- 51-05: scope/argv parity for `cp autonomous` CLI ----------
  //
  // These shell out via execSync so we exercise the actual argv parser
  // in bin/commands/autonomous.js. We use --check (dry-run mode) so
  // nothing mutates the fixture beyond reading roadmap state.

  const cpBin = path.resolve(__dirname, '..', 'bin', 'cp.js');

  function runCp(dir, args) {
    try {
      const out = execSync(`node "${cpBin}" autonomous ${args}`, {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { code: 0, stdout: out, stderr: '' };
    } catch (e) {
      return {
        code: e.status || 1,
        stdout: (e.stdout || '').toString(),
        stderr: (e.stderr || '').toString(),
      };
    }
  }

  await ta('argv: --check exits 0 or 1 (1 when phases pending) and prints phasesWouldRun', () => {
    const dir = mkFixture();
    try {
      const r = runCp(dir, '--check');
      // Exit code is 1 when phases pending, 0 when none. Either is OK.
      assert.ok(r.code === 0 || r.code === 1, `unexpected code ${r.code}: ${r.stderr}`);
      assert.match(r.stdout, /phasesWouldRun|phase\(s\) would run|Phases:/i);
    } finally { rm(dir); }
  });

  await ta('argv: --check --workflow=quick echoes the workflow choice', () => {
    const dir = mkFixture();
    try {
      const r = runCp(dir, '--check --workflow=quick');
      assert.ok(r.code === 0 || r.code === 1, `unexpected code ${r.code}: ${r.stderr}`);
      assert.match(r.stdout + r.stderr, /Workflow:\s*quick/i);
    } finally { rm(dir); }
  });

  await ta('argv: --check defaults to workflow=dev when no flag passed', () => {
    const dir = mkFixture();
    try {
      const r = runCp(dir, '--check');
      assert.ok(r.code === 0 || r.code === 1, `unexpected code ${r.code}: ${r.stderr}`);
      assert.match(r.stdout + r.stderr, /Workflow:\s*dev/i);
    } finally { rm(dir); }
  });

  await ta('argv: invalid scope returns non-zero exit', () => {
    const dir = mkFixture();
    try {
      const r = runCp(dir, '--check totally-bogus-scope');
      assert.notEqual(r.code, 0);
    } finally { rm(dir); }
  });

  await ta('argv: --help mentions --workflow + --check + scope', () => {
    const dir = mkFixture();
    try {
      const r = runCp(dir, '--help');
      // --help usually exits 0; tolerate either 0 or 2.
      assert.ok(r.code === 0 || r.code === 2);
      const text = r.stdout + r.stderr;
      assert.match(text, /--workflow/i);
      assert.match(text, /--check/i);
    } finally { rm(dir); }
  });

  // ---------- 51-05: cp-quick skill contract parity ----------
  //
  // cp-quick is a skill (no bin/quick.js), but the template + skill
  // markdown form a contract. Verify the v1.2 DESIGN.md + STATE.md
  // shape exists and the legacy quick-PLAN.md is gone.

  await ta('quick contract: quick-DESIGN.md template ships with expected sections', () => {
    const tpl = path.resolve(__dirname, '..', 'templates', 'quick-DESIGN.md');
    assert.ok(fs.existsSync(tpl), 'templates/quick-DESIGN.md missing');
    const body = fs.readFileSync(tpl, 'utf8');
    assert.match(body, /^---/, 'frontmatter');
    assert.match(body, /slug:\s*\{\{SLUG\}\}/);
    assert.match(body, /type:\s*quick/);
    assert.match(body, /## Goal/);
    assert.match(body, /## Approach/);
    assert.match(body, /## Done When/);
  });

  await ta('quick contract: quick-STATE.md template ships with expected sections', () => {
    const tpl = path.resolve(__dirname, '..', 'templates', 'quick-STATE.md');
    assert.ok(fs.existsSync(tpl), 'templates/quick-STATE.md missing');
    const body = fs.readFileSync(tpl, 'utf8');
    assert.match(body, /type:\s*quick/);
    assert.match(body, /## Current Status/);
    assert.match(body, /## Last Activity/);
  });

  await ta('quick contract: legacy quick-PLAN.md is GONE (51-02)', () => {
    const tpl = path.resolve(__dirname, '..', 'templates', 'quick-PLAN.md');
    assert.equal(fs.existsSync(tpl), false,
      'templates/quick-PLAN.md should have been removed in 51-02');
  });

  await ta('quick contract: cp-quick skill delegates to cp run quick (v1.4) and avoids quick-PLAN.md', () => {
    const skillPath = path.resolve(__dirname, '..', 'commands', 'cp', 'quick.md');
    assert.ok(fs.existsSync(skillPath));
    const body = fs.readFileSync(skillPath, 'utf8');
    // v1.4: thin wrapper delegates to the quick workflow; DESIGN/STATE
    // scaffolding is the workflow's job, not the wrapper's.
    assert.match(body, /cp run quick/);
    assert.equal(/templates\/quick-PLAN\.md/.test(body), false,
      'cp-quick skill still references quick-PLAN.md');
  });

  await ta('quick contract: cp-plan-phase is marked deprecated in frontmatter (51-04)', () => {
    const skillPath = path.resolve(__dirname, '..', 'commands', 'cp', 'plan-phase.md');
    assert.ok(fs.existsSync(skillPath));
    const body = fs.readFileSync(skillPath, 'utf8');
    assert.match(body, /deprecated:\s*true/);
    assert.match(body, /\/cp-autonomous/, 'should nudge users at /cp-autonomous');
  });

  // ---------- 51-05: quick tier (lib/custom.js) parity ----------

  await ta('quick parity: createRun writes to .planning/quick/ not .planning/custom/', () => {
    const custom = require('../lib/custom');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-q-parity-'));
    try {
      const slug = custom.createRun('debug', 'parity test', {
        projectDir: dir, now: new Date('2026-05-25T10:00:00.000Z'),
      });
      assert.ok(fs.existsSync(path.join(dir, '.planning', 'quick', slug)));
      assert.equal(fs.existsSync(path.join(dir, '.planning', 'custom', slug)), false);
    } finally { rm(dir); }
  });

  await ta('quick parity: legacy .planning/custom/ slug remains readable (51-03 back-compat)', () => {
    const custom = require('../lib/custom');
    const yaml = require('yaml');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-q-parity-'));
    try {
      custom._resetDeprecationWarning();
      const legacySlug = '2026-05-24-legacy';
      const legacyDir = path.join(dir, '.planning', 'custom', legacySlug);
      fs.mkdirSync(legacyDir, { recursive: true });
      fs.writeFileSync(path.join(legacyDir, 'STATE.yaml'), yaml.stringify({
        workflow: 'debug', slug: legacySlug, status: 'in-progress',
        started: '2026-05-24T15:30:00.000Z',
        last_activity: '2026-05-24T15:30:00.000Z',
      }));
      const state = custom.readState(legacySlug, { projectDir: dir });
      assert.equal(state.slug, legacySlug);
      assert.equal(state.workflow, 'debug');
    } finally { rm(dir); }
  });

  console.log(`unit-autonomous: ${passed} passed`);
  process.exit(0);
})().catch((e) => {
  console.error('unit-autonomous FAILED:', e);
  process.exit(1);
});
