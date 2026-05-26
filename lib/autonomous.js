'use strict';

/**
 * cp autonomous — v1.2 orchestrator.
 *
 * Walks pending phases of the active milestone, delegating each phase
 * to a single caller-supplied `runPhase(phaseNum, workflowName)` hook.
 * The skill layer maps that to the workflow runtime
 * (`cp run resume <slug>` → agent works → `cp run mark-complete`).
 *
 * Smart-gated on test failure, audit HIGH, and runner errors; stops
 * cleanly by writing `.planning/.continue-here.md`.
 *
 * Pure orchestrator: no agent reasoning, no plan/execute logic itself.
 * The cp-autonomous skill supplies the real `runPhase` callback that
 * bridges to `cp run`. In unit tests, the callback is stubbed.
 *
 * See: .planning/phases/51-cli-shims-and-deprecate-cp-plan-phase/PLAN.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const paths = require('./paths');
const lifecycle = require('./lifecycle');
const milestone = require('./milestone');
const roadmap = require('./roadmap');
const audit = require('./audit');

// ---------- scope parsing ----------

/**
 * Parse a --scope flag value into a normalised shape.
 *
 * Returns:
 *   { kind: 'phase' }
 *   { kind: 'count', n: <number> }       // next N phases including START
 *   { kind: 'range', from: 'A', to: 'B' } // explicit range
 *   { kind: 'milestone' }                 // default
 *
 * Throws Error('invalid-scope: ...') on bad input.
 */
function parseScope(value) {
  if (value === undefined || value === null || value === '' || value === 'milestone') {
    return { kind: 'milestone' };
  }
  if (value === 'phase') return { kind: 'phase' };
  // N-M explicit range (integers or decimals like 1.5)
  const rangeMatch = String(value).match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    return { kind: 'range', from: rangeMatch[1], to: rangeMatch[2] };
  }
  // Plain integer = count
  if (/^\d+$/.test(String(value))) {
    const n = parseInt(value, 10);
    if (n < 1) throw new Error(`invalid-scope: count must be >= 1 (got "${value}")`);
    return { kind: 'count', n };
  }
  throw new Error(
    `invalid-scope: "${value}" — expected one of: phase, <N>, <N>-<M>, milestone`
  );
}

// ---------- START resolution ----------

/**
 * Resolve START to a phase number string.
 *
 * Forms:
 *   - undefined/null/'' → auto-detect from statusReport (in-progress
 *     phase, else first pending plan's phase, else null)
 *   - looks like a phase number (e.g. "32" or "1.5") → use as-is
 *   - anything else → treat as milestone name; resolve to first pending
 *     phase of that milestone
 *
 * Returns { phase, milestoneName } or throws Error with reason code.
 */
function resolveStart(root, startArg) {
  const status = lifecycle.statusReport(root);
  if (!status.ok) {
    const err = new Error(status.error || 'status report failed');
    err.reason = 'roadmap-missing';
    throw err;
  }
  // Auto-detect
  if (!startArg) {
    if (!status.milestone) {
      const err = new Error('No active milestone in ROADMAP.md');
      err.reason = 'no-active-milestone';
      throw err;
    }
    // Prefer the explicit nextPlan if present; else first pending in
    // the first phase of the milestone.
    if (status.nextPlan && status.nextPlan.phaseNum) {
      return { phase: status.nextPlan.phaseNum, milestoneName: status.milestone };
    }
    if (status.phases && status.phases.length) {
      return { phase: status.phases[0].num, milestoneName: status.milestone };
    }
    const err = new Error(`Milestone "${status.milestone}" has no phases.`);
    err.reason = 'milestone-empty';
    throw err;
  }
  // Looks like a phase number?
  if (/^\d+(?:\.\d+)?$/.test(String(startArg).trim())) {
    return { phase: String(startArg).trim(), milestoneName: null };
  }
  // Treat as milestone name.
  const roadmapPath = path.join(paths.planningDir(root), 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    const err = new Error('ROADMAP.md missing');
    err.reason = 'roadmap-missing';
    throw err;
  }
  const content = fs.readFileSync(roadmapPath, 'utf8');
  const found = milestone.findMilestoneInRoadmap(content, String(startArg));
  if (!found) {
    const err = new Error(`Milestone "${startArg}" not found in ROADMAP.md`);
    err.reason = 'milestone-not-found';
    throw err;
  }
  // First pending phase in that milestone.
  const allPhases = roadmap.listPhases(content);
  const inMilestone = allPhases.filter((p) => found.phases.includes(p.num));
  for (const ph of inMilestone) {
    if (ph.plans.some((pl) => !pl.done)) {
      return { phase: ph.num, milestoneName: found.name };
    }
  }
  const err = new Error(`Milestone "${found.name}" has no pending phases.`);
  err.reason = 'milestone-complete';
  throw err;
}

