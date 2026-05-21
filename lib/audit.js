'use strict';

/**
 * cp audit — Tier 3 (detect) drift sweep.
 *
 * Walks .planning/ROADMAP.md + .planning/phases/* and runs a registry
 * of pure check functions. Each finding carries a severity, a stable
 * id, a location, a human message, and a one-line fix hint.
 *
 * Read-only: never mutates anything. `audit --fix` orchestration is
 * Phase 25.
 *
 * Public API:
 *   runAudit(root, opts) -> { findings, summary }
 *   CHECKS              — the built-in registry
 *
 * Severity levels: HIGH, MEDIUM, LOW.
 * Exit code policy (caller's job, but documented here):
 *   - no findings        -> 0
 *   - LOW/MEDIUM only    -> 1
 *   - any HIGH           -> 2
 *   - --strict & any     -> 2
 */

const fs = require('fs');
const path = require('path');

const fm = require('./frontmatter');
const paths = require('./paths');
const roadmap = require('./roadmap');
const lifecycle = require('./lifecycle');
const milestone = require('./milestone');
const state = require('./state');
const git = require('./git');

// ---------- shared helpers ----------

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; }
}

function listPhaseDirs(root) {
  const phasesRoot = path.join(paths.planningDir(root), 'phases');
  if (!fs.existsSync(phasesRoot)) return [];
  return fs.readdirSync(phasesRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const m = e.name.match(/^(\d+(?:\.\d+)?)-(.*)$/);
      if (!m) return null;
      return {
        num: m[1].replace(/^0+(?=\d)/, ''),
        slug: m[2],
        dir: path.join(phasesRoot, e.name),
        name: e.name,
      };
    })
    .filter(Boolean)
    .sort((a, b) => parseFloat(a.num) - parseFloat(b.num));
}

function parsePlanFrontmatter(planPath) {
  const raw = readSafe(planPath);
  if (!raw) return null;
  try {
    const parsed = fm.parse(raw);
    return { fm: parsed.frontmatter || {}, body: parsed.body };
  } catch (_) {
    return { fm: {}, body: raw };
  }
}

function planTickedFromPlanMd(planPath) {
  const raw = readSafe(planPath);
  if (!raw) return [];
  const out = [];
  const re = /^\s*-\s*\[x\]\s+(\d+(?:\.\d+)?-\d+)\s*:/gim;
  let m;
  while ((m = re.exec(raw)) !== null) out.push(m[1]);
  return Array.from(new Set(out));
}

function planAllFromPlanMd(planPath) {
  const raw = readSafe(planPath);
  if (!raw) return [];
  const out = [];
  const re = /^\s*-\s*\[[ xX]\]\s+(\d+(?:\.\d+)?-\d+)\s*:/gm;
  let m;
  while ((m = re.exec(raw)) !== null) out.push(m[1]);
  return Array.from(new Set(out));
}

// ---------- finding shape ----------

function mkFinding({ id, severity, location, message, fix, planId, phaseNum }) {
  return { id, severity, location, message, fix, planId: planId || null, phaseNum: phaseNum || null };
}

// ---------- check fns ----------

function checkTickedWithoutSummary(root, ctx) {
  const out = [];
  for (const phase of ctx.phases) {
    const planPath = path.join(phase.dir, 'PLAN.md');
    const ticked = planTickedFromPlanMd(planPath);
    for (const planId of ticked) {
      const summaryPath = path.join(phase.dir, `${planId}-SUMMARY.md`);
      if (!fs.existsSync(summaryPath)) {
        out.push(mkFinding({
          id: 'ticked-without-summary',
          severity: 'HIGH',
          location: path.relative(root, planPath),
          message: `Plan ${planId} is ticked but has no SUMMARY.md`,
          fix: `cp write-summary ${planId} --from <json>`,
          planId,
          phaseNum: phase.num,
        }));
      }
    }
  }
  return out;
}

