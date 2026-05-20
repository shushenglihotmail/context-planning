'use strict';

/**
 * Milestone close-out helpers.
 *
 * These are pure functions wherever possible — they take strings/objects in
 * and return new strings/objects out. The /cp-complete-milestone command
 * stitches them together. Keeping them pure makes them testable and lets
 * the command preview every change before writing.
 *
 * Aggregation is union/dedupe over SUMMARY.md frontmatter fields that GSD
 * uses for dependency-graph context selection — see
 * `templates/SUMMARY.md`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fm = require('./frontmatter');
const roadmap = require('./roadmap');
const paths = require('./paths');

// ---------- ROADMAP traversal ----------

/**
 * Find the milestone section in ROADMAP.md and return its name + every
 * phase block heading that belongs to it.
 *
 * Milestone sections in GSD-shape ROADMAP look like:
 *   ### 🚧 v1.1 Sharing (In Progress)
 * or
 *   ### ✅ v1.0 MVP (Shipped 2026-04-01)
 * and contain `### Phase N: ...` blocks underneath until the next milestone
 * heading or end of the `## Phases` section.
 *
 * Returns { name, status: 'in-progress' | 'planned' | 'shipped', phases: ['3', '3.1', '4'] }
 * or null if not found.
 */
function findMilestoneInRoadmap(content, milestoneName) {
  // Locate the `## Phases` section
  const phasesStart = content.search(/^##\s+Phases\s*$/m);
  if (phasesStart === -1) return null;
  const after = content.slice(phasesStart);
  const nextH2 = after.slice(2).search(/^##\s+/m);
  const phasesSection = nextH2 === -1 ? after : after.slice(0, nextH2 + 2);

  // Find every `### ` heading inside the Phases section, classify each as
  // a milestone heading or a phase heading.
  const headings = [];
  const re = /^###\s+(.*)$/gm;
  let m;
  while ((m = re.exec(phasesSection)) !== null) {
    headings.push({ text: m[1].trim(), index: m.index });
  }

  function isPhaseHeading(t) {
    return /^Phase\s+[\d.]+:/i.test(t);
  }
  function milestoneStatus(t) {
    if (/\u2705/.test(t) || /shipped/i.test(t)) return 'shipped';
    if (/\uD83D\uDEA7/.test(t) || /in\s*progress/i.test(t)) return 'in-progress';
    if (/\uD83D\uDCCB/.test(t) || /planned/i.test(t)) return 'planned';
    return null;
  }
  function stripMilestoneDecor(t) {
    // Strip leading emoji/punctuation (surrogate-pair safe) and trailing
    // "(In Progress)" / "(Shipped ...)" / "(Planned)" parenthetical.
    return t
      .replace(/^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}\u2705\u2611\u2713\u2714\u2728]+/u, '')
      .replace(/\s*\((?:In Progress|Shipped[^)]*|Planned)\)\s*$/i, '')
      .trim();
  }

  let active = null;
  const milestones = {};
  for (const h of headings) {
    if (!isPhaseHeading(h.text)) {
      const status = milestoneStatus(h.text);
      if (status) {
        const name = stripMilestoneDecor(h.text);
        active = name;
        milestones[name] = { name, status, phases: [], headingIndex: h.index };
      } else {
        active = null;
      }
    } else if (active) {
      const numMatch = h.text.match(/^Phase\s+([\d.]+):/i);
      if (numMatch) milestones[active].phases.push(numMatch[1]);
    }
  }

  // Match by exact name first; else by case-insensitive substring.
  let hit = milestones[milestoneName];
  if (!hit) {
    const lc = milestoneName.toLowerCase();
    for (const m2 of Object.values(milestones)) {
      if (m2.name.toLowerCase().includes(lc)) {
        hit = m2;
        break;
      }
    }
  }
  if (!hit) return null;
  return { name: hit.name, status: hit.status, phases: hit.phases };
}

// ---------- Completion verification ----------

/**
 * Verify every phase in `phaseNums` has all plans done in ROADMAP AND every
 * planned plan has a SUMMARY file on disk.
 *
 * Returns: { ok, reports: [{ phaseNum, name, plansDone, plansTotal, summariesPresent, summariesMissing }] }
 */
