'use strict';

/**
 * STATE.md helpers. STATE.md is intentionally tiny (<100 lines). We only need:
 *   - read / write
 *   - update "Current Position" block
 *   - update "Session Continuity" block
 *   - update progress bar
 *   - append to "Recent Decisions"
 *
 * v0.8 P4 (Phase 20): `deriveState()` + `regenerate()` make STATE.md's
 * "Current Position" + "Progress" sections derived output. User-curated
 * sections (Decisions, Todos, Blockers, Quick Tasks, Session Continuity)
 * are preserved verbatim.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function write(p, content) {
  fs.writeFileSync(p, content);
}

function progressBar(percent) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round(pct / 10);
  return '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + '] ' + pct + '%';
}

/**
 * Replace a labeled line inside a section. Lines have the shape:
 *   `Label: value`
 */
function replaceLineInSection(content, sectionHeading, label, newValue) {
  const sectionRe = new RegExp(
    `(^${escapeRegex(sectionHeading)}\\s*\\n[\\s\\S]*?)(^${escapeRegex(
      label
    )}:[^\\n]*$)`,
    'm'
  );
  const replaced = content.replace(
    sectionRe,
    (_m, pre) => `${pre}${label}: ${newValue}`
  );
  return replaced;
}

function updatePosition(content, { phase, plan, status, lastActivity, date }) {
  let next = content;
  if (phase !== undefined)
    next = replaceLineInSection(next, '## Current Position', 'Phase', phase);
  if (plan !== undefined)
    next = replaceLineInSection(next, '## Current Position', 'Plan', plan);
  if (status !== undefined)
    next = replaceLineInSection(next, '## Current Position', 'Status', status);
  if (lastActivity !== undefined)
    next = replaceLineInSection(
      next,
      '## Current Position',
      'Last activity',
      `${date || new Date().toISOString().slice(0, 10)} — ${lastActivity}`
    );
  return next;
}

function updateProgressBar(content, percent) {
  const bar = progressBar(percent);
  return content.replace(/^Progress:\s+.*$/m, `Progress: ${bar}`);
}

function updateSessionContinuity(content, { date, stoppedAt, resumeFile }) {
  let next = content;
  if (date !== undefined)
    next = replaceLineInSection(next, '## Session Continuity', 'Last session', date);
  if (stoppedAt !== undefined)
    next = replaceLineInSection(next, '## Session Continuity', 'Stopped at', stoppedAt);
  if (resumeFile !== undefined)
    next = replaceLineInSection(next, '## Session Continuity', 'Resume file', resumeFile);
  return next;
}