function checkSummaryWithoutTick(root, ctx) {
  const out = [];
  for (const phase of ctx.phases) {
    const planPath = path.join(phase.dir, 'PLAN.md');
    const tickedSet = new Set(planTickedFromPlanMd(planPath));
    const entries = fs.readdirSync(phase.dir).filter((e) => /-SUMMARY\.md$/.test(e));
    for (const ent of entries) {
      const m = ent.match(/^(\d+(?:\.\d+)?-\d+)-SUMMARY\.md$/);
      if (!m) continue;
      const planId = m[1];
      if (!tickedSet.has(planId)) {
        out.push(mkFinding({
          id: 'summary-without-tick',
          severity: 'MEDIUM',
          location: path.relative(root, path.join(phase.dir, ent)),
          message: `SUMMARY exists for ${planId} but plan is not ticked in PLAN.md`,
          fix: `cp tick ${planId}`,
          planId,
          phaseNum: phase.num,
        }));
      }
    }
  }
  return out;
}

function checkMissingBaseCommit(root, ctx) {
  const out = [];
  for (const phase of ctx.phases) {
    const planPath = path.join(phase.dir, 'PLAN.md');
    const parsed = parsePlanFrontmatter(planPath);
    if (!parsed) continue;
    if (parsed.fm && !('base-commit' in parsed.fm)) {
      out.push(mkFinding({
        id: 'missing-base-commit',
        severity: 'MEDIUM',
        location: path.relative(root, planPath),
        message: `Phase ${phase.num} PLAN.md has no base-commit field`,
        fix: `cp reconcile --infer-shas --phase ${phase.num}  (v0.8 P11)`,
        phaseNum: phase.num,
      }));
    }
  }
  return out;
}

function checkInvalidBaseCommit(root, ctx) {
  const out = [];
  for (const phase of ctx.phases) {
    const planPath = path.join(phase.dir, 'PLAN.md');
    const parsed = parsePlanFrontmatter(planPath);
    if (!parsed || !parsed.fm) continue;
    if (!('base-commit' in parsed.fm)) continue;
    const rawSha = parsed.fm['base-commit'];
    if (rawSha === null || rawSha === undefined || rawSha === '') continue;
    const sha = String(rawSha).trim();
    if (!sha) continue;
    if (!git.shaExists(sha, { cwd: root })) {
      out.push(mkFinding({
        id: 'invalid-base-commit',
        severity: 'HIGH',
        location: path.relative(root, planPath),
        message: `Phase ${phase.num} base-commit ${sha.slice(0, 12)} not found in git`,
        fix: `cp reconcile --rebase-sha --phase ${phase.num}  (v0.8 P11)`,
        phaseNum: phase.num,
      }));
    }
  }
  return out;
}

function checkMissingEndCommit(root, ctx) {
  const out = [];
  for (const phase of ctx.phases) {
    const entries = fs.readdirSync(phase.dir).filter((e) => /-SUMMARY\.md$/.test(e));
    for (const ent of entries) {
      const raw = readSafe(path.join(phase.dir, ent));
      if (!raw) continue;
      let fmObj;
      try { fmObj = fm.parse(raw).frontmatter || {}; } catch (_) { fmObj = {}; }
      if (!fmObj['end-commit']) {
        const m = ent.match(/^(\d+(?:\.\d+)?-\d+)-SUMMARY\.md$/);
        const planId = m ? m[1] : null;
        out.push(mkFinding({
          id: 'missing-end-commit',
          severity: 'MEDIUM',
          location: path.relative(root, path.join(phase.dir, ent)),
          message: `SUMMARY ${planId || ent} has no end-commit field`,
          fix: planId ? `cp write-summary ${planId} --from <json> --overwrite` : null,
          planId,
          phaseNum: phase.num,
        }));
      }
    }
  }
  return out;
}