// ---------- phase list resolution ----------

/**
 * Given START phase + scope, compute the ordered list of phase numbers
 * to process. Always clamped to the active milestone's phases (hard cap).
 *
 * Returns: { phases: [...], milestoneName: '...' }
 */
function resolvePhases(root, startPhase, scope, hintMilestoneName) {
  const roadmapPath = path.join(paths.planningDir(root), 'ROADMAP.md');
  const content = fs.readFileSync(roadmapPath, 'utf8');

  // Determine which milestone the START belongs to.
  let milestoneName = hintMilestoneName;
  if (!milestoneName) {
    // Scan all milestones, find the one containing this phase.
    const phasesIdx = content.search(/^##\s+Phases\s*$/m);
    const after = phasesIdx === -1 ? content : content.slice(phasesIdx);
    const reM = /^###\s+(?!Phase\s+[\d.]+:)(.+?)$/gm;
    const candidates = [];
    let mm;
    while ((mm = reM.exec(after)) !== null) {
      const stripped = mm[1]
        .replace(/^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}\u2705\u2611\u2713\u2714\u2728]+/u, '')
        .replace(/\s*\((?:In Progress|Shipped[^)]*|Planned)\)\s*$/i, '')
        .trim();
      candidates.push(stripped);
    }
    for (const name of candidates) {
      const info = milestone.findMilestoneInRoadmap(content, name);
      if (info && info.phases.includes(String(startPhase))) {
        milestoneName = info.name;
        break;
      }
    }
  }
  if (!milestoneName) {
    const err = new Error(`Phase ${startPhase} not found in any milestone`);
    err.reason = 'phase-orphan';
    throw err;
  }
  const found = milestone.findMilestoneInRoadmap(content, milestoneName);
  if (!found) {
    const err = new Error(`Milestone "${milestoneName}" not found`);
    err.reason = 'milestone-not-found';
    throw err;
  }
  const milestonePhases = found.phases;
  const startIdx = milestonePhases.indexOf(String(startPhase));
  if (startIdx === -1) {
    const err = new Error(`Phase ${startPhase} not in milestone "${found.name}"`);
    err.reason = 'phase-out-of-milestone';
    throw err;
  }

  let selected;
  switch (scope.kind) {
    case 'phase':
      selected = [milestonePhases[startIdx]];
      break;
    case 'count':
      selected = milestonePhases.slice(startIdx, startIdx + scope.n);
      break;
    case 'range': {
      const fromIdx = milestonePhases.indexOf(scope.from);
      const toIdx = milestonePhases.indexOf(scope.to);
      if (fromIdx === -1) {
        const err = new Error(`Range start phase ${scope.from} not in milestone "${found.name}"`);
        err.reason = 'phase-out-of-milestone';
        throw err;
      }
      // toIdx may be -1 if user gave a phase beyond milestone end; clamp.
      const effectiveTo = toIdx === -1 ? milestonePhases.length - 1 : toIdx;
      if (effectiveTo < fromIdx) {
        const err = new Error(`Invalid range ${scope.from}-${scope.to}`);
        err.reason = 'invalid-range';
        throw err;
      }
      selected = milestonePhases.slice(fromIdx, effectiveTo + 1);
      break;
    }
    case 'milestone':
    default:
      selected = milestonePhases.slice(startIdx);
      break;
  }
  return { phases: selected, milestoneName: found.name };
}

// ---------- smart gates ----------

/**
 * Run the configured test command. Returns { ok, output } where output
 * is the trimmed stderr+stdout when failing.
 *
 * Test command resolution order:
 *   1. config.cp.behavior.test_command (if set)
 *   2. `npm test` if package.json present
 *   3. null → skipped (returns { ok: true, skipped: true })
 */
