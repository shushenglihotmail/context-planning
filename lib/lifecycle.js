'use strict';

/**
 * High-level lifecycle helpers — the public, user-friendly API that hides
 * the lib-contract details that bit us during the linkmark demo:
 *   - SUMMARY filename format (`{NN-MM}-SUMMARY.md`, no slug)
 *   - SUMMARY frontmatter field names (`subsystem`, `key-files`, ...)
 *   - aggregateSummaries needs parsed-fm objects, not raw strings
 *   - collapseMilestoneInRoadmap returns `{content, changed}` not a string
 *   - state.updatePosition takes content, not a path
 *   - setPlanDone has to be called on BOTH ROADMAP and the phase PLAN.md
 *
 * Every function in this module is *transactional in intent*: it builds a
 * list of `actions` (file writes + commits) and then runs them. Dry-run
 * mode returns the action list without touching disk.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const fm = require('./frontmatter');
const roadmap = require('./roadmap');
const state = require('./state');
const milestone = require('./milestone');
const paths = require('./paths');

// ---------- shared helpers ----------

function readFile(p) { return fs.readFileSync(p, 'utf8'); }
function writeFile(p, content) {
  if (typeof content !== 'string') {
    throw new TypeError(`writeFile(${p}): content must be string, got ${typeof content}`);
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

/** Parse "01-02" → { phaseNum: '1', planSeq: '02', id: '01-02' }. */
function parsePlanId(planId) {
  const m = String(planId).match(/^(\d+(?:\.\d+)?)-(\d+)$/);
  if (!m) throw new Error(`Invalid plan id "${planId}" — expected "NN-MM" (e.g. "01-02").`);
  // Preserve decimal phase numbers (e.g. "2.1"); only normalise leading zeros on integers.
  const phaseNum = /^\d+$/.test(m[1]) ? String(parseInt(m[1], 10)) : m[1];
  return { phaseNum, planSeq: m[2], id: `${m[1]}-${m[2]}` };
}

/** Commit changes with a cp:-prefixed message. Returns commit hash or null if nothing staged. */
function gitCommit(root, message) {
  try {
    execSync('git add -A', { cwd: root, stdio: 'pipe' });
    // Bail if nothing staged.
    try {
      execSync('git diff --cached --quiet', { cwd: root, stdio: 'pipe' });
      return null;
    } catch { /* there ARE staged changes */ }
    execSync(`git commit -q -m ${JSON.stringify(message)}`, { cwd: root, stdio: 'pipe' });
    const hash = execSync('git rev-parse --short HEAD', { cwd: root, stdio: 'pipe' }).toString().trim();
    return hash;
  } catch (e) {
    // Not a git repo, or some other failure. Don't blow up the whole command.
    return null;
  }
}

// ---------- tick: mark a plan done ----------

/**
 * Mark a plan done in ROADMAP.md AND the phase's PLAN.md.
 * Returns { actions: [{path, before, after}], roadmapChanged, planChanged }.
 *
 * options:
 *   - dryRun: boolean — return actions without writing
 *   - done: boolean (default true) — pass false to un-tick
 */
function tickPlan(root, planId, options = {}) {
  const { dryRun = false, done = true } = options;
  const { phaseNum, id } = parsePlanId(planId);

  const planning = paths.planningDir(root);
  const roadmapPath = path.join(planning, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    throw new Error(`ROADMAP.md not found at ${roadmapPath}. Run \`cp init\` first.`);
  }

  const phaseDir = paths.findPhaseDir(phaseNum, root);
  if (!phaseDir) {
    throw new Error(`Phase ${phaseNum} dir not found under ${planning}/phases/. Have you run \`/cp-plan-phase ${phaseNum}\`?`);
  }
  const phasePlanPath = path.join(phaseDir, 'PLAN.md');

  const actions = [];
  const roadmapBefore = readFile(roadmapPath);
  const roadmapAfter = roadmap.setPlanDone(roadmapBefore, id, done);
  const roadmapChanged = roadmapBefore !== roadmapAfter;
  if (roadmapChanged) actions.push({ path: roadmapPath, before: roadmapBefore, after: roadmapAfter });

  let planChanged = false;
  if (fs.existsSync(phasePlanPath)) {
    const planBefore = readFile(phasePlanPath);
    const planAfter = roadmap.setPlanDone(planBefore, id, done);
    planChanged = planBefore !== planAfter;
    if (planChanged) actions.push({ path: phasePlanPath, before: planBefore, after: planAfter });
  }

  if (!dryRun) {
    for (const a of actions) writeFile(a.path, a.after);
  }

  return { actions, roadmapChanged, planChanged, phaseDir };
}

