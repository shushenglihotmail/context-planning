'use strict';

/**
 * `cp milestone <subcommand>` — milestone discovery helpers.
 *
 * Subcommands:
 *   cp milestone list [--json]   List milestones in the current project's
 *                                .planning/milestones/ directory.
 */

const fs = require('fs');
const path = require('path');
const { repoRoot, planningDir } = require('../../lib/paths');

function _parseName(designPath, fallback) {
  if (!fs.existsSync(designPath)) return fallback;
  let raw;
  try { raw = fs.readFileSync(designPath, 'utf8'); }
  catch (_e) { return fallback; }
  const lines = raw.split(/\r?\n/);
  let i = 0;
  // Prefer frontmatter "milestone:" field if present.
  if (lines[0] && lines[0].trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') {
      const m = /^milestone\s*:\s*(.+?)\s*$/i.exec(lines[i]);
      if (m) return m[1].replace(/^["']|["']$/g, '').trim();
      i++;
    }
    i++;
  }
  for (; i < lines.length; i++) {
    const m = /^#\s+(?:Design:\s*)?(.+?)\s*$/i.exec(lines[i]);
    if (m) return m[1].trim();
  }
  return fallback;
}

function _activeSlug(root) {
  const statePath = path.join(planningDir(root), 'STATE.md');
  if (!fs.existsSync(statePath)) return null;
  const raw = fs.readFileSync(statePath, 'utf8');
  const m = /\*\*Slug:\*\*\s*([^\s\n]+)/.exec(raw);
  return m ? m[1].trim() : null;
}

function _scan(root) {
  const dir = path.join(planningDir(root), 'milestones');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const activeSlug = _activeSlug(root);
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (ent.name === 'archived') continue;
    const slug = ent.name;
    const designPath = path.join(dir, slug, 'DESIGN.md');
    const name = _parseName(designPath, slug);
    out.push({
      name,
      slug,
      status: slug === activeSlug ? 'active' : 'inactive',
    });
  }
  // Archived: scan one level deeper if present.
  const archivedDir = path.join(dir, 'archived');
  if (fs.existsSync(archivedDir)) {
    for (const ent of fs.readdirSync(archivedDir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const slug = ent.name;
      const designPath = path.join(archivedDir, slug, 'DESIGN.md');
      out.push({
        name: _parseName(designPath, slug),
        slug,
        status: 'archived',
      });
    }
  }
  out.sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  return out;
}

function _list(args) {
  const root = repoRoot();
  const items = _scan(root);
  if (args.includes('--json')) {
    console.log(JSON.stringify({ root, milestones: items }, null, 2));
    return;
  }
  if (items.length === 0) {
    console.log('(no milestones in .planning/milestones/)');
    return;
  }
  const nameW = Math.max(4, ...items.map((m) => m.name.length));
  const slugW = Math.max(4, ...items.map((m) => m.slug.length));
  console.log(
    'NAME'.padEnd(nameW) + '  ' +
    'SLUG'.padEnd(slugW) + '  ' +
    'STATUS'
  );
  for (const m of items) {
    console.log(
      m.name.padEnd(nameW) + '  ' +
      m.slug.padEnd(slugW) + '  ' +
      m.status
    );
  }
}

function run(args) {
  args = args || [];
  const sub = args[0];
  const rest = args.slice(1);
  if (!sub || sub === 'list') return _list(rest);
  console.error('cp milestone: unknown subcommand. Try: list');
  process.exit(2);
}

module.exports = { name: 'milestone', run, _scan, _parseName };
