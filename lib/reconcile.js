'use strict';

/**
 * lib/reconcile.js — v0.8 Phase 26 (P10).
 *
 * Repair operations for drift detected by `cp audit`. Each operation is a
 * pure function returning `{ changedPaths, detail }` or throws on failure.
 * Callers (CLI wrapper, audit-fix FIXERS) commit the result atomically.
 *
 * Operations:
 *   inferBaseCommit(root, phaseNum)        — write base-commit into PLAN.md
 *   inferEndCommit(root, planId)           — write end-commit into SUMMARY.md
 *   acceptExpectedKeyFiles(root, planId)   — rewrite PLAN.md expected-key-files
 *                                            from a SUMMARY's actual key-files
 *   reconcileFinding(root, finding, opts)  — dispatch on finding.id
 *
 * All operations short-circuit on dry-run and surface what would change.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const fm = require('./frontmatter');
const paths = require('./paths');

// ---------- shared helpers ----------

function _readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; }
}

function _findPhaseDir(root, phaseNum) {
  const phasesRoot = path.join(paths.planningDir(root), 'phases');
  if (!fs.existsSync(phasesRoot)) return null;
  const want = String(phaseNum).replace(/^0+(?=\d)/, '');
  for (const e of fs.readdirSync(phasesRoot, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const m = e.name.match(/^(\d+(?:\.\d+)?)-/);
    if (!m) continue;
    const num = m[1].replace(/^0+(?=\d)/, '');
    if (num === want) return path.join(phasesRoot, e.name);
  }
  return null;
}

function _parsePhaseFromPlanId(planId) {
  const m = String(planId || '').match(/^(\d+(?:\.\d+)?)-(\d+)$/);
  if (!m) return null;
  return { phaseNum: m[1], planSeq: m[2] };
}

// ---------- git inference ----------

/**
 * Find the first commit in the repo whose message starts with `cp(NN-MM):`
 * for any plan in the given phase. Returns full SHA or null.
 *
 * Strategy: grep the git log for the phase prefix; take the oldest match.
 * Falls back to first commit touching the phase directory.
 */
function _firstPhaseCommit(root, phaseNum) {
  const want = String(phaseNum).replace(/^0+(?=\d)/, '');
  // Generic match: any cp(NN-MM): or cp(NN): commit, then post-filter by phase.
  let r = spawnSync(
    'git',
    ['log', '--reverse', '--format=%H%x09%s', '--grep=^cp\\(', '--extended-regexp'],
    { cwd: root, encoding: 'utf8' }
  );
  if (!r.error && r.status === 0) {
    const lines = String(r.stdout || '').split('\n').filter(Boolean);
    for (const line of lines) {
      const tab = line.indexOf('\t');
      if (tab === -1) continue;
      const sha = line.slice(0, tab);
      const subject = line.slice(tab + 1);
      const m = subject.match(/^cp\(([0-9]+(?:\.[0-9]+)?)(?:-[0-9]+)?\):/);
      if (!m) continue;
      const num = m[1].replace(/^0+(?=\d)/, '');
      if (num === want) return sha.trim();
    }
  }

  // Fallback: first commit touching the phase dir
  const phaseDir = _findPhaseDir(root, phaseNum);
  if (!phaseDir) return null;
  const rel = path.relative(root, phaseDir).split(path.sep).join('/');
  r = spawnSync(
    'git',
    ['log', '--reverse', '--format=%H', '--', rel],
    { cwd: root, encoding: 'utf8' }
  );
  if (r.error || r.status !== 0) return null;
  const lines = String(r.stdout || '').split('\n').filter(Boolean);
  return lines.length > 0 ? lines[0].trim() : null;
}

/**
 * For end-commit on a plan: find the last commit whose message starts with
 * `cp(NN-MM):` for that plan. Fallback to last commit touching the plan's
 * SUMMARY.md.
 */