function verifyMilestoneComplete(roadmapContent, phaseNums, root) {
  const allPhases = roadmap.listPhases(roadmapContent);
  const map = Object.fromEntries(allPhases.map((p) => [p.num, p]));
  const reports = [];
  let ok = true;
  for (const num of phaseNums) {
    const p = map[num];
    if (!p) {
      reports.push({ phaseNum: num, name: null, error: 'phase missing from ROADMAP' });
      ok = false;
      continue;
    }
    const plansTotal = p.plans.length;
    const plansDone = p.plans.filter((pl) => pl.done).length;
    const dir = paths.findPhaseDir(num, root);
    const summariesMissing = [];
    const summariesPresent = [];
    if (dir) {
      for (const pl of p.plans) {
        const expected = path.join(dir, pl.id + '-SUMMARY.md');
        if (fs.existsSync(expected)) summariesPresent.push(pl.id);
        else summariesMissing.push(pl.id);
      }
    } else {
      for (const pl of p.plans) summariesMissing.push(pl.id);
    }
    const phaseOk = plansTotal > 0 && plansDone === plansTotal && summariesMissing.length === 0;
    if (!phaseOk) ok = false;
    reports.push({
      phaseNum: num,
      name: p.name,
      plansDone,
      plansTotal,
      summariesPresent,
      summariesMissing,
      ok: phaseOk,
    });
  }
  return { ok, reports };
}

// ---------- SUMMARY aggregation ----------

/**
 * Walk every SUMMARY.md under the listed phase dirs and return their parsed
 * frontmatter objects. Skips files that aren't present.
 */
function readSummaries(phaseNums, root) {
  const out = [];
  for (const num of phaseNums) {
    const dir = paths.findPhaseDir(num, root);
    if (!dir) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/^[\d.]+-\d+-SUMMARY\.md$/.test(f)) continue;
      const full = path.join(dir, f);
      const raw = fs.readFileSync(full, 'utf8');
      const parsed = fm.parse(raw).frontmatter || {};
      out.push({ phaseNum: num, phasePath: dir, file: full, fm: parsed });
    }
  }
  return out;
}

/**
 * Pure aggregator. Given a list of parsed SUMMARY frontmatter objects,
 * union-and-dedupe the fields GSD uses for dependency-graph context.
 *
 * Returns:
 *   {
 *     subsystems:           [unique subsystem strings],
 *     tags:                 [unique tags],
 *     requires:             [unique require ids],
 *     provides:             [unique provide ids],
 *     affects:              [unique paths],
 *     techAdded:            [unique tech deps],
 *     techPatterns:         [unique pattern names],
 *     filesCreated:         [unique paths],
 *     filesModified:        [unique paths],
 *     keyDecisions:         [{decision, phase}],
 *     patternsEstablished:  [{pattern, phase}],
 *     requirementsCompleted:[unique req ids],
 *     durationSummary:      string,
 *     planCount:            number,
 *     phaseDesignRefs:      [{ phase, path }],
 *   }
 */
