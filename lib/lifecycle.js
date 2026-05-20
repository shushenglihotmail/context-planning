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
const crypto = require('crypto');
const { execSync } = require('child_process');

const fm = require('./frontmatter');
const roadmap = require('./roadmap');
const state = require('./state');
const milestone = require('./milestone');
const paths = require('./paths');

// ---------- shared helpers ----------

function readFile(p) { return fs.readFileSync(p, 'utf8'); }

/**
 * Atomic single-file write — write to a sibling temp file then rename. The
 * rename is atomic on POSIX, and on NTFS via `MoveFileEx`
 * (`MOVEFILE_REPLACE_EXISTING`), which Node's `fs.renameSync` uses. So the
 * worst observable state for a reader is "old content" or "new content",
 * never "half-written".
 *
 * On failure during the write step, we clean up the temp file so we don't
 * leak `.cp-tmp-*` siblings on disk.
 *
 * v0.3.2: closes the data-integrity gap surfaced by the live `/cp-map-codebase`
 * dry-fire (CONCERNS.md → Critical).
 */
function writeFile(p, content) {
  if (typeof content !== 'string') {
    throw new TypeError(`writeFile(${p}): content must be string, got ${typeof content}`);
  }
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  const suffix = `.cp-tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const tmp = p + suffix;
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, p);
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}

/**
 * Best-effort transactional batch apply for the multi-file lifecycle ops
 * (currently `completeMilestone`; designed to wrap any future op that mutates
 * 2+ planning files in one logical step).
 *
 * Strategy:
 *   1. Stage every `write` action to a sibling `.cp-tmp-*` file FIRST. If any
 *      write fails (disk full, permissions, …), no temp gets renamed and we
 *      throw. The on-disk state is unchanged except for one stray temp we
 *      then unlink.
 *   2. Once all temps are staged, `rename` them all in sequence. Each rename
 *      is per-file atomic; the small window between renames is the only
 *      remaining inconsistency surface.
 *   3. ONLY AFTER all writes have landed, apply `delete` actions. This
 *      enforces the invariant "destructive ops never run before their
 *      replacement state is on disk" — the core fix for the
 *      `completeMilestone` Critical.
 *
 * Action shape: `{ kind: 'write', path, after }` or `{ kind: 'delete', path }`.
 * Other kinds (`'skip'`, etc.) are silently ignored — they exist for callers'
 * reporting only.
 */
function writeBatch(actions) {
  const writes = actions.filter((a) => a.kind === 'write');
  const deletes = actions.filter((a) => a.kind === 'delete');

  // Stage all writes to temp files first.
  const staged = [];
  try {
    for (const a of writes) {
      if (typeof a.after !== 'string') {
        throw new TypeError(`writeBatch: write action for ${a.path} has no string \`after\` content`);
      }
      const dir = path.dirname(a.path);
      fs.mkdirSync(dir, { recursive: true });
      const suffix = `.cp-tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
      const tmp = a.path + suffix;
      fs.writeFileSync(tmp, a.after);
      staged.push({ tmp, dest: a.path });
    }
  } catch (e) {
    // Cleanup: remove any temps we did manage to stage so we don't leak.
    for (const s of staged) {
      try { if (fs.existsSync(s.tmp)) fs.unlinkSync(s.tmp); } catch { /* ignore */ }
    }
    throw e;
  }

  // All temps staged — now rename them into place.
  for (const s of staged) {
    fs.renameSync(s.tmp, s.dest);
  }

  // Only then do the deletes (destructive ops last).
  for (const a of deletes) {
    if (fs.existsSync(a.path)) fs.unlinkSync(a.path);
  }
}

/** Parse "01-02" → { phaseNum: '1', planSeq: '02', id: '01-02' }. */
function parsePlanId(planId) {
  const m = String(planId).match(/^(\d+(?:\.\d+)?)-(\d+)$/);
  if (!m) throw new Error(`Invalid plan id "${planId}" — expected "NN-MM" (e.g. "01-02").`);
  // Preserve decimal phase numbers (e.g. "2.1"); only normalise leading zeros on integers.
  const phaseNum = /^\d+$/.test(m[1]) ? String(parseInt(m[1], 10)) : m[1];
  return { phaseNum, planSeq: m[2], id: `${m[1]}-${m[2]}` };
}

/**
 * Commit changes with a cp:-prefixed message. Returns commit hash or null
 * if nothing was staged.
 *
 * options.paths — array of file paths (absolute or repo-relative) to stage.
 *   When provided, ONLY these paths are staged. This is the right call-site
 *   pattern for lifecycle ops that compute an explicit `actions` list — use
 *   `pathsFromActions(actions)` to derive it.
 * options.planningOnly — boolean, defaults TRUE. When no `paths` are given,
 *   stages just `.planning/` (the cp state layer) rather than the entire
 *   working tree. Avoids the v0.3.x footgun where running `cp scaffold-*`
 *   in a dirty repo would sweep unrelated edits into a misleading `cp:`
 *   commit. Set to false to opt back into `git add -A` legacy behavior.
 *
 * If the resulting `git add` selection has nothing staged for commit, the
 * function returns null without invoking `git commit`.
 *
 * v0.3.3 — closes CONCERNS High: "gitCommit uses repo-wide `git add -A`".
 */
function gitCommit(root, message, options = {}) {
  const { paths: pathList, planningOnly = true } = options;
  try {
    if (Array.isArray(pathList) && pathList.length > 0) {
      // Stage exactly the paths the caller produced. Normalize to repo-relative
      // for readability in `git status` and avoid OS-path-separator issues.
      const args = pathList.map((p) => {
        const abs = path.isAbsolute(p) ? p : path.join(root, p);
        const rel = path.relative(root, abs);
        return JSON.stringify(rel.split(path.sep).join('/'));
      }).join(' ');
      execSync(`git add -- ${args}`, { cwd: root, stdio: 'pipe' });
    } else if (planningOnly) {
      // Default: stage only the state layer. Existing repos with .planning/
      // gitignored will see this as a no-op (nothing staged) — safe.
      execSync('git add -- .planning', { cwd: root, stdio: 'pipe' });
    } else {
      execSync('git add -A', { cwd: root, stdio: 'pipe' });
    }
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

/**
 * Extract the unique set of file paths from a lifecycle actions list. Pass
 * the result as `gitCommit(root, msg, { paths })` to scope the auto-commit
 * exactly to what the op produced — no `git add -A` footgun.
 *
 * Handles both `write` and `delete` action kinds; ignores `skip` and unknown
 * kinds. Returns an array (order preserved, dedup'd).
 */
function pathsFromActions(actions) {
  if (!Array.isArray(actions)) return [];
  const seen = new Set();
  const out = [];
  for (const a of actions) {
    if (!a || (a.kind !== 'write' && a.kind !== 'delete')) continue;
    if (typeof a.path !== 'string') continue;
    if (seen.has(a.path)) continue;
    seen.add(a.path);
    out.push(a.path);
  }
  return out;
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

// ---------- scaffold-milestone ----------

/**
 * Append a new `### 🚧 <name> (In Progress)` heading inside the `## Phases`
 * H2 section of ROADMAP.md.
 *
 * Refuses if a milestone heading whose stripped name matches `name` already
 * exists (any status — in-progress, planned, or shipped/collapsed).
 *
 * Returns { ok, actions: [{path, before, after}], milestone, dryRun? }.
 *
 * options:
 *   - dryRun: boolean
 *   - status: 'in-progress' | 'planned' (default 'in-progress')
 */
