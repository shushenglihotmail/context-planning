'use strict';

/**
 * lib/hooks.js — git hook installer + smart-shim helpers (phase 27).
 *
 * The smart-shim model: .git/hooks/pre-commit (and later post-commit) is a
 * one-line script that execs `node <pluginRoot>/bin/cp-hook.js <event>`.
 * All real logic lives in bin/cp-hook.js, so upgrading the cp package
 * upgrades hook behavior — no reinstall required. The shim discovers all
 * cp projects under the enclosing git root and dispatches per-project.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOOK_SENTINEL = '# cp:hook v1';
const HOOKS = ['pre-commit']; // phase 28 will add 'post-commit'

function gitRoot(start = process.cwd()) {
  try {
    const out = execSync('git rev-parse --show-toplevel', {
      cwd: start,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out || null;
  } catch (_) {
    return null;
  }
}

/**
 * Walk under `root` looking for `.planning/STATE.md` markers. Returns
 * absolute project roots (the dir CONTAINING `.planning/`). Skips common
 * heavy / vendored dirs and respects `maxDepth` (default 4 dirs deep).
 */
function findCpProjects(root, opts = {}) {
  const maxDepth = Number.isFinite(opts.maxDepth)
    ? opts.maxDepth
    : Number(process.env.CP_HOOK_MAXDEPTH) || 4;
  const skip = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'out',
    'coverage',
    '.next',
    '.cache',
    'target',
    'vendor',
  ]);
  const found = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    // If this dir contains .planning/STATE.md, record it.
    const stateP = path.join(dir, '.planning', 'STATE.md');
    if (fs.existsSync(stateP)) {
      found.push(dir);
      // Don't recurse INTO a cp project looking for nested ones; rare
      // and the discovery semantics get weird. Continue siblings only.
    } else {
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (skip.has(e.name)) continue;
        if (e.name.startsWith('.') && e.name !== '.planning') continue;
        walk(path.join(dir, e.name), depth + 1);
      }
    }
  }
  walk(root, 0);
  // Deterministic order for tests + commit diffs.
  return found.sort();
}

function _hookPath(gitDir, name) {
  return path.join(gitDir, 'hooks', name);
}

function _hookScript(pluginRoot, event) {
  const shimRel = path.relative(
    process.cwd(),
    path.join(pluginRoot, 'bin', 'cp-hook.js')
  );
  // Use absolute path inside the script for portability across repos.
  const shim = path.join(pluginRoot, 'bin', 'cp-hook.js');
  // POSIX form; Windows git for-windows runs hooks via sh.
  return (
    '#!/bin/sh\n' +
    HOOK_SENTINEL +
    '\n' +
    `exec node "${shim.replace(/\\/g, '/')}" ${event} "$@"\n`
  );
}

function _ownsHook(content) {
  return typeof content === 'string' && content.includes(HOOK_SENTINEL);
}

/**
 * Install cp hooks into <gitRoot>/.git/hooks/. Refuses to overwrite a hook
 * we don't own unless `force=true`. Returns { installed, skipped, gitDir }.
 */
function installHooks(repoGitRoot, opts = {}) {
  const force = !!opts.force;
  const pluginRoot = opts.pluginRoot || path.resolve(__dirname, '..');
  const gitDir = _gitDir(repoGitRoot);
  if (!gitDir) {
    throw new Error(`not a git repo: ${repoGitRoot}`);
  }
  fs.mkdirSync(path.join(gitDir, 'hooks'), { recursive: true });
  const installed = [];
  const skipped = [];
  for (const name of HOOKS) {
    const p = _hookPath(gitDir, name);
    let existing = null;
    try {
      existing = fs.readFileSync(p, 'utf8');
    } catch (_) {
      existing = null;
    }
    if (existing && !_ownsHook(existing) && !force) {
      skipped.push({ name, path: p, reason: 'user-owned' });
      continue;
    }
    fs.writeFileSync(p, _hookScript(pluginRoot, name));
    try {
      fs.chmodSync(p, 0o755);
    } catch (_) {
      // Windows — chmod is a no-op; that's fine, git on Windows treats
      // hook files as executable regardless of POSIX mode bits.
    }
    installed.push({ name, path: p });
  }
  return { installed, skipped, gitDir };
}

/**
 * Remove cp-owned hooks. Leaves user-owned hooks intact. Returns
 * { removed, skipped, gitDir }.
 */
function uninstallHooks(repoGitRoot) {
  const gitDir = _gitDir(repoGitRoot);
  if (!gitDir) {
    throw new Error(`not a git repo: ${repoGitRoot}`);
  }
  const removed = [];
  const skipped = [];
  for (const name of HOOKS) {
    const p = _hookPath(gitDir, name);
    let existing = null;
    try {
      existing = fs.readFileSync(p, 'utf8');
    } catch (_) {
      continue;
    }
    if (!_ownsHook(existing)) {
      skipped.push({ name, path: p, reason: 'user-owned' });
      continue;
    }
    fs.unlinkSync(p);
    removed.push({ name, path: p });
  }
  return { removed, skipped, gitDir };
}

/**
 * Report installation status of each managed hook. Returns
 * [{ name, exists, ownedByCp, path }].
 */
function hookStatus(repoGitRoot) {
  const gitDir = _gitDir(repoGitRoot);
  if (!gitDir) return [];
  return HOOKS.map((name) => {
    const p = _hookPath(gitDir, name);
    let content = null;
    try {
      content = fs.readFileSync(p, 'utf8');
    } catch (_) {
      content = null;
    }
    return {
      name,
      path: p,
      exists: content !== null,
      ownedByCp: _ownsHook(content),
    };
  });
}

function _gitDir(repoGitRoot) {
  const candidate = path.join(repoGitRoot, '.git');
  let stat;
  try {
    stat = fs.statSync(candidate);
  } catch (_) {
    return null;
  }
  if (stat.isDirectory()) return candidate;
  if (stat.isFile()) {
    // git worktree / submodule: contains "gitdir: <path>"
    try {
      const raw = fs.readFileSync(candidate, 'utf8').trim();
      const m = raw.match(/^gitdir:\s*(.+)$/m);
      if (m) {
        const target = path.isAbsolute(m[1])
          ? m[1]
          : path.resolve(repoGitRoot, m[1]);
        return target;
      }
    } catch (_) {
      return null;
    }
  }
  return null;
}

module.exports = {
  HOOK_SENTINEL,
  HOOKS,
  gitRoot,
  findCpProjects,
  installHooks,
  uninstallHooks,
  hookStatus,
  // exposed for tests
  _gitDir,
  _hookPath,
  _hookScript,
  _ownsHook,
};
