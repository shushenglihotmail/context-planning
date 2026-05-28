'use strict';

/**
 * Supervisor-tier state management for v1.4 supervised workflow runs.
 *
 * State lives at .planning/runs/<slug>/state.json. JSON (not YAML) so the
 * harness LLM can produce/consume it with low ambiguity, and so atomic
 * writes don't deal with multi-doc YAML edge cases.
 *
 * Option A architecture (DESIGN.md Decision #6): cp has NO embedded LLM
 * client and NO daemon. These helpers are pure file I/O — they read and
 * write state on behalf of the harness LLM session that plays the
 * supervisor role.
 */

const fs = require('fs');
const path = require('path');
const { writeFile } = require('./lifecycle');

// ---------- internal helpers ----------

/**
 * Resolve the canonical .planning/runs/ root directory.
 * @param {string} [projectDir]
 * @returns {string}
 */
function runsRoot(projectDir) {
  return path.join(projectDir || process.cwd(), '.planning', 'runs');
}

/**
 * Resolve a run's directory path.
 * @param {string} slug
 * @param {string} [projectDir]
 * @returns {string}
 */
function runDir(slug, projectDir) {
  _validateSlug(slug);
  return path.join(runsRoot(projectDir), slug);
}

/**
 * Resolve a run's state.json path.
 * @param {string} slug
 * @param {string} [projectDir]
 * @returns {string}
 */
function stateFilePath(slug, projectDir) {
  return path.join(runDir(slug, projectDir), 'state.json');
}

/**
 * Slugs are lowercase alphanumeric with hyphens/underscores/dots; we reject
 * anything that could escape the runs root.
 * @param {string} slug
 */
function _validateSlug(slug) {
  if (typeof slug !== 'string' || slug.length === 0) {
    throw new TypeError('supervisor: slug must be a non-empty string');
  }
  if (slug.includes('/') || slug.includes('\\') || slug.includes('..')) {
    throw new Error(`supervisor: invalid slug (path traversal): ${slug}`);
  }
  if (!/^[a-z0-9._-]+$/i.test(slug)) {
    throw new Error(`supervisor: invalid slug (must match [a-z0-9._-]+): ${slug}`);
  }
}

/**
 * Walk an object via dot-path; returns { parent, key } so the caller can
 * read or mutate. Auto-vivifies intermediate plain objects on write paths.
 * Refuses to walk through arrays or prototype-polluting keys.
 *
 * @param {object} root
 * @param {string} dotPath  e.g. "phases.plan.status"
 * @param {boolean} createMissing
 * @returns {{parent: object, key: string}}
 */
function _walkPath(root, dotPath, createMissing) {
  if (typeof dotPath !== 'string' || dotPath.length === 0) {
    throw new TypeError('supervisor: dotPath must be a non-empty string');
  }
  const parts = dotPath.split('.');
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`supervisor: refusing prototype-polluting key: ${key}`);
    }
    if (cur[key] == null) {
      if (!createMissing) {
        return { parent: null, key: parts[parts.length - 1] };
      }
      cur[key] = {};
    }
    if (typeof cur[key] !== 'object' || Array.isArray(cur[key])) {
      throw new Error(`supervisor: cannot traverse non-object at '${parts.slice(0, i + 1).join('.')}'`);
    }
    cur = cur[key];
  }
  const last = parts[parts.length - 1];
  if (last === '__proto__' || last === 'constructor' || last === 'prototype') {
    throw new Error(`supervisor: refusing prototype-polluting key: ${last}`);
  }
  return { parent: cur, key: last };
}

// ---------- public API ----------

/**
 * Initialise a new run directory and write the initial state.json.
 *
 * @param {string} slug
 * @param {object} initial - initial state to write (workflow, milestone, etc.)
 * @param {{ projectDir?: string, now?: Date }} [opts]
 * @returns {object} the written state
 */