function checkExpectedVsActualDrift(root, ctx) {
  const out = [];
  for (const phase of ctx.phases) {
    const planPath = path.join(phase.dir, 'PLAN.md');
    if (!fs.existsSync(planPath)) continue;
    const entries = fs.readdirSync(phase.dir).filter((e) => /-SUMMARY\.md$/.test(e));
    for (const ent of entries) {
      const m = ent.match(/^(\d+(?:\.\d+)?-\d+)-SUMMARY\.md$/);
      if (!m) continue;
      const planId = m[1];
      let expected;
      try { expected = milestone._extractExpectedKeyFiles(phase.dir, planId); }
      catch (_) { expected = null; }
      if (!expected || expected.length === 0) continue;
      // actual from SUMMARY frontmatter
      const raw = readSafe(path.join(phase.dir, ent));
      let fmObj = {};
      try { fmObj = fm.parse(raw).frontmatter || {}; } catch (_) {}
      const actual = [];
      const kf = fmObj['key-files'];
      if (kf && typeof kf === 'object') {
        if (Array.isArray(kf.created)) actual.push(...kf.created);
        if (Array.isArray(kf.modified)) actual.push(...kf.modified);
      }
      const actualSet = new Set(actual);
      const expectedSet = new Set(expected);
      const missingExpected = expected.filter((f) => !actualSet.has(f));
      const unexpected = actual.filter((f) => !expectedSet.has(f) && !f.startsWith('.planning/'));
      if (missingExpected.length || unexpected.length) {
        const parts = [];
        if (missingExpected.length) parts.push(`missing ${missingExpected.length} expected`);
        if (unexpected.length) parts.push(`${unexpected.length} unexpected`);
        out.push(mkFinding({
          id: 'expected-vs-actual-drift',
          severity: 'LOW',
          location: path.relative(root, path.join(phase.dir, ent)),
          message: `Plan ${planId} key-files drift: ${parts.join(', ')}`,
          fix: 'review expected-key-files in PLAN.md vs SUMMARY key-files',
          planId,
          phaseNum: phase.num,
        }));
      }
    }
  }
  return out;
}

function checkStateStale(root, ctx) {
  const out = [];
  let res;
  try { res = state.regenerate(root, { dryRun: true, quiet: true }); } catch (_) { return out; }
  if (!res || res.action !== 'rewritten') return out;
  const statePath = path.join(paths.planningDir(root), 'STATE.md');
  out.push(mkFinding({
    id: 'state-stale',
    severity: 'LOW',
    location: path.relative(root, statePath),
    message: 'STATE.md derived block differs from what state.regenerate would produce',
    fix: 'cp state regen',
  }));
  return out;
}

function checkPhaseNoRoadmap(root, ctx) {
  const out = [];
  const inRoadmap = new Set(ctx.roadmapPhases.map((p) => p.num));
  for (const phase of ctx.phases) {
    if (!inRoadmap.has(phase.num)) {
      out.push(mkFinding({
        id: 'phase-no-roadmap',
        severity: 'MEDIUM',
        location: path.relative(root, phase.dir),
        message: `Phase ${phase.num} directory exists but no '### Phase ${phase.num}:' in ROADMAP.md`,
        fix: 'add a `### Phase N: <name>` heading to ROADMAP.md or remove the orphan dir',
        phaseNum: phase.num,
      }));
    }
  }
  return out;
}

function checkRoadmapNoPlanMd(root, ctx) {
  const out = [];
  const phaseDirsByNum = new Map(ctx.phases.map((p) => [p.num, p.dir]));
  for (const rp of ctx.roadmapPhases) {
    const dir = phaseDirsByNum.get(rp.num);
    if (!dir) {
      out.push(mkFinding({
        id: 'roadmap-no-plan-md',
        severity: 'LOW',
        location: '.planning/ROADMAP.md',
        message: `ROADMAP lists Phase ${rp.num} (${rp.name}) but no .planning/phases/${rp.num}-*/ dir`,
        fix: `cp scaffold-phase ${rp.num} --name "${rp.name}" --plans ${rp.plans.length || 1}`,
        phaseNum: rp.num,
      }));
      continue;
    }
    const planPath = path.join(dir, 'PLAN.md');
    if (!fs.existsSync(planPath)) {
      out.push(mkFinding({
        id: 'roadmap-no-plan-md',
        severity: 'LOW',
        location: path.relative(root, dir),
        message: `Phase ${rp.num} dir exists but no PLAN.md`,
        fix: 'restore PLAN.md from templates/phase-PLAN.md',
        phaseNum: rp.num,
      }));
    }
  }
  return out;
}

