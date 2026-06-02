#!/usr/bin/env node
/**
 * Backfill `expected_files` frontmatter into legacy PLAN.md files.
 *
 * v1.9.0 introduced an audit pass that emits a warning for every sub-plan
 * whose PLAN.md does not declare `expected_files` (or the legacy
 * `expected-key-files`). Phases authored before v1.9.0 don't have it, so
 * `cp update` floods the terminal with one warning per sub-plan.
 *
 * Strategy:
 *   1. For each phase directory under .planning/phases/:
 *      - skip if PLAN.md already has `expected_files` (array) or
 *        `expected-key-files`.
 *      - read `base-commit` from PLAN.md frontmatter (phase start)
 *      - collect `end-commit` from every `<id>-SUMMARY.md`
 *      - resolve the latest end-commit, diff base..end with git
 *      - filter out .planning/**, node_modules/**, lock files, etc.
 *      - write `expected_files: [...]` (flat array, union over sub-plans).
 *   2. Dry-run by default; pass --write to actually modify files.
 *   3. Commit separately so a revert is one command.
 *
 * Phases lacking commit anchors (very old / hand-authored) are reported as
 * "skipped: no anchors" — those need manual treatment if you care.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const fm = require('../lib/frontmatter');

const REPO_ROOT = path.resolve(__dirname, '..');
const PHASES_DIR = path.join(REPO_ROOT, '.planning', 'phases');
const WRITE = process.argv.includes('--write');
const VERBOSE = process.argv.includes('--verbose');

// File patterns to exclude from expected_files.
const EXCLUDE_RE = [
  /^\.planning\//,
  /^node_modules\//,
  /^package-lock\.json$/,
  /^\.gitignore$/,
];

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

function commitExists(sha) {
  if (!sha || typeof sha !== 'string') return false;
  try {
    git(['cat-file', '-e', `${sha}^{commit}`]);
    return true;
  } catch (_) {
    return false;
  }
}

function diffFiles(baseSha, endSha) {
  // `git diff --name-only A..B` lists files that differ.
  const out = git(['diff', '--name-only', `${baseSha}..${endSha}`]);
  return out.split(/\r?\n/).filter(Boolean);
}

function filterFiles(files) {
  const kept = [];
  for (const f of files) {
    if (EXCLUDE_RE.some((re) => re.test(f))) continue;
    kept.push(f);
  }
  return Array.from(new Set(kept)).sort();
}

function loadFm(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return { text, ...fm.parse(text) };
  } catch (_) {
    return null;
  }
}

function processPhase(phaseDir) {
  const phaseName = path.basename(phaseDir);
  const planPath = path.join(phaseDir, 'PLAN.md');
  if (!fs.existsSync(planPath)) {
    return { phase: phaseName, status: 'skipped', reason: 'no PLAN.md' };
  }
  const plan = loadFm(planPath);
  if (!plan) return { phase: phaseName, status: 'skipped', reason: 'unparsable PLAN.md' };

  const fmObj = plan.frontmatter || {};

  // Already declared — leave alone.
  if (Array.isArray(fmObj.expected_files)) {
    return { phase: phaseName, status: 'skipped', reason: 'already has expected_files' };
  }
  if ('expected-key-files' in fmObj) {
    return { phase: phaseName, status: 'skipped', reason: 'has legacy expected-key-files' };
  }

  const baseCommit = fmObj['base-commit'] || fmObj['base_commit'];
  if (!commitExists(baseCommit)) {
    return { phase: phaseName, status: 'skipped', reason: `base-commit missing/unknown (${baseCommit || 'none'})` };
  }

  // Gather end-commits from all sibling SUMMARY files.
  const endCommits = [];
  for (const entry of fs.readdirSync(phaseDir)) {
    if (!/-SUMMARY\.md$/.test(entry)) continue;
    const sum = loadFm(path.join(phaseDir, entry));
    if (!sum) continue;
    const end = sum.frontmatter && (sum.frontmatter['end-commit'] || sum.frontmatter['end_commit']);
    if (commitExists(end)) endCommits.push(end);
  }
  if (endCommits.length === 0) {
    return { phase: phaseName, status: 'skipped', reason: 'no end-commit in any SUMMARY' };
  }

  // Compute union of files changed across all sub-plan windows.
  // Simpler & equivalent: diff base..<each end>, union the results.
  const union = new Set();
  for (const end of endCommits) {
    try {
      for (const f of diffFiles(baseCommit, end)) union.add(f);
    } catch (e) {
      if (VERBOSE) console.error(`  [warn] ${phaseName}: diff ${baseCommit}..${end} failed: ${e.message}`);
    }
  }
  const files = filterFiles(Array.from(union));
  // files.length === 0 is a *valid* outcome here: the phase only touched
  // excluded paths (most commonly .planning/**, e.g. docs-only or
  // milestone-bookkeeping phases). An empty array silences the audit
  // warning per lib/milestone.js comment: "Empty list [] = explicitly no
  // files expected; skip diff/warn (no fallback)."

  // Mutate frontmatter and write.
  fmObj.expected_files = files;
  const newText = fm.stringify(fmObj, plan.body);

  if (WRITE) fs.writeFileSync(planPath, newText);
  return { phase: phaseName, status: WRITE ? 'written' : 'would-write', count: files.length };
}

function main() {
  if (!fs.existsSync(PHASES_DIR)) {
    console.error(`No phases dir at ${PHASES_DIR}`);
    process.exit(1);
  }
  const dirs = fs
    .readdirSync(PHASES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(PHASES_DIR, d.name))
    .sort();

  const results = dirs.map(processPhase);
  const byStatus = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  for (const r of results) {
    if (r.status === 'written' || r.status === 'would-write') {
      console.log(`${r.status === 'written' ? '✓' : '·'} ${r.phase}: ${r.count} files`);
    } else if (VERBOSE) {
      console.log(`- ${r.phase}: ${r.reason}`);
    }
  }
  console.log('\nSummary:', byStatus, WRITE ? '(write mode)' : '(dry-run; pass --write to apply)');

  // Also list skipped phases by reason so we know what's left over.
  const skippedReasons = {};
  for (const r of results) {
    if (r.status !== 'skipped') continue;
    skippedReasons[r.reason] = (skippedReasons[r.reason] || 0) + 1;
  }
  if (Object.keys(skippedReasons).length) {
    console.log('Skipped reasons:', skippedReasons);
  }
}

main();
