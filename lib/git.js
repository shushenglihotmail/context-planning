'use strict';

/**
 * lib/git.js — minimal git helpers shared across cp lifecycle code.
 *
 * v0.8 P1 (SHA pinning foundation): `headSha()` returns the current
 * `git rev-parse HEAD` for the working tree (or `null` if git is
 * unavailable, the directory is not a git repo, or the repo has no
 * commits yet). Never throws. Emits a one-line stderr warning the
 * first time it is unable to resolve a SHA (per process), so users
 * understand why `base-commit` / `end-commit` frontmatter is missing.
 *
 * Design notes:
 *  - Pure helper; no module-level fs/state beyond the warned flag.
 *  - Uses spawnSync (no shell) — same pattern as lib/worktree.js.
 *  - Caller passes cwd explicitly (matches the rest of cp's API style).
 */

const { spawnSync } = require('child_process');

let _warned = false;

/**
 * Get the current git HEAD SHA, or null when unavailable.
 *
 * @param {Object} [opts]
 * @param {string} [opts.cwd=process.cwd()] - directory to inspect
 * @returns {string|null} 40-char hex SHA or null
 */
function headSha(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  let result;
  try {
    result = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    });
  } catch (err) {
    _warnOnce();
    return null;
  }
  if (result.error && result.error.code === 'ENOENT') {
    // git not on PATH
    _warnOnce();
    return null;
  }
  if (result.status !== 0) {
    // Not a git repo, or no commits yet, or detached without a valid HEAD.
    return null;
  }
  const sha = String(result.stdout || '').trim();
  if (!/^[0-9a-f]{7,64}$/i.test(sha)) {
    return null;
  }
  return sha;
}

function _warnOnce() {
  if (_warned) return;
  _warned = true;
  try {
    process.stderr.write('cp: git not found — SHA pinning skipped\n');
  } catch (_) {
    /* ignore stderr write failures */
  }
}

/** Test-only: reset the one-shot warned flag. Not exported in production paths. */
function _resetWarnedForTests() {
  _warned = false;
}

/**
 * Run `git diff -z --name-status <base>..<end>` and parse the NUL-separated
 * output into structured entries. Robust to spaces / unicode / quotes in
 * paths. v0.8 P2.
 *
 * Status codes from git: 'A' added, 'M' modified, 'D' deleted, 'R<NN>'
 * renamed, 'C<NN>' copied, 'T' type-change, 'U' unmerged. Renames/copies
 * are emitted as `<status>\0<old>\0<new>`; we normalise to a single entry
 * with `status: 'M'` and `path: <new>` (the new path is the deliverable).
 *
 * @param {string} base - base git SHA (or any rev-spec)
 * @param {string} end  - end git SHA (or any rev-spec)
 * @param {Object} [opts]
 * @param {string} [opts.cwd=process.cwd()]
 * @returns {Array<{path: string, status: 'A'|'M'|'D'}>} empty on any error
 */
function diffNameOnly(base, end, opts = {}) {
  if (!base || !end || typeof base !== 'string' || typeof end !== 'string') {
    return [];
  }
  const cwd = opts.cwd || process.cwd();
  let result;
  try {
    result = spawnSync(
      'git',
      ['diff', '-z', '--name-status', `${base}..${end}`],
      { cwd, encoding: 'utf8' }
    );
  } catch (err) {
    return [];
  }
  if (result.error || result.status !== 0) return [];
  const raw = String(result.stdout || '');
  if (!raw) return [];

  // Parse NUL-separated stream: each entry is either
  //   <status>\0<path>\0          (for A/M/D/T)
  //   <status><score>\0<old>\0<new>\0   (for R/C, score is 0-100)
  const tokens = raw.split('\0').filter((t) => t.length > 0);
  const out = [];
  for (let i = 0; i < tokens.length; ) {
    const status = tokens[i++];
    if (!status) break;
    const code = status[0];
    if (code === 'R' || code === 'C') {
      // rename / copy: consume old + new, normalise to modified-with-new-path
      const oldPath = tokens[i++];
      const newPath = tokens[i++];
      if (typeof newPath !== 'string') break;
      out.push({ path: newPath, status: 'M' });
    } else {
      const p = tokens[i++];
      if (typeof p !== 'string') break;
      const normalised = code === 'A' || code === 'D' ? code : 'M';
      out.push({ path: p, status: normalised });
    }
  }
  return out;
}

/**
 * Check whether a SHA exists as a reachable commit in the repo.
 * Used by `cp audit` to flag invalid base-commit / end-commit fields.
 *
 * @param {string} sha
 * @param {Object} [opts]
 * @param {string} [opts.cwd=process.cwd()]
 * @returns {boolean}
 */
function shaExists(sha, opts = {}) {
  if (!sha || typeof sha !== 'string' || !/^[0-9a-f]{7,64}$/i.test(sha.trim())) {
    return false;
  }
  const cwd = opts.cwd || process.cwd();
  let result;
  try {
    result = spawnSync('git', ['cat-file', '-e', `${sha.trim()}^{commit}`], {
      cwd,
      encoding: 'utf8',
    });
  } catch (_) { return false; }
  if (result.error) return false;
  return result.status === 0;
}

module.exports = {
  headSha,
  diffNameOnly,
  shaExists,
  _resetWarnedForTests,
};
