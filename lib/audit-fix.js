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

const { execSync } = require('child_process');

const state = require('./state');
const lifecycle = require('./lifecycle');
const reconcile = require('./reconcile');

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

module.exports = {
  FIXERS,
  classify,
  applyFixes,
  summarize,
  _passesSeverityFilter,
  _manualSuggestion,
};
