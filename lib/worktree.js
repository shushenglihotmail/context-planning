'use strict';

/**
 * lib/worktree.js — pure helpers for `cp worktree {create,list,remove}`.
 *
 * The cp worktree workflow is intentionally minimal: cp wraps `git worktree`
 * with sensible defaults (sibling-directory layout, `cp/<slug>` branch name)
 * and records a row per worktree in `.planning/WORKTREES.md` for traceability
 * across phases and resumption.
 *
 * If the configured workflow provider (default: Superpowers) is installed
 * AND its `worktree` role resolves to a skill (e.g.
 * `using-git-worktrees`), `cmdWorktree` in bin/cp.js prints a hand-off
 * line so the harness knows to invoke that skill. The cp-native behaviour
 * still runs as a fallback / non-delegated path.
 *
 * v0.4.3.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { planningDir } = require('./paths');

const WORKTREES_FILENAME = 'WORKTREES.md';

/** Conservative slug: lowercase, alphanumeric + hyphen only. */
function slugify(name) {
  if (typeof name !== 'string') throw new Error('slugify: name must be a string');
  const out = name
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (out.length === 0) throw new Error(`slugify: "${name}" produced an empty slug`);
  return out;
}

/**
 * Default sibling location for a worktree: `<parent-of-repo>/<repo-name>-<slug>`.
 *
 *   /work/projects/myrepo  → /work/projects/myrepo-cool-feature
 *
 * The user can override with --path; this is just the default.
 */
function defaultWorktreePath(repoRoot, slug) {
  const parent = path.dirname(repoRoot);
  const base = path.basename(repoRoot);
  return path.join(parent, `${base}-${slug}`);
}

function defaultBranchName(slug) {
  return `cp/${slug}`;
}

/**
 * Parse the output of `git worktree list --porcelain` into objects:
 *   { path, head, branch, bare, detached, locked, prunable }
 *
 * Tolerates the slight differences in older git versions.
 */
function parseGitWorktreeList(raw) {
  const trees = [];
  let cur = null;
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '');
    if (line === '') {
      if (cur) { trees.push(cur); cur = null; }
      continue;
    }
    if (line.startsWith('worktree ')) {
      if (cur) trees.push(cur);
      cur = { path: line.slice('worktree '.length), branch: null };
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('HEAD ')) cur.head = line.slice('HEAD '.length);
    else if (line.startsWith('branch ')) cur.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    else if (line === 'bare') cur.bare = true;
    else if (line === 'detached') cur.detached = true;
    else if (line.startsWith('locked')) cur.locked = true;
    else if (line.startsWith('prunable')) cur.prunable = true;
  }
  if (cur) trees.push(cur);
  return trees;
}

/**
 * Render the WORKTREES.md registry from an array of `{ path, branch, slug,
 * phase?, created, notes? }` entries. Stable order: created ascending.
 */
function renderWorktreesDoc(entries) {
  const lines = [
    '# Worktrees',
    '',
    '> cp-managed git worktrees for this project. Use `cp worktree create`',
    '> to add an entry. Each row pairs a sibling worktree directory with a',
    '> short slug and (optionally) a phase number for traceability.',
    '',
    '| Slug | Branch | Path | Phase | Created | Notes |',
    '|------|--------|------|-------|---------|-------|',
  ];
  const sorted = entries.slice().sort((a, b) => String(a.created).localeCompare(String(b.created)));
  for (const e of sorted) {
    lines.push(`| ${e.slug} | ${e.branch} | ${e.path} | ${e.phase || '—'} | ${e.created} | ${e.notes || ''} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Parse WORKTREES.md back to an array of registry entries. Tolerates extra
 * narrative the user added before/after the table.
 */
function parseWorktreesDoc(content) {
  if (typeof content !== 'string' || content.length === 0) return [];
  const entries = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*-+\s*\|/.test(line)) continue; // separator row
    if (/^\|\s*Slug\s*\|/i.test(line)) continue; // header row
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const [slug, branch, p, phase, created, notes = ''] = cells;
    if (!slug || slug === '—') continue;
    entries.push({
      slug, branch, path: p,
      phase: phase && phase !== '—' ? phase : null,
      created, notes,
    });
  }
  return entries;
}

/** Path to .planning/WORKTREES.md (does not require the file to exist). */
function worktreesPath(root) {
  return path.join(planningDir(root), WORKTREES_FILENAME);
}

/**
 * Compute the action list to add an entry to .planning/WORKTREES.md.
 * Returns `{ actions, entry, alreadyPresent }`. Uses the lifecycle.writeBatch
 * action shape so the caller can scope its commit and atomic-write through
 * the same pipeline as every other cp lifecycle op.
 */
function addRegistryEntry(root, entry) {
  const p = worktreesPath(root);
  const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const entries = parseWorktreesDoc(existing);
  const alreadyPresent = entries.some((e) => e.slug === entry.slug);
  if (!alreadyPresent) entries.push(entry);
  const after = renderWorktreesDoc(entries);
  return {
    actions: [{ kind: 'write', path: p, after, label: 'add-worktree-entry' }],
    entry,
    alreadyPresent,
  };
}

/**
 * Compute the action list to remove an entry from .planning/WORKTREES.md by slug.
 * Returns `{ actions, removed }` where `removed` is the entry that was removed
 * (or null if no such slug).
 */
function removeRegistryEntry(root, slug) {
  const p = worktreesPath(root);
  if (!fs.existsSync(p)) return { actions: [], removed: null };
  const entries = parseWorktreesDoc(fs.readFileSync(p, 'utf8'));
  const removed = entries.find((e) => e.slug === slug) || null;
  if (!removed) return { actions: [], removed: null };
  const remaining = entries.filter((e) => e.slug !== slug);
  const after = renderWorktreesDoc(remaining);
  return {
    actions: [{ kind: 'write', path: p, after, label: 'remove-worktree-entry' }],
    removed,
  };
}

/** Read current registry. Returns an array of entries (possibly empty). */
function listRegistry(root) {
  const p = worktreesPath(root);
  if (!fs.existsSync(p)) return [];
  return parseWorktreesDoc(fs.readFileSync(p, 'utf8'));
}

function isoDay(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = {
  WORKTREES_FILENAME,
  worktreesPath,
  slugify,
  defaultWorktreePath,
  defaultBranchName,
  parseGitWorktreeList,
  renderWorktreesDoc,
  parseWorktreesDoc,
  addRegistryEntry,
  removeRegistryEntry,
  listRegistry,
  isoDay,
};