function runTests(root, opts = {}) {
  let cmd = opts.testCommand;
  if (!cmd) {
    try {
      const cfg = require('./config').loadConfig(root);
      cmd = cfg && cfg.cp && cfg.cp.behavior && cfg.cp.behavior.test_command;
    } catch (_) { /* config missing — fallthrough */ }
  }
  if (!cmd) {
    if (fs.existsSync(path.join(root, 'package.json'))) cmd = 'npm test';
  }
  if (!cmd) return { ok: true, skipped: true, reason: 'no-test-command' };
  try {
    const out = execSync(cmd, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, output: out.trim().split(/\r?\n/).slice(-20).join('\n') };
  } catch (e) {
    const tail = (e.stdout || '') + '\n' + (e.stderr || '');
    return { ok: false, output: tail.trim().split(/\r?\n/).slice(-30).join('\n') };
  }
}

/**
 * Run cp audit; return { ok, high, medium, low, findings } where ok
 * is false ONLY if HIGH findings exist (medium/low never trip the gate).
 */
function runAuditGate(root) {
  let result;
  try {
    result = audit.runAudit(root);
  } catch (e) {
    return { ok: false, error: e.message, high: 0, medium: 0, low: 0, findings: [] };
  }
  const sum = result.summary || { high: 0, medium: 0, low: 0 };
  return {
    ok: sum.high === 0,
    high: sum.high,
    medium: sum.medium,
    low: sum.low,
    findings: (result.findings || []).filter((f) => f.severity === 'HIGH'),
  };
}

// ---------- .continue-here.md writer ----------

function writeContinueHere(root, ctx) {
  const continuePath = path.join(paths.planningDir(root), '.continue-here.md');
  const lines = [
    '# cp autonomous — paused',
    '',
    `Stopped at: phase ${ctx.failedPhase}${ctx.failedPlan ? `, plan ${ctx.failedPlan}` : ''}`,
    `Reason: ${ctx.reason}`,
    `Time: ${new Date().toISOString()}`,
    '',
    '## Details',
    '',
    ctx.details || '(no details captured)',
    '',
    '## Next',
    '',
    '- Inspect the failure above',
    '- Fix the underlying cause',
    '- Re-run `cp autonomous` (or `/cp-resume`) — execution picks up at',
    `  phase ${ctx.failedPhase}`,
    '',
    '<!-- written by cp autonomous (lib/autonomous.js) -->',
  ];
  fs.writeFileSync(continuePath, lines.join('\n') + '\n');
  return continuePath;
}

// ---------- main orchestrator ----------

/**
 * runAutonomous — main entry point.
 *
 * opts:
 *   start: string | undefined            phase number, milestone name, or omitted
 *   scope: object | string | undefined   scope spec (raw string or parsed)
 *   workflow: string | undefined         workflow template name (default 'dev')
 *   dryRun: boolean                      preview only — return phasesWouldRun
 *   runPhase: async fn(phaseNum, workflowName) per-phase runner; required
 *                                        unless dryRun. Skill layer maps
 *                                        this to `cp run resume <slug>` +
 *                                        `cp run mark-complete <slug> <phase>`.
 *   runCompleteMilestone: async fn(name) delegated close-out for
 *                                        scope=milestone (optional; if
 *                                        omitted, we skip the close)
 *   testCommand: string                  override default test discovery
 *   skipTests, skipAudit: boolean        diagnostic flags (unit tests use)
 *
 * Returns:
 *   On success: { ok: true, scope, milestone, workflow, startPhase, phasesProcessed, stopped: false }
 *   On stop:    { ok: false, ..., stopped: true, stopReason, failedPhase, details, continueHere }
 *   On dry-run: { ok: true, dryRun: true, scope, phasesWouldRun, totalPlans, workflow }
 */