function appendRecentDecision(content, decision) {
  // Insert as the FIRST bullet under "### Recent Decisions"
  const re = /(### Recent Decisions\s*\n+(?:<!--[^>]*?-->\s*\n*)?)/;
  if (!re.test(content)) return content;
  return content.replace(re, (m) => `${m}- ${decision}\n`);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- v0.8 P4 (Phase 20): derived STATE.md ----------

/**
 * Derive the canonical "Current Position" struct from ROADMAP.md + phase
 * dirs. Pure function (no writes). Returns:
 *   {
 *     phase: number|string|null,    // active phase number (e.g. 20 or "2.1")
 *     plan: string|null,            // next unticked plan id (e.g. "20-01")
 *     status: string,               // 'Ready to execute' | 'Ready to write summary' | 'Phase complete' | 'idle' | 'no-roadmap'
 *     currentFocus: string|null,    // active phase name
 *     progressPercent: number,      // 0-100 across active milestone
 *     totalPlans: number,
 *     donePlans: number,
 *     lastActivity: string|null,    // most recent `cp: ...` commit subject, or null
 *     activeMilestone: string|null, // milestone name
 *   }
 *
 * @param {string} root - project root (contains .planning/)
 */
function deriveState(root) {
  // Lazy-require to avoid circular dep at module load time. lib/lifecycle.js
  // requires state; state requires lifecycle's statusReport. Defer until call.
  const lifecycle = require('./lifecycle');
  let status;
  try {
    status = lifecycle.statusReport(root);
  } catch (err) {
    return {
      phase: null, plan: null, status: 'no-roadmap', currentFocus: null,
      progressPercent: 0, totalPlans: 0, donePlans: 0,
      lastActivity: null, activeMilestone: null,
    };
  }
  if (!status || !status.ok) {
    return {
      phase: null, plan: null, status: 'no-roadmap', currentFocus: null,
      progressPercent: 0, totalPlans: 0, donePlans: 0,
      lastActivity: null, activeMilestone: null,
    };
  }

  const totalPlans = status.phases.reduce((acc, p) => acc + p.total, 0);
  const donePlans = status.phases.reduce((acc, p) => acc + p.done, 0);
  let progressPercent = totalPlans === 0
    ? 0
    : Math.round((donePlans / totalPlans) * 100);

  let phaseNum = null;
  let planId = null;
  let currentFocus = null;
  let derivedStatus;
  if (status.nextPlan) {
    phaseNum = status.nextPlan.phaseNum;
    planId = status.nextPlan.planId;
    currentFocus = status.nextPlan.phaseName;
    derivedStatus = 'Ready to execute';
  } else if (!status.milestone) {
    // No in-progress milestone — project is between milestones.
    derivedStatus = 'Idle';
    progressPercent = 0;
  } else if (status.phases.length === 0) {
    derivedStatus = 'Idle';
    progressPercent = 0;
  } else {
    // All plans ticked. Check for missing SUMMARYs.
    const lastPhase = status.phases[status.phases.length - 1];
    phaseNum = lastPhase.num;
    currentFocus = lastPhase.name;
    const phaseDir = lastPhase.num != null
      ? require('./paths').findPhaseDir(String(lastPhase.num), root)
      : null;
    let missingSummary = false;
    if (phaseDir) {
      // Read plan IDs from ROADMAP (filenames in phase dir vary across
      // scaffold styles — relying on ROADMAP is the source of truth).
      try {
        const roadmapPath = path.join(root, '.planning', 'ROADMAP.md');
        const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
        const allPhases = require('./roadmap').listPhases(roadmapContent);
        const target = allPhases.find((p) => String(p.num) === String(lastPhase.num));
        if (target) {
          for (const pl of target.plans) {
            const summaryPath = path.join(phaseDir, `${pl.id}-SUMMARY.md`);
            if (!fs.existsSync(summaryPath)) { missingSummary = true; break; }
          }
        }
      } catch (_) { /* fall through */ }
    }
    derivedStatus = missingSummary ? 'Ready to write summary' : 'Phase complete';
  }

  const lastActivity = _readLastCpCommit(root);

  return {
    phase: phaseNum,
    plan: planId,
    status: derivedStatus,
    currentFocus,
    progressPercent,
    totalPlans,
    donePlans,
    lastActivity,
    activeMilestone: status.milestone,
  };
}

/**
 * Read the most recent `cp: ...` commit subject from `git log`. Returns
 * null when git is unavailable, no commits match, or the repo has no
 * commits yet.
 */
function _readLastCpCommit(root) {
  let result;
  try {
    result = spawnSync('git', ['log', '-1', '--grep=^cp:', '--format=%s', 'HEAD'], {
      cwd: root, encoding: 'utf8',
    });
  } catch (_) { return null; }
  if (!result || result.status !== 0) return null;
  const subject = String(result.stdout || '').trim();
  if (!subject) return null;
  // Strip the leading "cp: " or "cp(NN-MM): " prefix to get the message.
  return subject.replace(/^cp(\([^)]*\))?:\s*/, '');
}

/**
 * Split STATE.md content into:
 *   - derivedTail: everything from "## Current Position" through the
 *     "Progress: [...]" line (the parts we'll rewrite)
 *   - preamble: everything before "## Current Position"
 *   - curatedTail: everything after the "Progress: [...]" line
 *
 * Robust to: missing sections, blank-line variants, Progress line being
 * the last line in the file.
 *
 * If no `## Current Position` header found, returns
 *   { preamble: '', derivedBlock: '', curatedTail: content }
 * so regenerate can prepend a fresh derived block.
 */
function _splitState(content) {
  const cpIdx = content.search(/^##\s+Current Position\s*$/m);
  if (cpIdx === -1) {
    return { preamble: '', derivedBlock: '', curatedTail: content };
  }
  // Walk to end of Progress: line (or end of file if absent).
  const after = content.slice(cpIdx);
  const progIdx = after.search(/^Progress:[^\n]*$/m);
  let derivedEndAbs;
  if (progIdx === -1) {
    // No progress line — derived block ends at next H2 (or EOF).
    const nextH2 = after.slice(2).search(/^##\s+/m);
    derivedEndAbs = nextH2 === -1 ? content.length : cpIdx + 2 + nextH2;
  } else {
    // End of Progress line = newline after it (or EOF).
    const lineEnd = after.indexOf('\n', progIdx);
    derivedEndAbs = lineEnd === -1 ? content.length : cpIdx + lineEnd + 1;
  }
  return {
    preamble: content.slice(0, cpIdx),
    derivedBlock: content.slice(cpIdx, derivedEndAbs),
    curatedTail: content.slice(derivedEndAbs),
  };
}

/**
 * Render the derived block ("## Current Position" + Progress line).
 */
function _renderDerivedBlock(derived) {
  const phaseLine = derived.phase != null
    ? `Phase: ${derived.phase}${derived.activeMilestone ? ` (${derived.activeMilestone})` : ''}`
    : 'Phase: -';
  const planLine = derived.plan
    ? `Plan: ${derived.plan}`
    : (derived.totalPlans > 0
      ? `Plan: ${derived.donePlans} of ${derived.totalPlans}`
      : 'Plan: -');
  const focusLine = derived.currentFocus
    ? `Current focus: ${derived.currentFocus}`
    : 'Current focus: -';
  const lastActLine = derived.lastActivity
    ? `Last activity: ${derived.lastActivity}`
    : 'Last activity: -';
  const bar = progressBar(derived.progressPercent);
  return [
    '## Current Position',
    '',
    phaseLine,
    planLine,
    `Status: ${derived.status}`,
    focusLine,
    lastActLine,
    '',
    `Progress: ${bar}`,
    '',
  ].join('\n');
}

/**
 * Regenerate STATE.md: rewrite the derived block from `deriveState(root)`
 * and preserve all curated sections verbatim.
 *
 * Returns:
 *   { action: 'rewritten' | 'unchanged' | 'skipped', reason?: string, derived?: object }
 *
 * Options:
 *   - dryRun: boolean (returns derived + composed content without writing)
 *   - quiet:  boolean (suppress stderr notice on 'unchanged')
 *
 * Never throws on derivation failure — returns { action: 'skipped', reason }.
 */
function regenerate(root, opts = {}) {
  const { dryRun = false } = opts;
  let derived;
  try {
    derived = deriveState(root);
  } catch (err) {
    return { action: 'skipped', reason: `derive-failed: ${err.message}` };
  }
  if (!derived) return { action: 'skipped', reason: 'derive-null' };
  if (derived.status === 'no-roadmap') {
    return { action: 'skipped', reason: 'no-roadmap', derived };
  }
  const statePath = path.join(root, '.planning', 'STATE.md');
  const exists = fs.existsSync(statePath);
  const before = exists ? fs.readFileSync(statePath, 'utf8') : null;

  let composed;
  let preservedLastActivity = null;
  if (!exists || !before) {
    // Scaffold a minimal STATE.md with just the derived block. Curated
    // tail comes from template defaults if present.
    composed = '# Project State\n\n' + _renderDerivedBlock(derived);
  } else {
    const { preamble, derivedBlock, curatedTail } = _splitState(before);
    // Preserve the existing "Last activity:" line when we have nothing to
    // derive (e.g. no `cp:` commit yet). Other callers like completeMilestone
    // explicitly call updatePosition to set a context-specific message — we
    // honour that.
    if (!derived.lastActivity && derivedBlock) {
      const m = derivedBlock.match(/^Last activity:\s*(.+)$/m);
      if (m && m[1].trim() && m[1].trim() !== '-') {
        preservedLastActivity = m[1].trim();
      }
    }
    const renderInput = preservedLastActivity
      ? Object.assign({}, derived, { lastActivity: preservedLastActivity })
      : derived;
    const newDerivedBlock = _renderDerivedBlock(renderInput);
    if (derivedBlock === newDerivedBlock) {
      return { action: 'unchanged', derived };
    }
    // If there was no recognised derived block, prepend it after preamble.
    composed = (preamble || '# Project State\n\n') + newDerivedBlock + (curatedTail || '');
  }

  if (dryRun) return { action: 'rewritten', derived, composed, dryRun: true };
  // Atomic-write best-effort.
  const tmp = statePath + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, composed);
  fs.renameSync(tmp, statePath);
  return { action: 'rewritten', derived };
}

module.exports = {
  read,
  write,
  progressBar,
  updatePosition,
  updateProgressBar,
  updateSessionContinuity,
  appendRecentDecision,
  deriveState,
  regenerate,
  _splitState,
  _renderDerivedBlock,
  _readLastCpCommit,
};
