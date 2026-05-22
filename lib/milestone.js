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
const git = require('./git');

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

  // v0.10.1: Also detect milestones already collapsed into
  // `<details><summary>✅ {name} (Phases X-Y) — SHIPPED YYYY-MM-DD</summary>`.
  // The lib itself writes this format on completeMilestone; writing-plans
  // (Superpowers) and hand-collapses produce similar shapes. Tolerate
  // `-` / `—` / `–` dashes and any whitespace.
  //
  // We then walk the `### Phase N: ...` headings INSIDE the <details>
  // block (which are still markdown headings, just no longer attached
  // to a `### {name}` ancestor) and attribute them to the collapsed
  // milestone.
  const summaryRe = /<summary>\s*(?:[\u2705\u2611\u2713\u2714\u2728\s])*([^(<]+?)\s*\(Phases?\s+([\d.]+)\s*[-\u2013\u2014]\s*([\d.]+)\)\s*[-\u2013\u2014]\s*SHIPPED[^<]*<\/summary>/gi;
  let sm;
  while ((sm = summaryRe.exec(phasesSection)) !== null) {
    const name = sm[1].trim();
    if (!name || milestones[name]) continue;
    // Find phases listed inside this <details> block.
    const detailsStart = sm.index;
    const detailsClose = phasesSection.indexOf('</details>', detailsStart);
    const innerEnd = detailsClose === -1 ? phasesSection.length : detailsClose;
    const inner = phasesSection.slice(detailsStart, innerEnd);
    const innerPhases = [];
    const phRe = /^###\s+Phase\s+([\d.]+):/gim;
    let pm;
    while ((pm = phRe.exec(inner)) !== null) innerPhases.push(pm[1]);
    // Fall back to the X-Y range from the <summary> if no inner headings.
    // v0.10.3: expand integer ranges (e.g. "Phases 14-16" → ["14","15","16"]).
    // Non-integer ranges (e.g. "1.5-1.7") still fall back to the endpoints.
    let phases;
    if (innerPhases.length) {
      phases = innerPhases;
    } else {
      const from = Number(sm[2]);
      const to = Number(sm[3]);
      if (Number.isInteger(from) && Number.isInteger(to) && to >= from && (to - from) < 100) {
        phases = [];
        for (let n = from; n <= to; n++) phases.push(String(n));
      } else {
        phases = [sm[2], sm[3]];
      }
    }
    milestones[name] = { name, status: 'shipped', phases, headingIndex: detailsStart, collapsed: true };
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
  return { name: hit.name, status: hit.status, phases: hit.phases, collapsed: !!hit.collapsed };
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
      reports.push({
        phaseNum: num,
        name: null,
        plansDone: 0,
        plansTotal: 0,
        summariesPresent: [],
        summariesMissing: [],
        error: 'phase missing from ROADMAP',
        ok: false,
      });
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

  const _reviewSeen = new Set();
  const reviewLogRefs = [];
  let reviewCount = 0;
  for (const s of summaries) {
    if (!s) continue;
    const phase = s.phase || s.phaseNum;
    const phasePath = s.phasePath || s.phaseDir || s.path || null;
    if (!phasePath) continue;
    if (_reviewSeen.has(phase)) continue;
    const rlPath = path.join(phasePath, 'REVIEW-LOG.md');
    if (fs.existsSync(rlPath)) {
      _reviewSeen.add(phase);
      reviewLogRefs.push({ phase, path: rlPath });
      const body = fs.readFileSync(rlPath, 'utf8');
      const matches = body.match(/^##\s+\d{4}-\d{2}-\d{2}/gm);
      reviewCount += matches ? matches.length : 0;
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
    reviewLogRefs,
    reviewCount,
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

  // v0.9 P35: surface phase DESIGN.md refs (collected by aggregateSummaries
  // since v0.7 P16-01 but never rendered). Skip stub designs.
  if (Array.isArray(agg.phaseDesignRefs) && agg.phaseDesignRefs.length) {
    const nonStub = agg.phaseDesignRefs.filter((ref) => !_isStubDesign(ref.path));
    if (nonStub.length) {
      lines.push('**Phase designs:**');
      for (const ref of nonStub) {
        const rel = path.relative(process.cwd(), ref.path).split(path.sep).join('/');
        lines.push(`- Phase ${ref.phase} — \`${rel}\``);
      }
      lines.push('');
    }
  }

  // v0.9 P35: surface REVIEW-LOG.md refs + total entry count.
  if (Array.isArray(agg.reviewLogRefs) && agg.reviewLogRefs.length && agg.reviewCount > 0) {
    const phaseWord = agg.reviewLogRefs.length === 1 ? 'phase' : 'phases';
    lines.push(`**Reviews:** ${agg.reviewCount} entries across ${agg.reviewLogRefs.length} ${phaseWord}`);
    for (const ref of agg.reviewLogRefs) {
      const rel = path.relative(process.cwd(), ref.path).split(path.sep).join('/');
      lines.push(`- Phase ${ref.phase} — \`${rel}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Detect whether a phase DESIGN.md is still a template stub (untouched
 * after `cp scaffold-phase` created it). Used by renderDigest to avoid
 * surfacing empty designs.
 *
 * Heuristic: the scaffolded template contains the literal placeholder
 * `{Proposed | Accepted on YYYY-MM-DD` in its Status section. Real
 * designs overwrite that with a concrete status string.
 */
function _isStubDesign(designPath) {
  try {
    const body = fs.readFileSync(designPath, 'utf8');
    if (/\{Proposed \| Accepted on YYYY-MM-DD/.test(body)) return true;
    // Also treat designs whose Decision section is still the HTML-comment
    // placeholder as stubs.
    if (/## Decision\s*\n+<!-- What we decided/.test(body)) return true;
    return false;
  } catch (_) {
    return true;
  }
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
  const { dryRun = false, body, overwrite = false, autoKeyFiles = true, checkFileExistence = true, expectedCheck = true, strictExpected = false } = options;
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

  // v0.8 P1+P2: compute end SHA once; reuse for both end-commit stamping
  // (P1) and key-files auto-fill diff (P2).
  const endSha = normalised['end-commit'] || git.headSha({ cwd: root });

  // v0.8 P2: auto-fill key-files from `git diff base..end --name-status`.
  // Default on; opt out via { autoKeyFiles: false } or
  // `cp write-summary --no-auto-key-files`.
  const autoFill = _autoFillKeyFiles(normalised, root, phaseDir, endSha, { autoKeyFiles });
  if (autoFill.added > 0) {
    try {
      process.stderr.write(
        `cp: key-files auto-filled (${autoFill.added} files: ${autoFill.created.length} created, ${autoFill.modified.length} modified)\n`
      );
    } catch (_) { /* ignore */ }
  }

  // v0.8 P3 (Phase 19): refuse if any key-files path is missing on disk.
  // Runs AFTER auto-fill so diff-derived entries (always real) never
  // trigger it; only caller-supplied phantoms get blocked.
  const fileCheck = _checkKeyFilesExist(normalised, root, { checkFileExistence });
  if (fileCheck.missing.length > 0) {
    const lines = fileCheck.missing.map((m) => `  - ${m.path} (${m.kind})`).join('\n');
    throw new ValidationError(
      'key-files paths missing on disk (block at write-summary):\n' +
      lines + '\n\n' +
      'Either create these files first, list real paths, or pass\n' +
      '--no-file-check to bypass (will be audited later).'
    );
  }

  // v0.8 P5 (Phase 21): plan-time expected-key-files audit.
  // Runs AFTER P2 auto-fill so `normalised['key-files']` reflects the
  // actual diff. Soft by default (notice + key-decisions appendage);
  // hard-block when strictExpected is true.
  let expectedDrift = null;
  if (expectedCheck !== false) {
    const expected = _extractExpectedKeyFiles(phaseDir, id);
    if (expected !== null) {
      const diff = _diffExpectedVsActual(expected, normalised);
      if (diff.unexpected.length > 0 || diff.missingExpected.length > 0) {
        expectedDrift = diff;
        const decisionSentence = _formatDriftDecision(diff);
        if (strictExpected) {
          throw new ValidationError(
            `${decisionSentence}\n\n` +
            'Update expected-key-files in PLAN.md to reflect actual scope, ' +
            'or drop --strict-expected to record as a soft deviation.'
          );
        }
        // Soft: stderr notice + append to key-decisions.
        try {
          process.stderr.write(`cp: ${decisionSentence}\n`);
        } catch (_) { /* ignore */ }
        if (!Array.isArray(normalised['key-decisions'])) normalised['key-decisions'] = [];
        normalised['key-decisions'].push(decisionSentence);
      }
    }
  }

  // v0.8 P1: stamp end-commit if not already set by caller and git is
  // available. Forward-only.
  if (!('end-commit' in normalised) && endSha) {
    normalised['end-commit'] = endSha;
  }

  const text = fm.stringify(normalised, body || `# Summary ${id}\n\nPlan ${id} completed.\n`);
  if (!dryRun) {
    writeFile(summaryPath, text);
    // v0.8 P4 (Phase 20): regenerate STATE.md so it picks up the new summary.
    // Lazy require to avoid cyclic load (state -> lifecycle -> milestone).
    try { require('./state').regenerate(root); } catch (_) { /* never block */ }
  }
  return { path: summaryPath, action: dryRun ? 'dryrun' : 'written', fm: normalised, autoFill, expectedDrift };
}

// ---------- v0.8 P2: auto key-files at write-time ----------

/**
 * Pure helper: read `base-commit` from a phase's PLAN.md frontmatter.
 * Returns null if PLAN.md is missing or has no `base-commit` key.
 */
function _extractPhaseBaseCommit(phaseDir) {
  const planPath = path.join(phaseDir, 'PLAN.md');
  if (!fs.existsSync(planPath)) return null;
  let parsed;
  try {
    parsed = fm.parse(fs.readFileSync(planPath, 'utf8'));
  } catch (_) {
    return null;
  }
  const sha = (parsed && parsed.frontmatter && parsed.frontmatter['base-commit']) || null;
  if (typeof sha !== 'string' || !sha.trim()) return null;
  return sha.trim();
}

/**
 * Mutates `normalised['key-files']` in-place by union-merging entries
 * discovered via `git diff <PLAN.base-commit>..<endSha> --name-status`.
 * Caller-supplied entries are preserved and de-duped (caller wins on
 * ordering). `.planning/` paths are filtered out.
 *
 * Returns { added, created, modified } describing only what was newly
 * added by this call (for the caller's stderr notice).
 */
function _autoFillKeyFiles(normalised, root, phaseDir, endSha, opts = {}) {
  const result = { added: 0, created: [], modified: [] };
  if (opts.autoKeyFiles === false) return result;
  if (!endSha) return result;
  const baseSha = _extractPhaseBaseCommit(phaseDir);
  if (!baseSha) return result;
  if (baseSha === endSha) return result;

  const diff = git.diffNameOnly(baseSha, endSha, { cwd: root });
  if (!diff || diff.length === 0) return result;

  // Initialise key-files if absent. Preserve caller arrays.
  if (!normalised['key-files'] || typeof normalised['key-files'] !== 'object') {
    normalised['key-files'] = {};
  }
  const kf = normalised['key-files'];
  if (!Array.isArray(kf.created)) kf.created = [];
  if (!Array.isArray(kf.modified)) kf.modified = [];

  const existing = new Set([...kf.created, ...kf.modified]);
  for (const entry of diff) {
    if (!entry || typeof entry.path !== 'string') continue;
    if (entry.path.startsWith('.planning/')) continue;
    if (existing.has(entry.path)) continue;
    if (entry.status === 'A') {
      kf.created.push(entry.path);
      result.created.push(entry.path);
    } else {
      // M, D, R, C all collapse to "modified" for key-files purposes.
      kf.modified.push(entry.path);
      result.modified.push(entry.path);
    }
    existing.add(entry.path);
    result.added++;
  }
  return result;
}

// ---------- v0.8 P3: file-existence hard-block (Phase 19) ----------

/**
 * Pure helper: check that every path in `normalised['key-files'].created`
 * and `.modified` exists on disk relative to `root`. Returns
 * `{ missing: [{ path, kind }] }`.
 *
 * Bails on `opts.checkFileExistence === false` (returns empty missing).
 * Absolute paths are checked as-is (not joined with root). Non-string
 * entries are silently ignored.
 *
 * Does not throw — caller (writeSummary) decides whether to throw based
 * on the result.
 */
function _checkKeyFilesExist(normalised, root, opts = {}) {
  if (opts.checkFileExistence === false) return { missing: [] };
  const kf = (normalised && normalised['key-files']) || {};
  const candidates = [
    ...(Array.isArray(kf.created) ? kf.created.map((p) => ({ p, kind: 'created' })) : []),
    ...(Array.isArray(kf.modified) ? kf.modified.map((p) => ({ p, kind: 'modified' })) : []),
  ];
  const missing = [];
  for (const { p, kind } of candidates) {
    if (typeof p !== 'string' || !p) continue;
    const full = path.isAbsolute(p) ? p : path.join(root, p);
    if (!fs.existsSync(full)) missing.push({ path: p, kind });
  }
  return { missing };
}

// ---------- v0.8 P5: plan-time expected-key-files (Phase 21) ----------

/**
 * Pure helper: extract `expected-key-files` from a phase's PLAN.md
 * frontmatter.
 *
 * The field is OPTIONAL. Returns `null` when:
 *   - PLAN.md missing
 *   - frontmatter unparseable
 *   - `expected-key-files` key absent
 *   - value is not an array or object
 *
 * When present, two shapes are accepted:
 *
 *   1. Flat array — phase-wide expectation. Applies to every plan.
 *      ```yaml
 *      expected-key-files:
 *        - lib/foo.js
 *        - test/foo.js
 *      ```
 *      Returns that array verbatim (deduped).
 *
 *   2. Object keyed by plan id — per-plan expectation.
 *      ```yaml
 *      expected-key-files:
 *        21-01: [lib/foo.js]
 *        21-02: [bin/cli.js]
 *      ```
 *      Returns the union of: the current `planId`'s entry, plus every
 *      OTHER plan id whose `{planId}-SUMMARY.md` already exists in
 *      `phaseDir`. Rationale: write-summary diffs `base..end`, so by
 *      the time we write plan N the diff already includes work from
 *      every prior completed plan in the same phase.
 *
 * Unknown plan ids in the object form are ignored (warning surface
 * left to a future audit phase).
 */
function _extractExpectedKeyFiles(phaseDir, planId) {
  const planPath = path.join(phaseDir, 'PLAN.md');
  if (!fs.existsSync(planPath)) return null;
  let parsed;
  try {
    parsed = fm.parse(fs.readFileSync(planPath, 'utf8'));
  } catch (_) { return null; }
  const fmObj = parsed && parsed.frontmatter;
  if (!fmObj || !('expected-key-files' in fmObj)) return null;
  const raw = fmObj['expected-key-files'];

  if (Array.isArray(raw)) {
    return _dedupStrings(raw);
  }
  if (raw && typeof raw === 'object') {
    const union = new Set();
    // Always include current planId.
    const me = raw[planId];
    if (Array.isArray(me)) for (const x of me) if (typeof x === 'string') union.add(x);
    // Include every other plan id whose SUMMARY exists on disk.
    for (const k of Object.keys(raw)) {
      if (k === planId) continue;
      if (!Array.isArray(raw[k])) continue;
      const sumPath = path.join(phaseDir, `${k}-SUMMARY.md`);
      if (!fs.existsSync(sumPath)) continue;
      for (const x of raw[k]) if (typeof x === 'string') union.add(x);
    }
    return Array.from(union);
  }
  return null;
}

function _dedupStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    if (typeof x !== 'string') continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

/**
 * Pure helper: compute the symmetric difference between an `expected`
 * list (from PLAN.md) and the union of `normalised['key-files'].created`
 * and `.modified` (the actual files, post P2 auto-fill).
 *
 * Returns:
 *   {
 *     unexpected: string[],       // present in actual, absent from expected
 *     missingExpected: string[],  // present in expected, absent from actual
 *   }
 *
 * Path comparison is exact-string. .planning/-prefixed paths are
 * ignored on the actual side (same convention as P2). When `expected`
 * is null or undefined, returns both arrays empty (P5 disabled).
 */
function _diffExpectedVsActual(expected, normalised) {
  if (!Array.isArray(expected)) return { unexpected: [], missingExpected: [] };
  const kf = (normalised && normalised['key-files']) || {};
  const actual = new Set();
  const addAll = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const p of arr) {
      if (typeof p !== 'string' || !p) continue;
      if (p.startsWith('.planning/')) continue;
      actual.add(p);
    }
  };
  addAll(kf.created);
  addAll(kf.modified);
  const expectedSet = new Set(expected.filter((p) => typeof p === 'string' && p));
  const unexpected = [];
  for (const p of actual) if (!expectedSet.has(p)) unexpected.push(p);
  const missingExpected = [];
  for (const p of expectedSet) if (!actual.has(p)) missingExpected.push(p);
  return { unexpected, missingExpected };
}

/**
 * Format a single key-decisions sentence summarising drift. Used by
 * writeSummary to append soft notice to `normalised['key-decisions']`.
 */
function _formatDriftDecision(diff) {
  const parts = [];
  if (diff.unexpected.length > 0) {
    parts.push(`${diff.unexpected.length} unexpected (${diff.unexpected.join(', ')})`);
  }
  if (diff.missingExpected.length > 0) {
    parts.push(`${diff.missingExpected.length} expected-but-untouched (${diff.missingExpected.join(', ')})`);
  }
  if (parts.length === 0) return null;
  return `expected-vs-actual drift: ${parts.join('; ')}`;
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
  _extractPhaseBaseCommit,
  _autoFillKeyFiles,
  _checkKeyFilesExist,
  _extractExpectedKeyFiles,
  _diffExpectedVsActual,
  _formatDriftDecision,
};