function aggregateSummaries(summaries) {
  const set = () => new Map(); // preserves insertion order
  const subsystems = set();
  const tags = set();
  const requires = set();
  const provides = set();
  const affects = set();
  const techAdded = set();
  const techPatterns = set();
  const filesCreated = set();
  const filesModified = set();
  const keyDecisions = [];
  const patternsEstablished = [];
  const requirementsCompleted = set();
  const durations = [];

  for (const s of summaries) {
    const f = s.fm || s.data || {};
    const phase = s.phase || s.phaseNum;
    addOne(subsystems, f.subsystem);
    addList(tags, f.tags);
    addList(requires, f.requires);
    addList(provides, f.provides);
    addList(affects, f.affects);
    const ts = f['tech-stack'] || f.tech_stack || {};
    addList(techAdded, ts.added);
    addList(techPatterns, ts.patterns);
    const kf = f['key-files'] || f.key_files || {};
    addList(filesCreated, kf.created);
    addList(filesModified, kf.modified);
    addList(requirementsCompleted, f['requirements-completed'] || f.requirements_completed);
    if (Array.isArray(f['key-decisions'] || f.key_decisions)) {
      for (const d of f['key-decisions'] || f.key_decisions) {
        keyDecisions.push({ decision: String(d), phase });
      }
    }
    if (Array.isArray(f['patterns-established'] || f.patterns_established)) {
      for (const p of f['patterns-established'] || f.patterns_established) {
        patternsEstablished.push({ pattern: String(p), phase });
      }
    }
    if (f.duration) durations.push(String(f.duration));
  }

  // v0.7: scan each summary's phase dir for a DESIGN.md and emit a ref
  // (deduped by phase since multiple plans share one DESIGN.md per phase).
  const _designSeen = new Set();
  const phaseDesignRefs = [];
  for (const s of summaries) {
    if (!s) continue;
    const phase = s.phase || s.phaseNum;
    const phasePath = s.phasePath || s.phaseDir || s.path || null;
    if (!phasePath) continue;
    if (_designSeen.has(phase)) continue;
    const designPath = path.join(phasePath, 'DESIGN.md');
    if (fs.existsSync(designPath)) {
      _designSeen.add(phase);
      phaseDesignRefs.push({ phase, path: designPath });
    }
  }

  return {
    subsystems: Array.from(subsystems.keys()),
    tags: Array.from(tags.keys()),
    requires: Array.from(requires.keys()),
    provides: Array.from(provides.keys()),
    affects: Array.from(affects.keys()),
    techAdded: Array.from(techAdded.keys()),
    techPatterns: Array.from(techPatterns.keys()),
    filesCreated: Array.from(filesCreated.keys()),
    filesModified: Array.from(filesModified.keys()),
    keyDecisions,
    patternsEstablished,
    requirementsCompleted: Array.from(requirementsCompleted.keys()),
    durationSummary: durations.join(', ') || '—',
    planCount: summaries.length,
    phaseDesignRefs,
  };
}

/**
 * Promote .planning/MILESTONE-CONTEXT.md (transient) into the milestone-tier
 * DESIGN.md as a "Brainstorm transcript" appendix. Returns { action, path,
 * after, contextPath } or null if there's nothing to promote.
 *
 * Caller is responsible for writing `after` to `path` and deleting
 * `contextPath` (so cp can do both inside a writeBatch for atomicity).
 */
function promoteMilestoneContext(root, milestoneName, options = {}) {
  const fs = require('fs');
  const path = require('path');
  const paths = require('./paths');

  const contextPath = path.join(paths.planningDir(root), 'MILESTONE-CONTEXT.md');
  if (!fs.existsSync(contextPath)) return null;

  const body = fs.readFileSync(contextPath, 'utf8').trim();
  if (!body) return null;

  const designPath = paths.milestoneDesignFile(milestoneName, root);
  const exists = fs.existsSync(designPath);

  let after;
  if (exists) {
    const current = fs.readFileSync(designPath, 'utf8').replace(/\n+$/, '');
    after = `${current}\n\n## Brainstorm transcript\n\n${body}\n`;
  } else {
    after = [
      '---',
      `milestone_slug: "${paths.milestoneSlug(milestoneName)}"`,
      `milestone: ${milestoneName}`,
      'status: accepted',
      `created: ${options.today || new Date().toISOString().slice(0, 10)}`,
      '---',
      '',
      `# Design: ${milestoneName}`,
      '',
      '## Brainstorm transcript',
      '',
      body,
      '',
    ].join('\n');
  }

  return { action: exists ? 'appended' : 'created', path: designPath, after, contextPath };
}

function addOne(map, v) {
  if (v == null || v === '') return;
  map.set(String(v), true);
}
function addList(map, v) {
  if (!Array.isArray(v)) return;
  for (const x of v) addOne(map, x);
}

// ---------- Digest rendering ----------