const CHECKS = [
  { id: 'ticked-without-summary', fn: checkTickedWithoutSummary },
  { id: 'summary-without-tick', fn: checkSummaryWithoutTick },
  { id: 'missing-base-commit', fn: checkMissingBaseCommit },
  { id: 'invalid-base-commit', fn: checkInvalidBaseCommit },
  { id: 'missing-end-commit', fn: checkMissingEndCommit },
  { id: 'expected-vs-actual-drift', fn: checkExpectedVsActualDrift },
  { id: 'state-stale', fn: checkStateStale },
  { id: 'phase-no-roadmap', fn: checkPhaseNoRoadmap },
  { id: 'roadmap-no-plan-md', fn: checkRoadmapNoPlanMd },
];

// ---------- driver ----------

function runAudit(root, opts = {}) {
  const { milestone: milestoneFilter, phase: phaseFilter, checks = CHECKS } = opts;
  const planning = paths.planningDir(root);

  const ctx = {
    planning,
    phases: listPhaseDirs(root),
    roadmapPhases: [],
    roadmapRaw: readSafe(path.join(planning, 'ROADMAP.md')) || '',
  };
  ctx.roadmapPhases = roadmap.listPhases(ctx.roadmapRaw);

  // Phase filter
  if (phaseFilter) {
    const want = String(phaseFilter);
    ctx.phases = ctx.phases.filter((p) => p.num === want);
    ctx.roadmapPhases = ctx.roadmapPhases.filter((p) => p.num === want);
  }
  // Milestone filter — best-effort: only the phases under the named
  // milestone H3 in ROADMAP. We don't currently parse the milestone
  // boundary precisely; defer richer filtering until audit --fix wants it.

  const findings = [];
  for (const check of checks) {
    try {
      const got = check.fn(root, ctx);
      if (Array.isArray(got)) findings.push(...got);
    } catch (e) {
      findings.push(mkFinding({
        id: 'check-error',
        severity: 'LOW',
        location: check.id,
        message: `check ${check.id} threw: ${e.message}`,
        fix: 'file a bug; check disabled for this run',
      }));
    }
  }

  // Post-filter: when phase filter set, drop project-level findings
  // (those without a phaseNum) so the filter is honored.
  let filtered = findings;
  if (phaseFilter) {
    const want = String(phaseFilter);
    filtered = findings.filter((f) => f.phaseNum === want);
  }

  // Sort: HIGH > MEDIUM > LOW, then by phaseNum asc, then planId asc
  const sevRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  function rank(s) { return Object.prototype.hasOwnProperty.call(sevRank, s) ? sevRank[s] : 99; }
  filtered.sort((a, b) => {
    const s = rank(a.severity) - rank(b.severity);
    if (s !== 0) return s;
    const pa = a.phaseNum ? parseFloat(a.phaseNum) : 999;
    const pb = b.phaseNum ? parseFloat(b.phaseNum) : 999;
    if (pa !== pb) return pa - pb;
    return String(a.planId || '').localeCompare(String(b.planId || ''));
  });

  const summary = {
    high: filtered.filter((f) => f.severity === 'HIGH').length,
    medium: filtered.filter((f) => f.severity === 'MEDIUM').length,
    low: filtered.filter((f) => f.severity === 'LOW').length,
    total: filtered.length,
  };

  return { findings: filtered, summary };
}

module.exports = {
  runAudit,
  CHECKS,
  // helpers exported for testing / reuse
  _listPhaseDirs: listPhaseDirs,
  _planTickedFromPlanMd: planTickedFromPlanMd,
  _planAllFromPlanMd: planAllFromPlanMd,
  // individual checks
  checkTickedWithoutSummary,
  checkSummaryWithoutTick,
  checkMissingBaseCommit,
  checkInvalidBaseCommit,
  checkMissingEndCommit,
  checkExpectedVsActualDrift,
  checkStateStale,
  checkPhaseNoRoadmap,
  checkRoadmapNoPlanMd,
};