function scaffoldMilestone(root, name, options = {}) {
  const { dryRun = false, status = 'in-progress' } = options;
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('scaffold-milestone: <name> is required.');
  }
  const cleanName = name.trim();

  const planning = paths.planningDir(root);
  const roadmapPath = path.join(planning, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    throw new Error(`ROADMAP.md not found at ${roadmapPath}. Run \`cp init\` first.`);
  }
  const before = readFile(roadmapPath);

  // Check for duplicate: look for any existing milestone H3 whose stripped
  // name matches (case-insensitive). Reuse the lib/milestone parser to be
  // exact about what counts.
  const existing = milestone.findMilestoneInRoadmap(before, cleanName);
  if (existing) {
    return {
      ok: false,
      reason: 'milestone-exists',
      milestone: existing.name,
      status: existing.status,
      actions: [],
    };
  }

  // Locate `## Phases` H2. If missing, surface a clear error — the file is
  // malformed beyond what we should auto-repair.
  const phasesIdx = before.search(/^##\s+Phases\s*$/m);
  if (phasesIdx === -1) {
    throw new Error(
      `ROADMAP.md has no \`## Phases\` section. Re-run \`cp init\` against an empty .planning/ or hand-add the section.`
    );
  }
  // Find the end of the `## Phases` line (newline after it).
  const lineEnd = before.indexOf('\n', phasesIdx);
  const insertAt = lineEnd === -1 ? before.length : lineEnd;

  const emoji = status === 'planned' ? '📋' : '🚧';
  const suffix = status === 'planned' ? '(Planned)' : '(In Progress)';
  const heading = `\n\n### ${emoji} ${cleanName} ${suffix}\n`;

  const after = before.slice(0, insertAt) + heading + before.slice(insertAt);

  const actions = [{ path: roadmapPath, before, after, kind: 'write' }];
  if (!dryRun) {
    writeFile(roadmapPath, after);
  }
  return { ok: true, milestone: cleanName, status, actions, dryRun: dryRun || undefined };
}

