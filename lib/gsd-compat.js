'use strict';

/**
 * GSD compatibility helpers.
 *
 * cp's state-document format is a SUPERSET of GSD's: same filenames, same
 * frontmatter keys, plus cp-specific behavior driven by a `cp` block inside
 * `.planning/config.json` (which GSD ignores as an unknown top-level key).
 *
 * This module:
 *   - Detects whether a project was created/managed by GSD.
 *   - Detects whether a project's .planning/ is already cp-aware.
 *   - Reports interop diagnostics for `cp doctor`.
 *
 * No mutating helpers — repairs are user-initiated via `cp config set` or
 * dedicated commands (eventually `cp gsd-import`).
 */

const fs = require('fs');
const path = require('path');
const { planningDir, repoRoot } = require('./paths');

/** Sentinel files/dirs that strongly indicate "this is a GSD project".
 *  These are things GSD creates but cp does NOT. Items removed over time:
 *  - MILESTONES.md — cp also writes it (via `cp init` + `cp complete-milestone`).
 *  - .planning/codebase — cp also writes it (via `cp scaffold-codebase` /
 *    /cp-map-codebase, v0.3.2+).
 *  - Short-form PLAN.md / SUMMARY.md — cp emits these by design (v0.3+). */
const GSD_SENTINELS = [
  '.planning/research',
  '.planning/todos',
  '.planning/seeds',
  '.planning/REQUIREMENTS.md',
  '.planning/DEBUG.md',
  '.planning/SECURITY.md',
];

const SHARED_FILES = [
  '.planning/PROJECT.md',
  '.planning/ROADMAP.md',
  '.planning/STATE.md',
  '.planning/config.json',
];

function fileExists(rel, root) {
  return fs.existsSync(path.join(root, rel));
}

/** True if .planning/ exists at all. */
function hasPlanning(root = repoRoot()) {
  return fs.existsSync(planningDir(root));
}

/** True if any of the GSD-only sentinels exist. */
function isGsdProject(root = repoRoot()) {
  return GSD_SENTINELS.some((s) => fileExists(s, root));
}

/** True if the merged config has a `cp` block (i.e., cp-initialised). */
function isCpAware(root = repoRoot()) {
  const cfg = path.join(planningDir(root), 'config.json');
  if (!fs.existsSync(cfg)) return false;
  try {
    const c = JSON.parse(fs.readFileSync(cfg, 'utf8'));
    return !!(c && typeof c === 'object' && c.cp && typeof c.cp === 'object');
  } catch {
    return false;
  }
}

/** Find shared files that are present. */
function presentSharedFiles(root = repoRoot()) {
  return SHARED_FILES.filter((s) => fileExists(s, root));
}

/** Find phase dirs scanned from .planning/phases/. */
function scanPhases(root = repoRoot()) {
  const phasesDir = path.join(planningDir(root), 'phases');
  if (!fs.existsSync(phasesDir)) return [];
  return fs
    .readdirSync(phasesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const dir = path.join(phasesDir, e.name);
      const files = fs.readdirSync(dir);
      // Count GSD-style {phase}-{plan}-PLAN.md vs short PLAN.md
      const planFiles = files.filter((f) => /-PLAN\.md$/.test(f));
      const summaryFiles = files.filter((f) => /-SUMMARY\.md$/.test(f));
      const hasShortPlan = files.includes('PLAN.md');
      const hasShortSummary = files.includes('SUMMARY.md');
      return {
        name: e.name,
        path: dir,
        planFiles,
        summaryFiles,
        hasShortPlan,
        hasShortSummary,
      };
    });
}

/**
 * Compute a status report suitable for `cp doctor`.
 */
function report(root = repoRoot()) {
  const r = {
    planning: hasPlanning(root),
    cpAware: isCpAware(root),
    gsdProject: isGsdProject(root),
    sharedFiles: presentSharedFiles(root),
    phases: scanPhases(root),
    warnings: [],
  };

  if (r.planning && !r.cpAware) {
    r.warnings.push(
      '.planning/ exists but has no `cp` block in config.json. Run `cp init` ' +
        'to add cp settings without touching existing files.'
    );
  }
  if (r.gsdProject && r.cpAware) {
    r.warnings.push(
      'GSD sentinels detected (research/ / todos/ / seeds/ / REQUIREMENTS.md). ' +
        'cp will read GSD-shaped state and write GSD-compatible filenames. ' +
        'Switch back to GSD any time — `cp` only ADDS to .planning/, never ' +
        'rewrites GSD files.'
    );
  }
  for (const p of r.phases) {
    // Short-form `PLAN.md` / `SUMMARY.md` are cp-canonical (cp emits them by
    // design — see `lib/lifecycle.js scaffoldPhase`). They round-trip through
    // `cp gsd-import` cleanly. Only warn on the genuinely-broken case where
    // BOTH a short-form AND long-form `{NN-MM}-PLAN.md` coexist in the same
    // phase dir (the parser would have to pick one, and that's ambiguous).
    //
    // v0.3.3 — closes CONCERNS High: "cp scaffolds short-form PLAN.md, then
    // cp doctor warns the same shape is GSD-incompatible."
    if (p.hasShortPlan && p.planFiles.length > 0) {
      r.warnings.push(
        `Phase ${p.name} has BOTH short-form PLAN.md AND long-form ` +
          `${p.planFiles.join(', ')}. Pick one — cp's canonical shape is ` +
          `short-form PLAN.md; the long-form files exist for GSD round-trip only.`
      );
    }
    if (p.hasShortSummary && p.summaryFiles.length > 0) {
      r.warnings.push(
        `Phase ${p.name} has BOTH short-form SUMMARY.md AND long-form ` +
          `${p.summaryFiles.join(', ')}. Pick one — cp writes per-plan ` +
          `{NN-MM}-SUMMARY.md files via \`cp write-summary\`.`
      );
    }
  }
  return r;
}

module.exports = {
  GSD_SENTINELS,
  SHARED_FILES,
  hasPlanning,
  isGsdProject,
  isCpAware,
  presentSharedFiles,
  scanPhases,
  report,
};
