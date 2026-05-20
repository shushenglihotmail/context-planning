'use strict';

/**
 * Tiny path resolver for the cp plugin. No external deps.
 */

const path = require('path');
const fs = require('fs');

function repoRoot() {
  // walk up from cwd until we find .git or a package.json
  let dir = process.cwd();
  for (let i = 0; i < 12; i++) {
    if (
      fs.existsSync(path.join(dir, '.git')) ||
      fs.existsSync(path.join(dir, '.planning'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function planningDir(root = repoRoot()) {
  return path.join(root, '.planning');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function pluginRoot() {
  // bin/cp.js -> ../
  return path.resolve(__dirname, '..');
}

function templatePath(name) {
  return path.join(pluginRoot(), 'templates', name);
}

function readTemplate(name) {
  return fs.readFileSync(templatePath(name), 'utf8');
}

/**
 * Format a phase number for use in directory names and filename prefixes.
 * Integer phases get zero-padded to width 2 ("1" -> "01"). Decimal phases
 * keep their natural form ("2.1" stays "2.1"). Matches GSD conventions.
 */
function padPhaseNum(num) {
  const s = String(num);
  if (/^\d+$/.test(s)) return s.padStart(2, '0');
  return s; // decimal like "2.1"
}

function padPlanNum(num) {
  return String(num).padStart(2, '0');
}

/** Slugify a phase name for the directory portion of phases/XX-name. */
function slugifyPhase(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'phase';
}

/** "01-foundation" given phase 1, name "Foundation". */
function phaseDirName(phaseNum, phaseName) {
  return `${padPhaseNum(phaseNum)}-${slugifyPhase(phaseName)}`;
}

/** Full path to a phase directory. */
function phaseDir(phaseNum, phaseName, root = repoRoot()) {
  return path.join(planningDir(root), 'phases', phaseDirName(phaseNum, phaseName));
}

/** Filename prefix "01-02" for phase 1, plan 2. */
function phasePlanPrefix(phaseNum, planNum) {
  return `${padPhaseNum(phaseNum)}-${padPlanNum(planNum)}`;
}

/** Full path to a phase plan file: .planning/phases/01-foundation/01-02-PLAN.md */
function planFile(phaseNum, phaseName, planNum, root = repoRoot()) {
  return path.join(
    phaseDir(phaseNum, phaseName, root),
    `${phasePlanPrefix(phaseNum, planNum)}-PLAN.md`
  );
}

/** Full path to a phase summary file. */
function summaryFile(phaseNum, phaseName, planNum, root = repoRoot()) {
  return path.join(
    phaseDir(phaseNum, phaseName, root),
    `${phasePlanPrefix(phaseNum, planNum)}-SUMMARY.md`
  );
}

/** Full path to a phase DESIGN.md file. Resolves the phase dir on disk first
 *  so callers can pass just the phase number. Returns null if no phase dir. */
function designFile(phaseNumOrSlug, root = repoRoot()) {
  const dir = findPhaseDir(phaseNumOrSlug, root);
  if (!dir) return null;
  return path.join(dir, 'DESIGN.md');
}

/** Slugify a milestone name (e.g. "v0.7 Design Capture" -> "v0-7-design-capture"). */
function milestoneSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'milestone';
}

/** Full path to a milestone directory: .planning/milestones/<slug>/ */
function milestoneDir(milestoneName, root = repoRoot()) {
  return path.join(planningDir(root), 'milestones', milestoneSlug(milestoneName));
}

/** Full path to a milestone DESIGN.md file. */
function milestoneDesignFile(milestoneName, root = repoRoot()) {
  return path.join(milestoneDir(milestoneName, root), 'DESIGN.md');
}

/** Locate the existing phase dir for a number, scanning the filesystem.
 *  Accepts either a phase number (e.g. `'3'`, `3`, `'3.1'`) or a full slug
 *  (e.g. `'03-sharing'`). Returns the absolute path, or null if not found. */
function findPhaseDir(phaseNumOrSlug, root = repoRoot()) {
  const phasesRoot = path.join(planningDir(root), 'phases');
  if (!fs.existsSync(phasesRoot)) return null;
  const input = String(phaseNumOrSlug);
  const entries = fs.readdirSync(phasesRoot);

  // Exact dir-name match first (slug case).
  if (entries.includes(input)) return path.join(phasesRoot, input);

  // Otherwise treat input as a phase number and match by "NN-" prefix.
  const prefix = padPhaseNum(input) + '-';
  const hit = entries.find((n) => n.startsWith(prefix));
  return hit ? path.join(phasesRoot, hit) : null;
}

/** Quick task dir: .planning/quick/YYYYMMDD-slug/ */
function quickDirName(slug, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}-${slug}`;
}

function quickDir(slug, root = repoRoot(), date = new Date()) {
  return path.join(planningDir(root), 'quick', quickDirName(slug, date));
}

module.exports = {
  repoRoot,
  planningDir,
  ensureDir,
  pluginRoot,
  templatePath,
  readTemplate,
  padPhaseNum,
  padPlanNum,
  slugifyPhase,
  phaseDirName,
  phaseDir,
  phasePlanPrefix,
  planFile,
  summaryFile,
  designFile,
  milestoneSlug,
  milestoneDir,
  milestoneDesignFile,
  findPhaseDir,
  quickDirName,
  quickDir,
};