// ---------- scaffold-phase ----------

/**
 * Add a new `### Phase N: <name>` heading inside the active milestone block
 * in ROADMAP.md and create `.planning/phases/{NN-slug}/PLAN.md` from the
 * phase-PLAN template.
 *
 * Returns { ok, actions, phaseDir, plans: ['NN-01', ...], dryRun? }.
 *
 * options:
 *   - dryRun: boolean
 *   - name: string (required) — human phase name
 *   - plans: number (default 0) — pre-fill N empty plan checkboxes
 *   - milestone: string (optional) — match a specific milestone by name;
 *                otherwise the first in-progress milestone is used
 *   - today: ISO date (for tests)
 */
function scaffoldPhase(root, phaseNum, options = {}) {
  const { dryRun = false, name, plans = 0, milestone: milestoneName, today: todayIso } = options;
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('scaffold-phase: --name <name> is required.');
  }
  const cleanName = name.trim();
  const numStr = String(phaseNum);
  if (!/^\d+(\.\d+)?$/.test(numStr)) {
    throw new Error(`scaffold-phase: phase number must be an integer or decimal (e.g. "2" or "2.1"), got "${numStr}".`);
  }

  const planning = paths.planningDir(root);
  const roadmapPath = path.join(planning, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    throw new Error(`ROADMAP.md not found at ${roadmapPath}. Run \`cp init\` first.`);
  }
  const roadmapBefore = readFile(roadmapPath);

  // Refuse if a phase dir already exists for this number.
  if (paths.findPhaseDir(numStr, root)) {
    return {
      ok: false,
      reason: 'phase-exists',
      phaseDir: paths.findPhaseDir(numStr, root),
      actions: [],
    };
  }

  // Resolve the milestone whose block we'll insert into.
  // Locate `## Phases` section and enumerate H3 milestone headings.
  const phasesIdx = roadmapBefore.search(/^##\s+Phases\s*$/m);
  if (phasesIdx === -1) {
    throw new Error(
      `ROADMAP.md has no \`## Phases\` section. Run \`cp scaffold-milestone <name>\` first.`
    );
  }
  const after = roadmapBefore.slice(phasesIdx);
  const nextH2 = after.slice(2).search(/^##\s+/m);
  const phasesSection = nextH2 === -1 ? after : after.slice(0, nextH2 + 2);
  const phasesSectionStart = phasesIdx;
  const phasesSectionEnd = phasesSectionStart + phasesSection.length;

  // Enumerate H3 headings *within* `## Phases`.
  const reH3 = /^###\s+(.*)$/gm;
  const headings = [];
  let m;
  while ((m = reH3.exec(phasesSection)) !== null) {
    headings.push({
      text: m[1].trim(),
      absStart: phasesSectionStart + m.index,
    });
  }
  function isPhaseHeading(t) { return /^Phase\s+[\d.]+:/i.test(t); }
  function milestoneStatus(t) {
    if (/\u2705/.test(t) || /shipped/i.test(t)) return 'shipped';
    if (/\uD83D\uDEA7/.test(t) || /in\s*progress/i.test(t)) return 'in-progress';
    if (/\uD83D\uDCCB/.test(t) || /planned/i.test(t)) return 'planned';
    return null;
  }
  function stripDecor(t) {
    return t
      .replace(/^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}\u2705\u2611\u2713\u2714\u2728]+/u, '')
      .replace(/\s*\((?:In Progress|Shipped[^)]*|Planned)\)\s*$/i, '')
      .trim();
  }

  // Find the active milestone heading (or matching by name) and the next
  // milestone H3 (which serves as the insertion boundary).
  let activeIdx = -1;
  let activeName = null;
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    if (isPhaseHeading(h.text)) continue;
    const status = milestoneStatus(h.text);
    if (!status) continue;
    const cleanH = stripDecor(h.text);
    if (milestoneName) {
      if (cleanH.toLowerCase().includes(milestoneName.toLowerCase())) {
        activeIdx = i;
        activeName = cleanH;
        break;
      }
    } else if (status === 'in-progress' && activeIdx === -1) {
      activeIdx = i;
      activeName = cleanH;
      // don't break — but prefer FIRST in-progress milestone
      break;
    }
  }
  if (activeIdx === -1) {
    return {
      ok: false,
      reason: milestoneName ? 'milestone-not-found' : 'no-active-milestone',
      milestone: milestoneName || null,
      actions: [],
    };
  }

  // Determine insertion point: end of the active milestone's block —
  // i.e., just before the next milestone H3, or end of `## Phases` section.
  let insertAt = phasesSectionEnd;
  for (let j = activeIdx + 1; j < headings.length; j++) {
    if (!isPhaseHeading(headings[j].text) && milestoneStatus(headings[j].text)) {
      insertAt = headings[j].absStart;
      break;
    }
  }
  // Trim trailing blank lines from the slice before insertion so we don't
  // pile up newlines.
  let leftSlice = roadmapBefore.slice(0, insertAt);
  let rightSlice = roadmapBefore.slice(insertAt);
  // Ensure single blank line before the new H3.
  leftSlice = leftSlice.replace(/\n+$/, '\n');

  // Build the new phase block.
  const padded = paths.padPhaseNum(numStr);
  const planLines = [];
  for (let i = 1; i <= Math.max(0, plans); i++) {
    const pp = paths.padPlanNum(i);
    planLines.push(`- [ ] ${padded}-${pp}: TBD`);
  }
  const planSection = plans > 0 ? `\nPlans:\n${planLines.join('\n')}\n` : '';
  const phaseBlock = `\n### Phase ${numStr}: ${cleanName}\n${planSection}`;

  const roadmapAfter = leftSlice + phaseBlock + rightSlice;

  // Create the phase PLAN.md from template.
  const phaseDirPath = paths.phaseDir(numStr, cleanName, root);
  const planPath = path.join(phaseDirPath, 'PLAN.md');

  const planTemplate = paths.readTemplate('phase-PLAN.md');
  const todayStr = todayIso || new Date().toISOString().slice(0, 10);
  const planChecklist = plans > 0
    ? planLines.map((l) => l.replace(/: TBD$/, ': {brief description}')).join('\n')
    : '<!-- No plans yet. Add via `cp scaffold-plan` (coming in v0.4) or edit by hand. -->';
  const planRendered = planTemplate
    .replace(/\{\{PHASE_NUM\}\}/g, numStr)
    .replace(/\{\{PHASE_NAME\}\}/g, cleanName)
    .replace(/\{\{MILESTONE_NAME\}\}/g, activeName)
    .replace(/\{\{DATE\}\}/g, todayStr)
    .replace(/\{\{PLANS_LIST\}\}/g, planChecklist);

  const actions = [
    { path: roadmapPath, before: roadmapBefore, after: roadmapAfter, kind: 'write' },
    { path: planPath, before: null, after: planRendered, kind: 'write' },
  ];

  if (!dryRun) {
    for (const a of actions) writeFile(a.path, a.after);
  }
  return {
    ok: true,
    phaseDir: phaseDirPath,
    phaseNum: numStr,
    milestone: activeName,
    plans: planLines.map((l) => l.match(/^- \[ \] (\S+):/)[1]),
    actions,
    dryRun: dryRun || undefined,
  };
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

  // Apply actions transactionally: writes-as-temps first, then renames, then
  // deletes. Guarantees the destructive `delete MILESTONE-CONTEXT.md` never
  // runs before its replacement state (MILESTONES.md / ROADMAP.md / STATE.md)
  // is durable on disk. v0.3.2 — closes the multi-file inconsistency gap.
  writeBatch(actions);

  // Commit. Scope staging to exactly the files this op touched.
  let commit = null;
  if (!noCommit) {
    commit = gitCommit(root, `cp: /cp-complete-milestone ${found.name}`, {
      paths: pathsFromActions(actions),
    });
  }

  return { ok: true, milestone: found.name, phases: found.phases, agg, verify, actions, commit };
}

module.exports = {
  parsePlanId,
  gitCommit,
  pathsFromActions,
  writeFile,
  writeBatch,
  tickPlan,
  writeSummary,
  statusReport,
  completeMilestone,
  scaffoldMilestone,
  scaffoldPhase,
};
