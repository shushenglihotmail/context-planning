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

// ---------- sham-review-log ----------

// Skills that are expected to dispatch real reviewer subagents.
// Only phases whose project-configured execute skill matches this list are checked.
const REVIEWER_BEARING_SKILLS = [
  'superpowers/subagent-driven-development',
  'superpowers/executing-plans',
  'superpowers/requesting-code-review',
  'subagent-driven-development',
  'executing-plans',
  'requesting-code-review',
];

// Reviewer names in REVIEW-LOG headings that indicate no real subagent reviewer ran.
const SHAM_REVIEWER_NAMES = new Set([
  'orchestrator (inline)',
  'orchestrator',
  'inline',
  'self',
  '',
]);

/**
 * Parse reviewer entries from a REVIEW-LOG.md file.
 * Entries appear after the <!-- REVIEW-LOG-ENTRIES-BELOW --> marker as ## headings.
 * Returns { entries: [{reviewer: string}], error: string|null }
 */
function parseShamReviewLogEntries(reviewLogPath) {
  const raw = readSafe(reviewLogPath);
  if (!raw) return { entries: [], error: 'file not found' };

  const marker = '<!-- REVIEW-LOG-ENTRIES-BELOW -->';
  const markerIdx = raw.indexOf(marker);
  const section = markerIdx >= 0 ? raw.slice(markerIdx + marker.length) : raw;

  const entries = [];
  const headingRe = /^##\s+[^\n]+$/gm;
  let m;
  while ((m = headingRe.exec(section)) !== null) {
    const heading = m[0];
    // Find the last em-dash (—), en-dash (–), or ' - ' separator to extract reviewer-role
    const emIdx = heading.lastIndexOf('\u2014');
    const enIdx = heading.lastIndexOf('\u2013');
    const lastSep = Math.max(emIdx, enIdx);
    const reviewer = lastSep >= 0 ? heading.slice(lastSep + 1).trim() : '';
    entries.push({ reviewer });
  }

  return { entries, error: null };
}

function isReviewerBearingSkill(skillName) {
  if (!skillName || typeof skillName !== 'string') return false;
  const lower = skillName.toLowerCase();
  return REVIEWER_BEARING_SKILLS.some((s) => lower === s.toLowerCase());
}

function checkShamReviewLog(root, ctx) {
  const out = [];

  // Determine the project's execute skill; skip entire check on resolution failure
  let executeSkill = null;
  try {
    const provider = require('./provider');
    const resolved = provider.resolveSkill('execute', root);
    executeSkill = resolved && resolved.skill ? String(resolved.skill) : null;
  } catch (_) {
    return out;
  }

  if (!isReviewerBearingSkill(executeSkill)) return out;

  for (const phase of ctx.phases) {
    const reviewLogPath = path.join(phase.dir, 'REVIEW-LOG.md');
    if (!fs.existsSync(reviewLogPath)) continue;

    const raw = readSafe(reviewLogPath);
    if (!raw) continue;

    // Primary trigger: sham approval phrase
    if (!/approved\s+on\s+first\s+pass/i.test(raw)) continue;

    const { entries, error } = parseShamReviewLogEntries(reviewLogPath);

    if (error && error !== 'file not found') {
      out.push(mkFinding({
        id: 'rule-did-not-run',
        severity: 'LOW',
        location: path.relative(root, reviewLogPath),
        message: `sham-review-log did not run: ${error}`,
        fix: 'inspect REVIEW-LOG.md for parse errors',
        phaseNum: phase.num,
      }));
      continue;
    }

    // A real reviewer entry (not in SHAM_REVIEWER_NAMES) corroborates the approval
    const hasRealReviewer = entries.some((e) => {
      const r = (e.reviewer || '').toLowerCase().trim();
      return !SHAM_REVIEWER_NAMES.has(r);
    });

    if (!hasRealReviewer) {
      out.push(mkFinding({
        id: 'sham-review-log',
        severity: 'MEDIUM',
        location: path.relative(root, reviewLogPath),
        message: `Phase ${phase.num} REVIEW-LOG.md contains "approved on first pass" with no real reviewer record`,
        fix: 'ensure a real reviewer subagent ran and appended a genuine entry to REVIEW-LOG.md',
        phaseNum: phase.num,
      }));
    }
  }

  return out;
}

// ---------- skill-resolved-but-not-loaded ----------

/**
 * Read the invoked_skill attestation for a specific run + phase.
 * Returns the string value, or null if the file/field is absent.
 *
 * @param {string} root - project root
 * @param {string} slug - run slug
 * @param {string} phaseId - workflow phase id
 * @returns {string|null}
 */
function readInvokedSkill(root, slug, phaseId) {
  const stateFile = path.join(root, '.planning', '.run-state', slug, `${phaseId}.json`);
  const raw = readSafe(stateFile);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return typeof data.invoked_skill === 'string' ? data.invoked_skill : null;
  } catch (_) {
    return null;
  }
}