function _lastPlanCommit(root, planId) {
  const parsed = _parsePhaseFromPlanId(planId);
  if (!parsed) return null;
  const wantPhase = parsed.phaseNum.replace(/^0+(?=\d)/, '');
  const wantSeq = parsed.planSeq.replace(/^0+(?=\d)/, '');
  let r = spawnSync(
    'git',
    ['log', '--format=%H%x09%s', '--grep=^cp\\(', '--extended-regexp'],
    { cwd: root, encoding: 'utf8' }
  );
  if (!r.error && r.status === 0) {
    const lines = String(r.stdout || '').split('\n').filter(Boolean);
    for (const line of lines) {
      const tab = line.indexOf('\t');
      if (tab === -1) continue;
      const sha = line.slice(0, tab);
      const subject = line.slice(tab + 1);
      const m = subject.match(/^cp\(([0-9]+(?:\.[0-9]+)?)-([0-9]+)\):/);
      if (!m) continue;
      const phaseNorm = m[1].replace(/^0+(?=\d)/, '');
      const seqNorm = m[2].replace(/^0+(?=\d)/, '');
      if (phaseNorm === wantPhase && seqNorm === wantSeq) return sha.trim();
    }
  }
  // Fallback: last commit touching the summary file
  const phaseDir = _findPhaseDir(root, parsed.phaseNum);
  if (!phaseDir) return null;
  const summaryRel = path.relative(
    root,
    path.join(phaseDir, `${planId}-SUMMARY.md`)
  ).split(path.sep).join('/');
  r = spawnSync(
    'git',
    ['log', '-n', '1', '--format=%H', '--', summaryRel],
    { cwd: root, encoding: 'utf8' }
  );
  if (r.error || r.status !== 0) return null;
  const line = String(r.stdout || '').trim();
  return line || null;
}

function _escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- write helpers ----------

function _writePlanFrontmatterField(planPath, key, value) {
  const raw = fs.readFileSync(planPath, 'utf8');
  const parsed = fm.parse(raw);
  const fmObj = { ...(parsed.frontmatter || {}) };
  fmObj[key] = value;
  // Preserve insertion order roughly: rebuild dump.
  const next = fm.stringify(fmObj, parsed.body);
  fs.writeFileSync(planPath, next);
}

// ---------- operations ----------

/**
 * Infer & write base-commit to PLAN.md frontmatter.
 *
 * Returns { changedPaths, detail, sha, action }.
 *   action: 'written' | 'already-set' | 'unresolvable'
 *
 * In dry-run: returns the same shape with action='would-write' and no write.
 */
function inferBaseCommit(root, phaseNum, opts = {}) {
  const { dryRun = false } = opts;
  const phaseDir = _findPhaseDir(root, phaseNum);
  if (!phaseDir) throw new Error(`reconcile: phase ${phaseNum} not found`);
  const planPath = path.join(phaseDir, 'PLAN.md');
  if (!fs.existsSync(planPath)) {
    throw new Error(`reconcile: phase ${phaseNum} has no PLAN.md`);
  }
  const raw = fs.readFileSync(planPath, 'utf8');
  let parsed;
  try { parsed = fm.parse(raw); } catch (_) { parsed = { frontmatter: {}, body: raw }; }
  const fmObj = parsed.frontmatter || {};
  if (fmObj['base-commit']) {
    return {
      changedPaths: [],
      detail: `base-commit already set on phase ${phaseNum}`,
      sha: String(fmObj['base-commit']).trim(),
      action: 'already-set',
    };
  }
  const sha = _firstPhaseCommit(root, phaseNum);
  if (!sha) {
    return {
      changedPaths: [],
      detail: `could not infer base-commit for phase ${phaseNum} (no matching cp(${phaseNum}-*) commits and no history touching phase dir)`,
      sha: null,
      action: 'unresolvable',
    };
  }
  if (dryRun) {
    return {
      changedPaths: [path.relative(root, planPath)],
      detail: `would write base-commit=${sha.slice(0, 12)} to phase ${phaseNum} PLAN.md`,
      sha,
      action: 'would-write',
    };
  }
  _writePlanFrontmatterField(planPath, 'base-commit', sha);
  return {
    changedPaths: [path.relative(root, planPath).split(path.sep).join('/')],
    detail: `wrote base-commit=${sha.slice(0, 12)} to phase ${phaseNum} PLAN.md`,
    sha,
    action: 'written',
  };
}