function renderDigest(name, isoDate, phaseNums, agg, phaseNames = {}) {
  const lines = [];
  const first = phaseNums[0];
  const last = phaseNums[phaseNums.length - 1];
  lines.push(`## ${name}  — shipped ${isoDate}`);
  lines.push('');
  lines.push(
    `**Phases:** ${first}-${last}    **Plans:** ${agg.planCount}    **Duration:** ${agg.durationSummary}`
  );
  lines.push('');
  if (agg.requirementsCompleted.length) {
    lines.push(`**Requirements delivered:** ${agg.requirementsCompleted.join(', ')}`);
    lines.push('');
  }
  if (agg.subsystems.length) {
    lines.push(`**Subsystems touched:** ${agg.subsystems.join(', ')}`);
    lines.push('');
  }
  if (agg.techAdded.length) {
    lines.push(`**Tech added:** ${agg.techAdded.join(', ')}`);
    lines.push('');
  }
  if (agg.keyDecisions.length) {
    lines.push(`**Key decisions:**`);
    for (const d of agg.keyDecisions) {
      lines.push(`- ${d.decision}  _(phase ${d.phase})_`);
    }
    lines.push('');
  }
  if (agg.patternsEstablished.length) {
    lines.push(`**Patterns established:**`);
    for (const p of agg.patternsEstablished) {
      lines.push(`- ${p.pattern}  _(phase ${p.phase})_`);
    }
    lines.push('');
  }
  if (agg.filesCreated.length) {
    lines.push(`**Files (created):** ${agg.filesCreated.join(', ')}`);
  }
  if (agg.filesModified.length) {
    lines.push(`**Files (modified):** ${agg.filesModified.join(', ')}`);
  }
  if (agg.filesCreated.length || agg.filesModified.length) lines.push('');
  lines.push('**Phase summaries:**');
  for (const num of phaseNums) {
    const dir = `.planning/phases/${paths.padPhaseNum(num)}-${paths.slugifyPhase(phaseNames[num] || '')}/`;
    lines.push(`- Phase ${num}${phaseNames[num] ? `: ${phaseNames[num]}` : ''} — see \`${dir}\``);
  }
  lines.push('');
  return lines.join('\n');
}

function appendToMilestonesMd(currentContent, digest) {
  const trimmed = currentContent.replace(/\s+$/, '');
  return trimmed + '\n\n' + digest.trim() + '\n';
}

// ---------- write-summary ----------

const KEY_DECISIONS_ERROR = "Error: 'key-decisions' is required and must have ≥1 entry. See spec at docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md";

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'EVALIDATION';
  }
}

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

function parsePlanId(planId) {
  const m = String(planId).match(/^(\d+(?:\.\d+)?)-(\d+)$/);
  if (!m) throw new Error(`Invalid plan id "${planId}" — expected "NN-MM" (e.g. "01-02").`);
  const phaseNum = /^\d+$/.test(m[1]) ? String(parseInt(m[1], 10)) : m[1];
  return { phaseNum, planSeq: m[2], id: `${m[1]}-${m[2]}` };
}