/**
 * Normalise a skill name for comparison:
 * strips leading 'superpowers/' prefix so that
 * 'superpowers/subagent-driven-development' and
 * 'subagent-driven-development' compare equal.
 */
function normaliseSkillName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/^superpowers\//, '').toLowerCase();
}

function checkSkillResolvedButNotLoaded(root, ctx) {
  const out = [];

  // Resolve the project's global execute skill (same strategy as sham-review-log).
  let executeSkill = null;
  try {
    const providerMod = require('./provider');
    const resolved = providerMod.resolveSkill('execute', root);
    executeSkill = resolved && resolved.skill ? String(resolved.skill) : null;
  } catch (_) {
    return out;
  }

  if (!isReviewerBearingSkill(executeSkill)) return out;

  // Scan .planning/.run-state/<slug>/<phaseId>.json for all attestation records.
  const runStateRoot = path.join(root, '.planning', '.run-state');
  if (!fs.existsSync(runStateRoot)) return out;

  let slugDirs;
  try {
    slugDirs = fs.readdirSync(runStateRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (_) {
    return out;
  }

  for (const slug of slugDirs) {
    const slugDir = path.join(runStateRoot, slug);
    let phaseFiles;
    try {
      phaseFiles = fs.readdirSync(slugDir)
        .filter((f) => f.endsWith('.json'));
    } catch (_) {
      continue;
    }

    for (const phaseFile of phaseFiles) {
      const phaseId = phaseFile.slice(0, -5); // strip .json
      const stateFilePath = path.join(slugDir, phaseFile);
      const relPath = path.relative(root, stateFilePath);

      let invokedSkill = null;
      let resolvedSkillField = null;
      try {
        const raw = fs.readFileSync(stateFilePath, 'utf8');
        const data = JSON.parse(raw);
        invokedSkill = typeof data.invoked_skill === 'string' ? data.invoked_skill : null;
        resolvedSkillField = typeof data.resolved_skill === 'string' ? data.resolved_skill : null;
      } catch (_) {
        // Treat as absent
      }

      // Skip scaffold / skill-less phases (setup, finalize, etc.) — they never
      // emit an attestation contract, so <unrecorded> is expected and correct.
      if (resolvedSkillField === '(absent)') continue;

      if (invokedSkill === null || invokedSkill === '<unrecorded>') {
        out.push(mkFinding({
          id: 'skill-resolved-but-not-loaded',
          severity: 'MEDIUM',
          location: relPath,
          message:
            `Phase "${phaseId}" (run ${slug}) resolved execute skill "${executeSkill}" ` +
              `but invoked_skill was unrecorded. ` +
            `See attestation contract in that phase's prompt.`,
          fix: `Ensure the LLM invoked the resolved skill and included \`invoked_skill: ${executeSkill}\` in mark-complete output.`,
        }));
        continue;
      }

      // (inline-fallback) is a deliberate choice: emit LOW, not MEDIUM.
      if (invokedSkill === '(inline-fallback)') {
        out.push(mkFinding({
          id: 'skill-resolved-but-not-loaded',
          severity: 'LOW',
          location: relPath,
          message:
            `Phase "${phaseId}" (run ${slug}) fell back to inline execution ` +
            `instead of invoking resolved skill "${executeSkill}".`,
          fix: 'Verify the skill was genuinely unavailable; if so, install it or adjust routing.',
        }));
        continue;
      }

      // Check name match (modulo superpowers/ prefix normalisation).
      if (normaliseSkillName(invokedSkill) !== normaliseSkillName(executeSkill)) {
        out.push(mkFinding({
          id: 'skill-resolved-but-not-loaded',
          severity: 'MEDIUM',
          location: relPath,
          message:
            `Phase "${phaseId}" (run ${slug}) resolved skill "${executeSkill}" ` +
            `but LLM attested to invoking "${invokedSkill}". Skill mismatch.`,
          fix: `Ensure the LLM invokes the correct skill. Expected: ${executeSkill}`,
        }));
      }
      // else: match — no finding
    }
  }

  return out;
}

function checkPhaseNoRoadmap(root, ctx) {
  const out = [];
  // v0.10.3: also count phases inside a collapsed milestone <details> as
  // present in roadmap — writing-plans flattens inner ### Phase headings
  // away, but the <summary>Phases X-Y</summary> still claims them.
  const collapsed = roadmap.listCollapsedPhaseNums(ctx.roadmapRaw);
  const inRoadmap = new Set([
    ...ctx.roadmapPhases.map((p) => p.num),
    ...collapsed,
  ]);
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
  { id: 'sham-review-log', fn: checkShamReviewLog },
  { id: 'skill-resolved-but-not-loaded', fn: checkSkillResolvedButNotLoaded },
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
  checkShamReviewLog,
  checkSkillResolvedButNotLoaded,
  // sham-review-log helpers
  _parseShamReviewLogEntries: parseShamReviewLogEntries,
  _isReviewerBearingSkill: isReviewerBearingSkill,
};
