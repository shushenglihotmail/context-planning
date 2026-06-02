'use strict';

/**
 * v0.8 Phase 25 (P8) — `cp audit --fix` orchestrator.
 *
 * Classifies findings emitted by `lib/audit.runAudit` into:
 *   - auto:    a registered fixer can apply the repair
 *   - manual:  the user must act (we surface a suggestion)
 *   - skip:    severity filter excludes this finding
 *
 * Applies up to `--max N` auto-fixes (default 5) with one atomic git
 * commit per fix. Stops the loop on the first fixer error.
 *
 * Pluggable: phase 26 (reconcile/supersede/deviate) will append fixer
 * entries to FIXERS without touching the orchestrator.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const state = require('./state');
const lifecycle = require('./lifecycle');
const reconcile = require('./reconcile');
const compat = require('./gsd-compat');

// ---------- fixer registry ----------

const FIXERS = {
  // `cp state regen` — rewrites the derived block.
  'state-stale': function (root, finding) {
    const r = state.regenerate(root, { quiet: true });
    if (!r || r.action === 'skipped') {
      throw new Error(`state.regenerate skipped: ${r && r.reason}`);
    }
    return { changedPaths: ['.planning/STATE.md'], detail: 'STATE.md regenerated' };
  },
  // tick the plan that has a SUMMARY but no [x].
  'summary-without-tick': function (root, finding) {
    if (!finding.planId) throw new Error('summary-without-tick: missing planId on finding');
    const r = lifecycle.tickPlan(root, finding.planId);
    if (!r.roadmapChanged && !r.planChanged) {
      throw new Error(`tickPlan was a no-op for ${finding.planId} — was it already ticked?`);
    }
    const paths = [];
    for (const a of r.actions) paths.push(a.path);
    return { changedPaths: paths, detail: `ticked plan ${finding.planId}` };
  },
  // v0.8 P10: reconcile-backed SHA backfill.
  'missing-base-commit': function (root, finding) {
    const r = reconcile.reconcileFinding(root, finding, {});
    if (r.action === 'unresolvable') {
      throw new Error(r.detail);
    }
    if (r.action === 'already-set' || !r.changedPaths.length) {
      throw new Error(`base-commit already set on phase ${finding.phaseNum}`);
    }
    return { changedPaths: r.changedPaths, detail: r.detail };
  },
  'missing-end-commit': function (root, finding) {
    const r = reconcile.reconcileFinding(root, finding, {});
    if (r.action === 'unresolvable') {
      throw new Error(r.detail);
    }
    if (r.action === 'already-set' || !r.changedPaths.length) {
      throw new Error(`end-commit already set on ${finding.planId}`);
    }
    return { changedPaths: r.changedPaths, detail: r.detail };
  },
};

// ---------- classification ----------

const SEV_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function _passesSeverityFilter(finding, sev) {
  if (!sev || sev === 'all') return true;
  const cap = String(sev).toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(SEV_RANK, cap)) return true;
  return SEV_RANK[finding.severity] <= SEV_RANK[cap];
}

function _manualSuggestion(finding) {
  if (finding.fix) return finding.fix;
  return `review .planning manually for ${finding.id}`;
}

function classify(findings, opts = {}) {
  const { severity = 'all' } = opts;
  const out = { auto: [], manual: [], skip: [] };
  for (const f of findings) {
    if (!_passesSeverityFilter(f, severity)) { out.skip.push(f); continue; }
    if (FIXERS[f.id]) out.auto.push(f);
    else out.manual.push({ finding: f, suggestion: _manualSuggestion(f) });
  }
  return out;
}

// ---------- application loop ----------

/**
 * Apply auto-fixers up to `max` times. One atomic commit per success.
 * Stops on the first fixer error. Never proceeds past `max`.
 *
 * Returns { applied: [{finding, commit, detail}], failed: [{finding, error}], stopped }
 * where `stopped` is true if we halted because of an error.
 */
function applyFixes(root, autoFindings, opts = {}) {
  const { max = 5, dryRun = false } = opts;
  const applied = [];
  const failed = [];
  let stopped = false;
  for (const f of autoFindings) {
    if (applied.length >= max) break;
    const fixer = FIXERS[f.id];
    if (!fixer) {
      failed.push({ finding: f, error: 'no fixer registered (internal)' });
      stopped = true;
      break;
    }
    if (dryRun) {
      applied.push({ finding: f, commit: null, dryRun: true, detail: 'would fix' });
      continue;
    }
    let res;
    try { res = fixer(root, f); } catch (err) {
      failed.push({ finding: f, error: err.message });
      stopped = true;
      break;
    }
    // Atomic commit per fix.
    let commitHash = null;
    try {
      const subject = `cp(audit-fix): ${f.id} ${f.location || ''}`.trim();
      commitHash = lifecycle.gitCommit(root, subject, { paths: res.changedPaths });
    } catch (err) {
      failed.push({ finding: f, error: `commit failed: ${err.message}` });
      stopped = true;
      break;
    }
    applied.push({ finding: f, commit: commitHash, detail: res.detail });
  }
  return { applied, failed, stopped };
}

// ---------- reporting ----------

function summarize(applied, manual, failed) {
  return {
    applied: applied.length,
    manual: manual.length,
    failed: failed.length,
    stopped: failed.length > 0,
  };
}

// ---------- dual-plan fixer (Bug D) ----------

/**
 * For each phase that has BOTH a short-form PLAN.md AND one or more long-form
 * {NN-MM}-...-PLAN.md files, keep the larger file (by byte count; mtime-newer
 * on tie) and move the others to `.planning/.archive/<phase-id>/<ts>-<name>`.
 *
 * Idempotent: phases with only one form → no-op. Returns a summary object.
 */
function fixDualPlan(root) {
  const phases = compat.scanPhases(root);
  const archiveBase = path.join(root, '.planning', '.archive');
  const archived = [];

  for (const phase of phases) {
    if (!phase.hasShortPlan || phase.planFiles.length === 0) continue;

    const shortFormPath = path.join(phase.path, 'PLAN.md');
    const allCandidates = [
      { filepath: shortFormPath, name: 'PLAN.md' },
      ...phase.planFiles.map((f) => ({ filepath: path.join(phase.path, f), name: f })),
    ];

    // Stat all candidates.
    for (const c of allCandidates) {
      const st = fs.statSync(c.filepath);
      c.size = st.size;
      c.mtime = st.mtimeMs;
    }

    // Winner: largest file; on exact size tie, most-recently modified.
    let winner = allCandidates[0];
    for (const c of allCandidates.slice(1)) {
      if (c.size > winner.size || (c.size === winner.size && c.mtime > winner.mtime)) {
        winner = c;
      }
    }

    const phaseId = path.basename(phase.path);
    const archiveDir = path.join(archiveBase, phaseId);

    for (const c of allCandidates) {
      if (c.filepath === winner.filepath) continue;
      fs.mkdirSync(archiveDir, { recursive: true });
      const ts = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
      const dest = path.join(archiveDir, `${ts}-${c.name}`);
      fs.renameSync(c.filepath, dest);
      archived.push({ from: c.filepath, to: dest });
    }
  }

  return { archived, action: archived.length > 0 ? 'fixed' : 'skipped' };
}

module.exports = {
  FIXERS,
  classify,
  applyFixes,
  summarize,
  fixDualPlan,
  _passesSeverityFilter,
  _manualSuggestion,
};