async function runAutonomous(root, opts = {}) {
  // Step 1: resolve scope + start
  let scope;
  try {
    scope = typeof opts.scope === 'object' && opts.scope !== null
      ? opts.scope
      : parseScope(opts.scope);
  } catch (e) {
    return { ok: false, reason: 'invalid-scope', message: e.message };
  }

  let start;
  try {
    start = resolveStart(root, opts.start);
  } catch (e) {
    return { ok: false, reason: e.reason || 'start-resolve-failed', message: e.message };
  }

  let phasesInfo;
  try {
    phasesInfo = resolvePhases(root, start.phase, scope, start.milestoneName);
  } catch (e) {
    return { ok: false, reason: e.reason || 'phases-resolve-failed', message: e.message };
  }

  const workflowName = opts.workflow || 'dev';

  // Step 2: dry-run path
  if (opts.dryRun) {
    const roadmapPath = path.join(paths.planningDir(root), 'ROADMAP.md');
    const content = fs.readFileSync(roadmapPath, 'utf8');
    const allPhases = roadmap.listPhases(content);
    let totalPlans = 0;
    const phasesWouldRun = [];
    for (const num of phasesInfo.phases) {
      const ph = allPhases.find((p) => p.num === num);
      if (!ph) continue;
      const pending = ph.plans.filter((pl) => !pl.done);
      if (pending.length === 0) continue;
      phasesWouldRun.push(num);
      totalPlans += pending.length;
    }
    return {
      ok: true,
      dryRun: true,
      scope: scope.kind,
      milestone: phasesInfo.milestoneName,
      workflow: workflowName,
      startPhase: start.phase,
      phasesWouldRun,
      totalPlans,
    };
  }

  // Step 3: per-phase run loop
  if (typeof opts.runPhase !== 'function') {
    return {
      ok: false,
      reason: 'missing-runner',
      message: 'opts.runPhase callback is required (skill layer supplies it).',
    };
  }

  const phasesProcessed = [];
  const roadmapPath = path.join(paths.planningDir(root), 'ROADMAP.md');

  for (const phaseNum of phasesInfo.phases) {
    const content = fs.readFileSync(roadmapPath, 'utf8');
    const allPhases = roadmap.listPhases(content);
    const ph = allPhases.find((p) => p.num === phaseNum);
    if (!ph) continue;

    // Skip phases whose plans are already all done (idempotent re-runs).
    const pending = ph.plans.filter((pl) => !pl.done);
    if (pending.length === 0) continue;

    const phaseStart = Date.now();
    try {
      await opts.runPhase(phaseNum, workflowName);
    } catch (e) {
      const continueHere = writeContinueHere(root, {
        failedPhase: phaseNum, reason: 'phase-failed', details: e.message,
      });
      return {
        ok: false, scope: scope.kind, milestone: phasesInfo.milestoneName,
        workflow: workflowName, startPhase: start.phase, phasesProcessed,
        stopped: true, stopReason: 'phase-failed', failedPhase: phaseNum,
        details: e.message, continueHere,
      };
    }

    // Smart gates fire once per phase (after the phase's commits land).
    if (!opts.skipTests) {
      const tr = runTests(root, opts);
      if (!tr.ok) {
        const continueHere = writeContinueHere(root, {
          failedPhase: phaseNum, reason: 'test-failure', details: tr.output,
        });
        return {
          ok: false, scope: scope.kind, milestone: phasesInfo.milestoneName,
          workflow: workflowName, startPhase: start.phase, phasesProcessed,
          stopped: true, stopReason: 'test-failure', failedPhase: phaseNum,
          details: tr.output, continueHere,
        };
      }
    }
    if (!opts.skipAudit) {
      const ar = runAuditGate(root);
      if (!ar.ok) {
        const details = `HIGH findings: ${ar.findings.map((f) => f.id || f.rule || '?').join(', ')}`;
        const continueHere = writeContinueHere(root, {
          failedPhase: phaseNum, reason: 'audit-high', details,
        });
        return {
          ok: false, scope: scope.kind, milestone: phasesInfo.milestoneName,
          workflow: workflowName, startPhase: start.phase, phasesProcessed,
          stopped: true, stopReason: 'audit-high', failedPhase: phaseNum,
          details, continueHere,
        };
      }
    }

    phasesProcessed.push({
      phase: phaseNum,
      status: 'done',
      durationMs: Date.now() - phaseStart,
    });
  }

  // Step 4: scope-end close-out
  if (scope.kind === 'milestone' && typeof opts.runCompleteMilestone === 'function') {
    try {
      await opts.runCompleteMilestone(phasesInfo.milestoneName);
    } catch (e) {
      return {
        ok: false, scope: scope.kind, milestone: phasesInfo.milestoneName,
        workflow: workflowName, startPhase: start.phase, phasesProcessed,
        stopped: true, stopReason: 'close-failed', details: e.message,
      };
    }
  }

  return {
    ok: true,
    scope: scope.kind,
    milestone: phasesInfo.milestoneName,
    workflow: workflowName,
    startPhase: start.phase,
    phasesProcessed,
    stopped: false,
    stopReason: null,
    continueHere: null,
  };
}

// ---------- helpers ----------

module.exports = {
  runAutonomous,
  parseScope,
  resolveStart,
  resolvePhases,
  runTests,
  runAuditGate,
  writeContinueHere,
};
