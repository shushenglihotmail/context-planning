'use strict';

/**
 * lib/registry.js — `cp` project registry.
 *
 * Records every project root that `cp` has been invoked from, so that
 * later commands (e.g. `cp quick --project <name>`) can resolve a
 * project name to an on-disk path.
 *
 * Design rules (see Phase 99 DESIGN.md):
 *   - Storage: `~/.config/cp/projects.json` on all platforms.
 *   - Last-write-wins via fs.renameSync.
 *   - Each worktree gets its own entry; same `name` may appear multiple
 *     times with different `path`s.
 *   - Touch is best-effort: failures are logged once to stderr and
 *     swallowed so a corrupt registry never breaks `cp`.
 *   - Zero external deps.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REGISTRY_REL = path.join('.config', 'cp', 'projects.json');

function registryPath() {
  const home = process.env.USERPROFILE || os.homedir();
  return path.join(home, REGISTRY_REL);
}

function _emptyDoc() {
  return { version: 1, projects: [] };
}

function read() {
  const p = registryPath();
  if (!fs.existsSync(p)) return _emptyDoc();
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    _warnOnce('read failed: ' + e.message);
    return _emptyDoc();
  }
  try {
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.projects)) {
      return _emptyDoc();
    }
    if (doc.version !== 1) {
      // Unknown version: treat as empty rather than blow up.
      return _emptyDoc();
    }
    return doc;
  } catch (e) {
    _warnOnce('parse failed: ' + e.message);
    return _emptyDoc();
  }
}

function write(doc) {
  const p = registryPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  const body = JSON.stringify(doc, null, 2) + '\n';
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, p);
}

/**
 * Walk up from `cwd` to find a directory containing `.planning/PROJECT.md`.
 * Returns the project root (containing `.planning/`) or null.
 */
function findProjectRoot(cwd) {
  let dir = path.resolve(cwd);
  for (let i = 0; i < 24; i++) {
    if (fs.existsSync(path.join(dir, '.planning', 'PROJECT.md'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** First H1 in a PROJECT.md (after optional frontmatter). Null if absent. */
function _readProjectName(projectRoot) {
  let raw;
  try {
    raw = fs.readFileSync(
      path.join(projectRoot, '.planning', 'PROJECT.md'),
      'utf8'
    );
  } catch (_e) {
    return null;
  }
  const lines = raw.split(/\r?\n/);
  let i = 0;
  if (lines[0] && lines[0].trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') i++;
    i++;
  }
  for (; i < lines.length; i++) {
    const m = /^#\s+(.+?)\s*$/.exec(lines[i]);
    if (m) return m[1].trim();
  }
  return null;
}

let _warned = false;
function _warnOnce(msg) {
  if (_warned) return;
  _warned = true;
  try { process.stderr.write(`[cp registry] ${msg}\n`); } catch (_e) {}
}

/**
 * Best-effort: register or touch the project rooted at `cwd`.
 * Never throws into the caller.
 */
function touchIfProject(cwd) {
  try {
    const root = findProjectRoot(cwd || process.cwd());
    if (!root) return false;
    const name = _readProjectName(root);
    if (!name) return false;
    const doc = read();
    const now = new Date().toISOString();
    const existing = doc.projects.find((p) => p.path === root);
    if (existing) {
      existing.last_seen_at = now;
      // Keep the name in sync if PROJECT.md was renamed.
      existing.name = name;
    } else {
      doc.projects.push({
        name,
        path: root,
        first_seen_at: now,
        last_seen_at: now,
      });
    }
    write(doc);
    return true;
  } catch (e) {
    _warnOnce('touch failed: ' + e.message);
    return false;
  }
}

/** Sorted (last_seen_at desc) copy of all registered projects. */
function list() {
  const doc = read();
  return [...doc.projects].sort((a, b) => {
    const av = a.last_seen_at || '';
    const bv = b.last_seen_at || '';
    if (av === bv) return 0;
    return av < bv ? 1 : -1;
  });
}

/**
 * Remove entries matching `nameOrPath`.
 * - opts.path: when set, only entry with exact path is removed.
 *   (Use this to disambiguate when a name has multiple worktrees.)
 * - opts.all: when true, allow bulk removal of all entries that match
 *   a name even if there are multiple. Defaults to false.
 *
 * Returns: { removed: number, ambiguous: boolean, matched: number }
 *   ambiguous=true means we found multiple matches by name and did NOT
 *   remove anything because opts.all was false and opts.path was absent.
 */
function remove(nameOrPath, opts = {}) {
  const doc = read();
  let matched = doc.projects.filter(
    (p) => p.name === nameOrPath || p.path === nameOrPath
  );
  if (opts.path) {
    matched = matched.filter((p) => p.path === opts.path);
  }
  if (matched.length === 0) {
    return { removed: 0, ambiguous: false, matched: 0 };
  }
  // If user asked by name and there are multiple matches, require
  // either --path or --all.
  const isExactPath = matched.every((p) => p.path === nameOrPath);
  if (!opts.path && !opts.all && matched.length > 1 && !isExactPath) {
    return { removed: 0, ambiguous: true, matched: matched.length };
  }
  const toRemove = new Set(matched.map((p) => p.path));
  doc.projects = doc.projects.filter((p) => !toRemove.has(p.path));
  write(doc);
  return { removed: matched.length, ambiguous: false, matched: matched.length };
}

module.exports = {
  registryPath,
  read,
  write,
  touchIfProject,
  findProjectRoot,
  list,
  remove,
};
