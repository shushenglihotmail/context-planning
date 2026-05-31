'use strict';

/**
 * lib/milestone-scan.js — pure milestone discovery for a project root.
 *
 * Extracted from bin/commands/milestone.js so non-CLI code (e.g., quick-setup
 * flag resolution) can require it without pulling in a CLI command surface.
 *
 * Zero dependencies.
 */

const fs = require('fs');
const path = require('path');
const { planningDir } = require('./paths');

function _parseName(designPath, fallback) {
  if (!fs.existsSync(designPath)) return fallback;
  let raw;
  try { raw = fs.readFileSync(designPath, 'utf8'); }
  catch (_e) { return fallback; }
  const lines = raw.split(/\r?\n/);
  let i = 0;
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

/**
 * Scan all milestones (active + archived) in a project root.
 *
 * @param {string} root  absolute path to project root
 * @returns {Array<{name: string, slug: string, status: 'active'|'inactive'|'archived'}>}
 */
function scan(root) {
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

module.exports = { scan, _parseName, _activeSlug };