/**
 * Infer & write end-commit to a plan's SUMMARY.md frontmatter.
 *
 * Returns { changedPaths, detail, sha, action }.
 */
function inferEndCommit(root, planId, opts = {}) {
  const { dryRun = false } = opts;
  const parsed = _parsePhaseFromPlanId(planId);
  if (!parsed) throw new Error(`reconcile: invalid plan id "${planId}"`);
  const phaseDir = _findPhaseDir(root, parsed.phaseNum);
  if (!phaseDir) throw new Error(`reconcile: phase ${parsed.phaseNum} not found`);
  const summaryPath = path.join(phaseDir, `${planId}-SUMMARY.md`);
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`reconcile: SUMMARY for ${planId} not found`);
  }
  const raw = fs.readFileSync(summaryPath, 'utf8');
  let p;
  try { p = fm.parse(raw); } catch (_) { p = { frontmatter: {}, body: raw }; }
  const fmObj = p.frontmatter || {};
  if (fmObj['end-commit']) {
    return {
      changedPaths: [],
      detail: `end-commit already set on ${planId}`,
      sha: String(fmObj['end-commit']).trim(),
      action: 'already-set',
    };
  }
  const sha = _lastPlanCommit(root, planId);
  if (!sha) {
    return {
      changedPaths: [],
      detail: `could not infer end-commit for ${planId}`,
      sha: null,
      action: 'unresolvable',
    };
  }
  if (dryRun) {
    return {
      changedPaths: [path.relative(root, summaryPath)],
      detail: `would write end-commit=${sha.slice(0, 12)} to ${planId} SUMMARY`,
      sha,
      action: 'would-write',
    };
  }
  fmObj['end-commit'] = sha;
  const next = fm.stringify(fmObj, p.body);
  fs.writeFileSync(summaryPath, next);
  return {
    changedPaths: [path.relative(root, summaryPath).split(path.sep).join('/')],
    detail: `wrote end-commit=${sha.slice(0, 12)} to ${planId} SUMMARY`,
    sha,
    action: 'written',
  };
}

/**
 * Rewrite PLAN.md expected-key-files for a plan from the actual key-files
 * in its SUMMARY.md. Destructive — only call with explicit --accept.
 *
 * Behavior: merges (replaces) the plan's slot in `expected-key-files`
 * (preserving entries for other plans in the same PLAN). If the
 * `expected-key-files` field was a flat array, it is promoted to an object
 * shape `{ planId: [...] }`.
 */