// ---------- write-summary ----------

const SUMMARY_FIELDS = {
  // Top-level keys aggregateSummaries reads (with the names it actually
  // accepts — some have hyphen/underscore aliases).
  scalar: ['phase', 'plan', 'completed', 'subsystem', 'duration'],
  arrays: ['tags', 'requires', 'provides', 'affects'],
  // requirements-completed / key-decisions / patterns-established
  // are also arrays but with the kebab-case name preserred.
  kebabArrays: ['requirements-completed', 'key-decisions', 'patterns-established'],
  // nested objects with `created` / `modified` arrays
  fileBuckets: 'key-files',
};

function _normaliseSummary(input) {
  // Accept either kebab-case or snake_case keys; normalise to the kebab-case
  // names that aggregateSummaries reads first.
  const out = {};
  const aliases = {
    subsystems: 'subsystem',          // common typo — collapse first one
    files_created: ['key-files', 'created'],
    files_modified: ['key-files', 'modified'],
    requirements_completed: 'requirements-completed',
    key_decisions: 'key-decisions',
    patterns_established: 'patterns-established',
    tech_stack: 'tech-stack',
  };
  for (const [k, v] of Object.entries(input)) {
    const target = aliases[k];
    if (Array.isArray(target)) {
      out[target[0]] = out[target[0]] || {};
      out[target[0]][target[1]] = v;
    } else if (typeof target === 'string') {
      // Collapse arrays-of-strings into the singular if needed.
      if (target === 'subsystem' && Array.isArray(v)) out.subsystem = v[0];
      else out[target] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Write a phase plan summary at the correct path with validated/normalised
 * frontmatter.
 *
 * Returns { path, action: 'written'|'dryrun' }.
 *
 * options:
 *   - dryRun: boolean
 *   - body: string (markdown body; defaults to a one-liner)
 *   - overwrite: boolean (default false)
 */
function writeSummary(root, planId, summaryData, options = {}) {
  const { dryRun = false, body, overwrite = false } = options;
  const { phaseNum, id } = parsePlanId(planId);

  const phaseDir = paths.findPhaseDir(phaseNum, root);
  if (!phaseDir) {
    throw new Error(`Phase ${phaseNum} dir not found. Run \`/cp-plan-phase ${phaseNum}\` first.`);
  }
  const summaryPath = path.join(phaseDir, `${id}-SUMMARY.md`);
  if (fs.existsSync(summaryPath) && !overwrite) {
    throw new Error(`${summaryPath} already exists. Pass overwrite:true to replace.`);
  }

  const normalised = _normaliseSummary(summaryData);
  // Backfill phase/plan if missing.
  if (!('phase' in normalised)) normalised.phase = parseInt(phaseNum, 10);
  if (!('plan' in normalised)) normalised.plan = id;
  if (!('completed' in normalised)) normalised.completed = new Date().toISOString().slice(0, 10);

  const text = fm.stringify(normalised, body || `# Summary ${id}\n\nPlan ${id} completed.\n`);
  if (!dryRun) writeFile(summaryPath, text);
  return { path: summaryPath, action: dryRun ? 'dryrun' : 'written', fm: normalised };
}

// ---------- status ----------

/**
 * Produce a "you are here" report by reading ROADMAP + STATE + on-disk
 * phase dirs. Returns a plain object — caller decides how to render.
 */
function statusReport(root) {
  const planning = paths.planningDir(root);
  const roadmapPath = path.join(planning, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { ok: false, error: '.planning/ROADMAP.md missing — run `cp init` first.' };
  }
  const roadmapContent = readFile(roadmapPath);
  const statePath = path.join(planning, 'STATE.md');
  const stateContent = fs.existsSync(statePath) ? readFile(statePath) : null;

  // Find the *current* milestone (the first non-collapsed `### ... (In Progress)` heading).
  // Fall back to first milestone of any status.
  const phasesIdx = roadmapContent.search(/^##\s+Phases\s*$/m);
  const after = phasesIdx === -1 ? roadmapContent : roadmapContent.slice(phasesIdx);
  const milestoneHeadings = [];
  const reM = /^###\s+(?!Phase\s+[\d.]+:)(.+?)$/gm;
  let mm;
  while ((mm = reM.exec(after)) !== null) {
    milestoneHeadings.push(mm[1].trim());
  }
  // Prefer "In Progress" status; otherwise first.
  let currentMilestoneName = null;
  for (const h of milestoneHeadings) {
    if (/in\s*progress/i.test(h) || /\uD83D\uDEA7/.test(h)) {
      currentMilestoneName = h
        .replace(/^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}\u2705\u2611\u2713\u2714\u2728]+/u, '')
        .replace(/\s*\((?:In Progress|Shipped[^)]*|Planned)\)\s*$/i, '')
        .trim();
      break;
    }
  }
  const milestoneInfo = currentMilestoneName
    ? milestone.findMilestoneInRoadmap(roadmapContent, currentMilestoneName)
    : null;

  const allPhases = roadmap.listPhases(roadmapContent);
  const phases = milestoneInfo
    ? allPhases.filter(p => milestoneInfo.phases.includes(p.num))
    : allPhases;

  // Next plan: first plan whose checkbox is unticked.
  let nextPlan = null;
  for (const ph of phases) {
    const pend = ph.plans.find(pl => !pl.done);
    if (pend) { nextPlan = { phase: ph, plan: pend }; break; }
  }

  const planCounts = phases.map(p => ({
    num: p.num,
    name: p.name,
    done: p.plans.filter(x => x.done).length,
    total: p.plans.length,
  }));

  return {
    ok: true,
    milestone: currentMilestoneName,
    milestoneStatus: milestoneInfo ? milestoneInfo.status : null,
    phases: planCounts,
    nextPlan: nextPlan
      ? { phaseNum: nextPlan.phase.num, phaseName: nextPlan.phase.name, planId: nextPlan.plan.id, desc: nextPlan.plan.desc }
      : null,
    stateContentPresent: !!stateContent,
  };
}

// ---------- complete-milestone ----------

/**
 * Full milestone close-out:
 *   1. Find milestone (by name or current)
 *   2. verifyMilestoneComplete — fail with structured error if not done
 *   3. readSummaries → aggregateSummaries → renderDigest → appendToMilestonesMd
 *   4. collapseMilestoneInRoadmap
 *   5. delete MILESTONE-CONTEXT.md if present
 *   6. reset STATE (Current Position → idle)
 *   7. (optional) git commit
 *
 * Returns: {
 *   ok, reason?, milestone, phases, actions: [{path, kind: 'write'|'delete'|'skip'}],
 *   commit?, verify
 * }
 *
 * options:
 *   - name: explicit milestone name override (default: current in-progress)
 *   - dryRun: boolean
 *   - noCommit: boolean (default false)
 *   - today: ISO date string (defaults to today)
 */
function completeMilestone(root, options = {}) {
  const { name, dryRun = false, noCommit = false } = options;
  const today = options.today || new Date().toISOString().slice(0, 10);

  const planning = paths.planningDir(root);
  const roadmapPath = path.join(planning, 'ROADMAP.md');
  const milestonesPath = path.join(planning, 'MILESTONES.md');
  const milestoneContextPath = path.join(planning, 'MILESTONE-CONTEXT.md');
  const statePath = path.join(planning, 'STATE.md');

  if (!fs.existsSync(roadmapPath)) {
    return { ok: false, reason: 'roadmap-missing', actions: [] };
  }

  // Resolve milestone name.
  let milestoneName = name;
  if (!milestoneName) {
    const status = statusReport(root);
    milestoneName = status.milestone;
  }
  if (!milestoneName) {
    return { ok: false, reason: 'no-current-milestone', actions: [], hint: 'Pass --name "v0.1 MVP" explicitly.' };
  }

  const roadmapContent = readFile(roadmapPath);
  const found = milestone.findMilestoneInRoadmap(roadmapContent, milestoneName);
  if (!found) {
    return { ok: false, reason: 'milestone-not-found', actions: [], milestone: milestoneName };
  }

  // Verify all phases done + summaries present.
  const verify = milestone.verifyMilestoneComplete(roadmapContent, found.phases, root);
  if (!verify.ok) {
    return { ok: false, reason: 'incomplete', milestone: found.name, phases: found.phases, verify, actions: [] };
  }

  // Aggregate.
  const summaries = milestone.readSummaries(found.phases, root);
  const agg = milestone.aggregateSummaries(summaries);

  // Phase-name map for digest.
  const allPhases = roadmap.listPhases(roadmapContent);
  const phaseNames = {};
  for (const p of allPhases) if (found.phases.includes(p.num)) phaseNames[p.num] = p.name;

  const digest = milestone.renderDigest(found.name, today, found.phases, agg, phaseNames);

  const actions = [];

  // 1. Append digest to MILESTONES.md
  const existing = fs.existsSync(milestonesPath)
    ? readFile(milestonesPath)
    : '# Completed Milestones\n\n';
  const newMilestones = milestone.appendToMilestonesMd(existing, digest);
  actions.push({ path: milestonesPath, kind: 'write', after: newMilestones, label: 'append-digest' });

  // 2. Collapse milestone in ROADMAP.md
  const collapsed = milestone.collapseMilestoneInRoadmap(roadmapContent, found.name, today);
  if (collapsed.changed) {
    actions.push({ path: roadmapPath, kind: 'write', after: collapsed.content, label: 'collapse-milestone' });
  } else {
    actions.push({ path: roadmapPath, kind: 'skip', label: 'collapse-milestone', reason: collapsed.reason });
  }

  // 3. Delete MILESTONE-CONTEXT.md if present
  if (fs.existsSync(milestoneContextPath)) {
    actions.push({ path: milestoneContextPath, kind: 'delete', label: 'clear-milestone-context' });
  }

  // 4. Reset STATE: Current Position → idle
  if (fs.existsSync(statePath)) {
    const stateBefore = readFile(statePath);
    let stateAfter = state.updatePosition(stateBefore, {
      phase: '0 (ready for next milestone)',
      plan: '0',
      status: 'Idle',
      lastActivity: `shipped ${found.name}`,
      date: today,
    });
    stateAfter = state.updateProgressBar(stateAfter, 0);
    stateAfter = state.updateSessionContinuity(stateAfter, {
      date: today,
      stoppedAt: `shipped ${found.name}`,
      resumeFile: 'None',
    });
    if (stateAfter !== stateBefore) {
      actions.push({ path: statePath, kind: 'write', after: stateAfter, label: 'reset-state' });
    }
  }

  if (dryRun) {
    return { ok: true, milestone: found.name, phases: found.phases, agg, verify, actions, dryRun: true };
  }

  // Apply actions.
  for (const a of actions) {
    if (a.kind === 'write') writeFile(a.path, a.after);
    else if (a.kind === 'delete') fs.unlinkSync(a.path);
  }

  // Commit.
  let commit = null;
  if (!noCommit) {
    commit = gitCommit(root, `cp: /cp-complete-milestone ${found.name}`);
  }

  return { ok: true, milestone: found.name, phases: found.phases, agg, verify, actions, commit };
}

module.exports = {
  parsePlanId,
  gitCommit,
  tickPlan,
  writeSummary,
  statusReport,
  completeMilestone,
};
