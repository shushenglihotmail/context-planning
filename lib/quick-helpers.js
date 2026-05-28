'use strict';

/**
 * Helpers for cp quick-setup / cp quick-finalize.
 *
 * Quick tasks live at .planning/quick/<YYYY-MM-DD>-<slug>/.
 * Each quick task gets a DESIGN.md and a STATE.md scaffold; a SUMMARY.md
 * is written at finalize time.
 *
 * These are pure file I/O — Option A means the harness LLM decides what
 * the DESIGN/STATE content should be; this lib only scaffolds.
 */

const fs = require('fs');
const path = require('path');
const { writeFile } = require('./lifecycle');

const SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/;

function _slugify(task) {
  return String(task || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'task';
}

function _dateStamp(now) {
  const d = now instanceof Date ? now : new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function quickRoot(projectDir) {
  return path.join(projectDir || process.cwd(), '.planning', 'quick');
}

function quickDir(slug, projectDir) {
  return path.join(quickRoot(projectDir), slug);
}

/**
 * Scaffold a new quick task.
 * @param {{ task: string, projectDir?: string, slug?: string, now?: Date }} opts
 * @returns {{ ok: boolean, slug?: string, dir?: string, error?: string }}
 */
function setup(opts) {
  const o = opts || {};
  const task = String(o.task || '').trim();
  if (!task) return { ok: false, error: 'task description required (--task)' };
  const baseSlug = o.slug ? String(o.slug).trim() : _slugify(task);
  const fullSlug = `${_dateStamp(o.now)}-${baseSlug}`;
  if (!SLUG_RE.test(fullSlug)) {
    return { ok: false, error: `invalid slug: ${fullSlug}` };
  }
  const dir = quickDir(fullSlug, o.projectDir);
  if (fs.existsSync(dir)) {
    return { ok: false, error: `quick task already exists: ${fullSlug}` };
  }
  fs.mkdirSync(dir, { recursive: true });
  const designPath = path.join(dir, 'DESIGN.md');
  const statePath = path.join(dir, 'STATE.md');
  writeFile(
    designPath,
    `# Quick task: ${task}\n\n` +
      `Slug: ${fullSlug}\n` +
      `Created: ${(o.now instanceof Date ? o.now : new Date()).toISOString()}\n\n` +
      `## Goal\n\n${task}\n\n` +
      `## Approach\n\n_(fill in)_\n\n` +
      `## Out of scope\n\n_(fill in)_\n`,
  );
  writeFile(
    statePath,
    `# State: ${fullSlug}\n\n` +
      `Status: in-progress\n\n` +
      `## Progress\n\n_(updated as work happens)_\n`,
  );
  return { ok: true, slug: fullSlug, dir };
}

/**
 * Finalize a quick task: write SUMMARY.md and update STATE.md status.
 * Idempotent.
 *
 * @param {string} slug
 * @param {{ projectDir?: string, body?: string, outcome?: string }} [opts]
 */
function finalize(slug, opts) {
  const o = opts || {};
  if (!slug || !SLUG_RE.test(slug)) return { ok: false, error: `invalid slug: ${slug}` };
  const dir = quickDir(slug, o.projectDir);
  if (!fs.existsSync(dir)) return { ok: false, error: `quick task not found: ${slug}` };
  const summaryPath = path.join(dir, 'SUMMARY.md');
  const outcome = String(o.outcome || '').trim() || '_(fill in outcome)_';
  const body = o.body ? `\n${o.body}\n` : '';
  writeFile(
    summaryPath,
    `# Summary: ${slug}\n\n` +
      `Completed: ${new Date().toISOString()}\n\n` +
      `## Outcome\n\n${outcome}\n${body}`,
  );
  // Best-effort status flip in STATE.md.
  const statePath = path.join(dir, 'STATE.md');
  if (fs.existsSync(statePath)) {
    const txt = fs.readFileSync(statePath, 'utf8');
    const next = txt.replace(/^Status:\s*in-progress\s*$/m, 'Status: complete');
    if (next !== txt) writeFile(statePath, next);
  }
  return { ok: true, slug, summaryPath };
}

module.exports = { quickRoot, quickDir, setup, finalize };