function acceptExpectedKeyFiles(root, planId, opts = {}) {
  const { dryRun = false } = opts;
  const parsed = _parsePhaseFromPlanId(planId);
  if (!parsed) throw new Error(`reconcile: invalid plan id "${planId}"`);
  const phaseDir = _findPhaseDir(root, parsed.phaseNum);
  if (!phaseDir) throw new Error(`reconcile: phase ${parsed.phaseNum} not found`);
  const planPath = path.join(phaseDir, 'PLAN.md');
  const summaryPath = path.join(phaseDir, `${planId}-SUMMARY.md`);
  if (!fs.existsSync(planPath)) throw new Error(`reconcile: PLAN.md not found`);
  if (!fs.existsSync(summaryPath)) throw new Error(`reconcile: SUMMARY for ${planId} not found`);

  const sumParsed = fm.parse(fs.readFileSync(summaryPath, 'utf8'));
  const sumFm = sumParsed.frontmatter || {};
  const kf = sumFm['key-files'];
  if (!kf || typeof kf !== 'object') {
    throw new Error(`reconcile: SUMMARY ${planId} has no structured key-files`);
  }
  const actual = [];
  if (Array.isArray(kf.created)) actual.push(...kf.created);
  if (Array.isArray(kf.modified)) actual.push(...kf.modified);
  const dedup = Array.from(new Set(actual.filter((x) => typeof x === 'string')));

  const planParsed = fm.parse(fs.readFileSync(planPath, 'utf8'));
  const planFm = { ...(planParsed.frontmatter || {}) };
  let prev = planFm['expected-key-files'];

  let next;
  if (prev === undefined || prev === null) {
    next = { [planId]: dedup };
  } else if (Array.isArray(prev)) {
    // Flat array — promote to map under this planId.
    next = { [planId]: dedup };
  } else if (typeof prev === 'object') {
    next = { ...prev, [planId]: dedup };
  } else {
    next = { [planId]: dedup };
  }
  planFm['expected-key-files'] = next;

  if (dryRun) {
    return {
      changedPaths: [path.relative(root, planPath)],
      detail: `would rewrite expected-key-files["${planId}"] to ${dedup.length} entries`,
      action: 'would-write',
      before: prev,
      after: next[planId],
    };
  }
  const out = fm.stringify(planFm, planParsed.body);
  fs.writeFileSync(planPath, out);
  return {
    changedPaths: [path.relative(root, planPath).split(path.sep).join('/')],
    detail: `rewrote expected-key-files["${planId}"] to ${dedup.length} entries`,
    action: 'written',
    before: prev,
    after: next[planId],
  };
}

// ---------- finding dispatch ----------

/**
 * Apply the right reconcile operation for a given audit finding.
 * Used both by `cp reconcile` and by audit-fix FIXERS.
 *
 * Supported finding ids:
 *   - missing-base-commit
 *   - missing-end-commit
 *   - expected-vs-actual-drift  (only when opts.accept === true)
 */
function reconcileFinding(root, finding, opts = {}) {
  if (!finding || !finding.id) throw new Error('reconcileFinding: invalid finding');
  switch (finding.id) {
    case 'missing-base-commit':
      if (!finding.phaseNum) throw new Error('missing-base-commit: no phaseNum');
      return inferBaseCommit(root, finding.phaseNum, opts);
    case 'missing-end-commit':
      if (!finding.planId) throw new Error('missing-end-commit: no planId');
      return inferEndCommit(root, finding.planId, opts);
    case 'expected-vs-actual-drift':
      if (!opts.accept) {
        throw new Error('expected-vs-actual-drift: pass {accept:true} to rewrite');
      }
      if (!finding.planId) throw new Error('expected-vs-actual-drift: no planId');
      return acceptExpectedKeyFiles(root, finding.planId, opts);
    default:
      throw new Error(`reconcile: no operation for finding id "${finding.id}"`);
  }
}

/**
 * Reconcile every applicable finding for a phase. Returns an array of
 * `{ finding, result, error? }` entries. Does not commit.
 *
 * If `opts.audit` is provided (the runAudit result), reuse it instead of
 * re-running audit. Caller passes `{ accept }` for drift rewrites.
 */
function reconcilePhase(root, phaseNum, opts = {}) {
  const { accept = false, dryRun = false, findings = null } = opts;
  const list = Array.isArray(findings) ? findings : [];
  const filtered = list.filter((f) => String(f.phaseNum) === String(phaseNum));
  const results = [];
  for (const f of filtered) {
    if (!['missing-base-commit', 'missing-end-commit', 'expected-vs-actual-drift'].includes(f.id)) {
      continue;
    }
    if (f.id === 'expected-vs-actual-drift' && !accept) continue;
    try {
      const res = reconcileFinding(root, f, { accept, dryRun });
      results.push({ finding: f, result: res });
    } catch (err) {
      results.push({ finding: f, error: err.message });
    }
  }
  return results;
}

module.exports = {
  inferBaseCommit,
  inferEndCommit,
  acceptExpectedKeyFiles,
  reconcileFinding,
  reconcilePhase,
  _firstPhaseCommit,
  _lastPlanCommit,
  _findPhaseDir,
};
