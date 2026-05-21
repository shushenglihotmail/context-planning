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

module.exports = {
  headSha,
  _resetWarnedForTests,
};
