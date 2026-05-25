'use strict';

/**
 * Manages the lifecycle of .planning/custom/<slug>/ directories.
 * Provides the "custom" state tier for the cp workflow engine.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { writeFile } = require('./lifecycle');

// ---------- internal helpers ----------

/**
 * Resolve the .planning/custom/ root directory.
 * @param {string} [projectDir]
 * @returns {string}
 */
function customRoot(projectDir) {
  return path.join(projectDir || process.cwd(), '.planning', 'custom');
}

/**
 * Slugify a run name: lowercase, replace non-alphanumeric runs with '-',
 * trim edges, collapse multiple dashes.
 * @param {string} name
 * @returns {string}
 */
function slugifyName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Format a Date as YYYY-MM-DD.
 * @param {Date} d
 * @returns {string}
 */
function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format a Date as HHMM (local time, zero-padded).
 * @param {Date} d
 * @returns {string}
 */
function timeStr(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}${min}`;
}

/**
 * Pick a free slug — append -2, -3, … if base already exists.
 * @param {string} base
 * @param {string} root
 * @returns {string}
 */
function freeSlug(base, root) {
  if (!fs.existsSync(path.join(root, base))) return base;
  let n = 2;
  while (fs.existsSync(path.join(root, `${base}-${n}`))) n++;
  return `${base}-${n}`;
}

/**
 * Read and parse a STATE.yaml file. Returns null if missing or unparseable.
 * @param {string} p - absolute path to STATE.yaml
 * @returns {object|null}
 */
function parseStateFile(p) {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return yaml.parse(raw) || null;
  } catch (_) {
    return null;
  }
}

// ---------- public API ----------

/**
 * Compute the run directory path (pure — does not verify existence).
 * @param {string} slug
 * @param {{ projectDir?: string }} [opts]
 * @returns {string} absolute path
 */
function runDir(slug, opts) {
  return path.join(customRoot((opts || {}).projectDir), slug);
}

/**
 * Create a new custom run directory and initial STATE.yaml.
 * @param {string} workflow - template/workflow name, required
 * @param {string} [name] - human-friendly run name (optional)
 * @param {{ projectDir?: string, now?: Date }} [opts]
 * @returns {string} chosen slug
 */
function createRun(workflow, name, opts) {
  if (!workflow || typeof workflow !== 'string') {
    throw new TypeError('createRun: workflow must be a non-empty string');
  }
  const o = opts || {};
  const now = o.now instanceof Date ? o.now : new Date();
  const root = customRoot(o.projectDir);

  const ds = dateStr(now);
  let base;
  if (name && String(name).trim().length > 0) {
    base = `${ds}-${slugifyName(name)}`;
  } else {
    base = `${ds}-${slugifyName(workflow)}-${timeStr(now)}`;
  }

  const slug = freeSlug(base, root);
  const dir = path.join(root, slug);
  fs.mkdirSync(dir, { recursive: true });

  const iso = now.toISOString();
  const state = {
    workflow,
    slug,
    status: 'in-progress',
    binding: 'custom',
    started: iso,
    last_activity: iso,
    current_phase: null,
    completed: [],
    artifacts: {},
  };

  writeFile(path.join(dir, 'STATE.yaml'), yaml.stringify(state));
  return slug;
}

/**
 * List all custom runs, sorted by lastActivity descending.
 * @param {{ projectDir?: string }} [opts]
 * @returns {Array<{slug, workflow, status, started, lastActivity, currentPhase}>}
 */
function listRuns(opts) {
  const root = customRoot((opts || {}).projectDir);
  if (!fs.existsSync(root)) return [];

  let entries;
  try {
    entries = fs.readdirSync(root);
  } catch (_) {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    const stateFile = path.join(root, entry, 'STATE.yaml');
    if (!fs.existsSync(path.join(root, entry)) ||
        !fs.statSync(path.join(root, entry)).isDirectory()) continue;
    const parsed = parseStateFile(stateFile);
    if (!parsed) {
      console.warn(`[cp custom] skipping unparseable STATE.yaml in: ${entry}`);
      continue;
    }
    results.push({
      slug: parsed.slug || entry,
      workflow: parsed.workflow || null,
      status: parsed.status || null,
      started: parsed.started || null,
      lastActivity: parsed.last_activity || null,
      currentPhase: parsed.current_phase || null,
    });
  }

  results.sort((a, b) => {
    const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
    const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });

  return results;
}

/**
 * Read and return the STATE.yaml object for a run.
 * @param {string} slug
 * @param {{ projectDir?: string }} [opts]
 * @returns {object}
 */
function readState(slug, opts) {
  const dir = runDir(slug, opts);
  const stateFile = path.join(dir, 'STATE.yaml');
  if (!fs.existsSync(dir) || !fs.existsSync(stateFile)) {
    throw new Error(`Run not found: ${slug}`);
  }
  const parsed = parseStateFile(stateFile);
  if (!parsed) throw new Error(`Run not found: ${slug}`);
  return parsed;
}

/**
 * Shallow-merge patch into STATE.yaml and always update last_activity.
 * Nested object values (e.g. artifacts) are shallow-merged one level deep.
 * @param {string} slug
 * @param {object} patch
 * @param {{ projectDir?: string, now?: Date }} [opts]
 * @returns {object} merged state
 */
function writeState(slug, patch, opts) {
  const o = opts || {};
  const now = o.now instanceof Date ? o.now : new Date();
  const current = readState(slug, o);

  const merged = Object.assign({}, current);
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const cv = current[key];
    if (pv !== null && typeof pv === 'object' && !Array.isArray(pv) &&
        cv !== null && typeof cv === 'object' && !Array.isArray(cv)) {
      merged[key] = Object.assign({}, cv, pv);
    } else {
      merged[key] = pv;
    }
  }
  merged.last_activity = now.toISOString();

  const dir = runDir(slug, o);
  writeFile(path.join(dir, 'STATE.yaml'), yaml.stringify(merged));
  return merged;
}

/**
 * Write a phase summary file and update STATE.yaml.
 * @param {string} slug
 * @param {string} phaseId
 * @param {string} content
 * @param {{ projectDir?: string, now?: Date }} [opts]
 * @returns {string} absolute path of the written file
 */
function writePhaseSummary(slug, phaseId, content, opts) {
  const o = opts || {};
  const dir = runDir(slug, o);

  // Determine next sequence number from existing NN-*.md files.
  let maxSeq = 0;
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const m = f.match(/^(\d+)-/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxSeq) maxSeq = n;
      }
    }
  } catch (_) { /* dir may not exist yet — createRun should have made it */ }

  const nextSeq = maxSeq + 1;
  const width = Math.max(2, String(nextSeq).length);
  const nn = String(nextSeq).padStart(width, '0');
  const phaseIdSlug = slugifyName(phaseId);
  const filename = `${nn}-${phaseIdSlug}.md`;
  const filePath = path.join(dir, filename);

  writeFile(filePath, content);

  // Update STATE.yaml: append to completed (de-dup), set artifact, update last_activity.
  const now = o.now instanceof Date ? o.now : new Date();
  const current = readState(slug, o);

  const completed = Array.isArray(current.completed) ? current.completed.slice() : [];
  if (!completed.includes(phaseId)) completed.push(phaseId);

  const artifacts = Object.assign({}, current.artifacts || {});
  artifacts[phaseId] = filename;

  const merged = Object.assign({}, current, {
    completed,
    artifacts,
    last_activity: now.toISOString(),
  });

  writeFile(path.join(dir, 'STATE.yaml'), yaml.stringify(merged));
  return filePath;
}

/**
 * Find abandoned runs older than daysOld and optionally remove them.
 * @param {number} [daysOld=30]
 * @param {{ projectDir?: string, apply?: boolean, now?: Date }} [opts]
 * @returns {{ candidates: string[], removed: string[], dryRun: boolean }}
 */
function pruneAbandoned(daysOld, opts) {
  const o = opts || {};
  const days = (typeof daysOld === 'number' && daysOld >= 0) ? daysOld : 30;
  const apply = o.apply === true;
  const now = o.now instanceof Date ? o.now : new Date();
  const cutoff = days * 86400000;

  const runs = listRuns(o);
  const candidates = [];
  for (const r of runs) {
    if (r.status !== 'abandoned') continue;
    const last = r.lastActivity ? new Date(r.lastActivity).getTime() : 0;
    if ((now.getTime() - last) > cutoff) {
      candidates.push(r.slug);
    }
  }

  const removed = [];
  if (apply) {
    for (const slug of candidates) {
      const dir = runDir(slug, o);
      fs.rmSync(dir, { recursive: true, force: true });
      removed.push(slug);
    }
  }

  return { candidates, removed, dryRun: !apply };
}

module.exports = {
  createRun,
  listRuns,
  readState,
  writeState,
  writePhaseSummary,
  pruneAbandoned,
  runDir,
};