function initRun(slug, initial, opts) {
  _validateSlug(slug);
  const o = opts || {};
  const now = o.now instanceof Date ? o.now : new Date();
  const dir = runDir(slug, o.projectDir);
  if (fs.existsSync(path.join(dir, 'state.json'))) {
    throw new Error(`supervisor: run already exists: ${slug}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  const state = Object.assign(
    {
      run_id: slug,
      supervised: true,
      created: now.toISOString(),
      updated: now.toISOString(),
      status: 'pending',
      current_phase: null,
      phases: {},
    },
    initial || {},
  );
  state.run_id = slug;
  writeFile(stateFilePath(slug, o.projectDir), JSON.stringify(state, null, 2) + '\n');
  return state;
}

/**
 * Read state.json for a run. Throws if the run does not exist.
 *
 * @param {string} slug
 * @param {{ projectDir?: string }} [opts]
 * @returns {object}
 */
function readState(slug, opts) {
  const p = stateFilePath(slug, (opts || {}).projectDir);
  if (!fs.existsSync(p)) {
    throw new Error(`supervisor: run not found: ${slug}`);
  }
  const raw = fs.readFileSync(p, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`supervisor: state.json is not valid JSON for ${slug}: ${e.message}`);
  }
}

/**
 * Shallow-merge a patch into the current state and rewrite state.json
 * atomically. Always bumps `updated` to now.
 *
 * @param {string} slug
 * @param {object} patch - shallow keys to merge
 * @param {{ projectDir?: string, now?: Date }} [opts]
 * @returns {object} updated state
 */
function writeState(slug, patch, opts) {
  const o = opts || {};
  const now = o.now instanceof Date ? o.now : new Date();
  const cur = readState(slug, o);
  const next = Object.assign({}, cur, patch || {}, { updated: now.toISOString() });
  // Preserve immutable identity
  next.run_id = cur.run_id;
  writeFile(stateFilePath(slug, o.projectDir), JSON.stringify(next, null, 2) + '\n');
  return next;
}

/**
 * Set a value at a dot-path in state.json. Creates intermediate objects
 * as needed. Bumps `updated`.
 *
 * @param {string} slug
 * @param {string} dotPath
 * @param {*} value
 * @param {{ projectDir?: string, now?: Date }} [opts]
 * @returns {object} updated state
 */
function setPath(slug, dotPath, value, opts) {
  const o = opts || {};
  const now = o.now instanceof Date ? o.now : new Date();
  const cur = readState(slug, o);
  const { parent, key } = _walkPath(cur, dotPath, true);
  parent[key] = value;
  cur.updated = now.toISOString();
  writeFile(stateFilePath(slug, o.projectDir), JSON.stringify(cur, null, 2) + '\n');
  return cur;
}

/**
 * Append an entry to an array at a dot-path. Creates the array if missing.
 * Bumps `updated`.
 *
 * @param {string} slug
 * @param {string} dotPath
 * @param {*} entry
 * @param {{ projectDir?: string, now?: Date }} [opts]
 * @returns {object} updated state
 */
function appendPath(slug, dotPath, entry, opts) {
  const o = opts || {};
  const now = o.now instanceof Date ? o.now : new Date();
  const cur = readState(slug, o);
  const { parent, key } = _walkPath(cur, dotPath, true);
  if (parent[key] == null) parent[key] = [];
  if (!Array.isArray(parent[key])) {
    throw new Error(`supervisor: cannot append to non-array at '${dotPath}'`);
  }
  parent[key].push(entry);
  cur.updated = now.toISOString();
  writeFile(stateFilePath(slug, o.projectDir), JSON.stringify(cur, null, 2) + '\n');
  return cur;
}

/**
 * Get a value at a dot-path. Returns undefined if any segment is missing.
 *
 * @param {string} slug
 * @param {string} dotPath
 * @param {{ projectDir?: string }} [opts]
 * @returns {*}
 */
function getPath(slug, dotPath, opts) {
  const cur = readState(slug, opts);
  const { parent, key } = _walkPath(cur, dotPath, false);
  if (parent == null) return undefined;
  return parent[key];
}

/**
 * Test if a run directory + state.json exists.
 *
 * @param {string} slug
 * @param {{ projectDir?: string }} [opts]
 * @returns {boolean}
 */
function runExists(slug, opts) {
  try {
    return fs.existsSync(stateFilePath(slug, (opts || {}).projectDir));
  } catch (_) {
    return false;
  }
}

/**
 * Enforce the sub-agent output-path contract. Given the declared `outputs:`
 * paths for a phase and a candidate write path, return true iff the write
 * is within at least one declared output prefix.
 *
 * Paths are normalised, and `..` segments that escape the project root are
 * rejected. The check is purely lexical — it does not require the file to
 * exist.
 *
 * @param {string[]} declaredOutputs
 * @param {string} candidatePath
 * @param {string} [projectDir]
 * @returns {boolean}
 */
function isOutputAllowed(declaredOutputs, candidatePath, projectDir) {
  if (!Array.isArray(declaredOutputs) || declaredOutputs.length === 0) {
    return false;
  }
  const root = projectDir || process.cwd();
  const candAbs = path.resolve(root, candidatePath);
  const rootAbs = path.resolve(root);
  // Reject paths that escape the project root
  if (candAbs !== rootAbs && !candAbs.startsWith(rootAbs + path.sep)) {
    return false;
  }
  for (const out of declaredOutputs) {
    if (typeof out !== 'string' || out.length === 0) continue;
    const outAbs = path.resolve(root, out);
    if (candAbs === outAbs) return true;
    if (candAbs.startsWith(outAbs + path.sep)) return true;
  }
  return false;
}

module.exports = {
  runsRoot,
  runDir,
  stateFilePath,
  initRun,
  readState,
  writeState,
  setPath,
  appendPath,
  getPath,
  runExists,
  isOutputAllowed,
};