function _normaliseSummary(input) {
  const out = {};
  const aliases = {
    subsystems: 'subsystem',
    files_created: ['key-files', 'created'],
    files_modified: ['key-files', 'modified'],
    requirements_completed: 'requirements-completed',
    key_decisions: 'key-decisions',
    patterns_established: 'patterns-established',
    tech_stack: 'tech-stack',
  };
  for (const [k, v] of Object.entries(input || {})) {
    const target = aliases[k];
    if (Array.isArray(target)) {
      out[target[0]] = out[target[0]] || {};
      out[target[0]][target[1]] = v;
    } else if (typeof target === 'string') {
      if (target === 'subsystem' && Array.isArray(v)) out.subsystem = v[0];
      else out[target] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

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
  const keyDecisions = normalised['key-decisions'];
  if (!Array.isArray(keyDecisions) || keyDecisions.length === 0) {
    throw new ValidationError(KEY_DECISIONS_ERROR);
  }
  if (!('phase' in normalised)) normalised.phase = parseInt(phaseNum, 10);
  if (!('plan' in normalised)) normalised.plan = id;
  if (!('completed' in normalised)) normalised.completed = new Date().toISOString().slice(0, 10);

  const text = fm.stringify(normalised, body || `# Summary ${id}\n\nPlan ${id} completed.\n`);
  if (!dryRun) writeFile(summaryPath, text);
  return { path: summaryPath, action: dryRun ? 'dryrun' : 'written', fm: normalised };
}

// ---------- ROADMAP collapse ----------

/**
 * Wrap the milestone heading + every phase block belonging to it in a
 * `<details>` block, and rewrite the `## Milestones` bullet for this
 * milestone to ✅ shipped.
 *
 * Preserves every phase block byte-for-byte (so GSD parsers still see
 * the same `### Phase N: ...` headings inside the <details>).
 */
function collapseMilestoneInRoadmap(content, milestoneName, isoDate) {
  const info = findMilestoneInRoadmap(content, milestoneName);
  if (!info) return { content, changed: false, reason: 'milestone-not-found' };

  // Find the milestone heading line and the end of its block in `## Phases`.
  const phasesStart = content.search(/^##\s+Phases\s*$/m);
  if (phasesStart === -1)
    return { content, changed: false, reason: 'phases-section-missing' };
  const after = content.slice(phasesStart);
  const nextH2Rel = after.slice(2).search(/^##\s+/m);
  const phasesEnd = nextH2Rel === -1 ? content.length : phasesStart + 2 + nextH2Rel;

  // Locate the milestone heading inside phases section.
  // Allow an optional leading emoji/picto cluster before the milestone name.
  const escName = escapeRegex(info.name);
  const headingRe = new RegExp(
    `^###\\s+(?:[\\s\\p{Emoji_Presentation}\\p{Extended_Pictographic}\\u2705\\u2611\\u2713\\u2714\\u2728]+)?${escName}[^\\n]*$`,
    'mu'
  );
  const headingMatch = content.slice(phasesStart, phasesEnd).match(headingRe);
  if (!headingMatch)
    return { content, changed: false, reason: 'milestone-heading-not-found' };
  const headingRelative = content.slice(phasesStart, phasesEnd).indexOf(headingMatch[0]);
  const headingAbs = phasesStart + headingRelative;

  // Block ends at the next `### ` that is a milestone heading (not a phase),
  // or at phasesEnd. We need to include ALL phase headings under this milestone
  // but stop at the next milestone heading.
  const restRel = content.slice(headingAbs + headingMatch[0].length, phasesEnd);
  const nextMilestoneRel = restRel.search(
    /^###\s+(?:[\s\p{Emoji_Presentation}\p{Extended_Pictographic}\u2705\u2611\u2713\u2714\u2728]+)(?!Phase\s)/mu
  );
  const blockEnd =
    nextMilestoneRel === -1
      ? phasesEnd
      : headingAbs + headingMatch[0].length + nextMilestoneRel;

  const original = content.slice(headingAbs, blockEnd).replace(/\s+$/, '');
  const first = info.phases[0];
  const last = info.phases[info.phases.length - 1];

  // Rewrite the heading INSIDE the details so it shows shipped status for
  // anyone reading the collapsed block, but ALSO keep all the `### Phase N`
  // blocks unchanged. We replace just the milestone heading line.
  const innerBody = original.replace(headingRe, '').replace(/^\n+/, '');
  const wrapped =
    `<details>\n<summary>\u2705 ${info.name} (Phases ${first}-${last}) \u2014 SHIPPED ${isoDate}</summary>\n\n` +
    innerBody.trim() +
    `\n\n</details>`;

  const next = content.slice(0, headingAbs) + wrapped + '\n' + content.slice(blockEnd);

  // Now update the `## Milestones` bullet (above `## Phases`):
  const updated = next.replace(
    new RegExp(
      `^-\\s+[\\s\\p{Emoji_Presentation}\\p{Extended_Pictographic}\\u2705\\u2611\\u2713\\u2714\\u2728]+\\*\\*${escName}\\*\\*[^\\n]*$`,
      'mu'
    ),
    `- \u2705 **${info.name}** \u2014 Phases ${first}-${last} (shipped ${isoDate})`
  );

  return { content: updated, changed: true };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  findMilestoneInRoadmap,
  verifyMilestoneComplete,
  readSummaries,
  aggregateSummaries,
  promoteMilestoneContext,
  renderDigest,
  appendToMilestonesMd,
  writeSummary,
  ValidationError,
  collapseMilestoneInRoadmap,
};
