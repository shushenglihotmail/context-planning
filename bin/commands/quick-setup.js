'use strict';

/**
 * `cp quick-setup --task "<txt>" [--slug <slug>] [--json]`
 *                [--project [<name>]] [--milestone [<name>]]
 *
 * Scaffolds .planning/quick/<YYYY-MM-DD>-<slug>/ with DESIGN.md + STATE.md.
 *
 * --project <name>    Resolve <name> to a project root via the P99 registry
 *                     and scaffold the quick task THERE instead of cwd.
 * --project           (no value) Use the project that cwd lives inside
 *                     (walks up to find .planning/PROJECT.md).
 * --milestone <name>  Resolve <name> to a milestone in the chosen project
 *                     and tag the DESIGN.md frontmatter with its slug.
 * --milestone         (no value) Use the "latest" milestone of the chosen
 *                     project: if any milestone is active, pick the most
 *                     recently-created among the active set; otherwise the
 *                     most recently-created overall. Tie-break by largest
 *                     slug.
 */

const fs = require('fs');
const path = require('path');
const { repoRoot, planningDir } = require('../../lib/paths');
const quick = require('../../lib/quick-helpers');
const registry = require('../../lib/registry');
const milestoneScan = require('../../lib/milestone-scan');
const { resolveByName, formatError } = require('../../lib/name-resolve');

function _arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

/**
 * Tri-state flag parser: returns whether `name` was present and, if so, its
 * value (or null when present without a value — i.e., next token is missing,
 * starts with `--`, or is itself a known sibling flag).
 */
function _flag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return { present: false, value: null };
  const next = args[i + 1];
  if (next === undefined || next.startsWith('--')) {
    return { present: true, value: null };
  }
  return { present: true, value: next };
}

function _resolveProject(name) {
  const candidates = registry.list();
  const r = resolveByName(candidates, name);
  if (r.ok) return { ok: true, path: r.match.path };
  return { ok: false, error: 'cp quick: ' + formatError('project', name, r) };
}

function _resolveMilestone(root, name) {
  const candidates = milestoneScan.scan(root);
  const r = resolveByName(candidates, name);
  if (r.ok) return { ok: true, slug: r.match.slug };
  return { ok: false, error: 'cp quick: ' + formatError('milestone', name, r) };
}

/**
 * Read `created:` from a milestone DESIGN.md frontmatter. Returns the raw
 * string (e.g. "2026-01-15"), or null if absent / unreadable.
 */
function _readCreated(root, slug) {
  // Try active/inactive location, then archived.
  const candidates = [
    path.join(planningDir(root), 'milestones', slug, 'DESIGN.md'),
    path.join(planningDir(root), 'milestones', 'archived', slug, 'DESIGN.md'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    let raw;
    try { raw = fs.readFileSync(p, 'utf8'); } catch (_e) { continue; }
    const lines = raw.split(/\r?\n/);
    if (lines[0] && lines[0].trim() === '---') {
      for (let i = 1; i < lines.length && lines[i].trim() !== '---'; i++) {
        const m = /^created\s*:\s*(.+?)\s*$/i.exec(lines[i]);
        if (m) return m[1].replace(/^["']|["']$/g, '').trim();
      }
    }
    return null;
  }
  return null;
}

/**
 * Pick the "latest" milestone for bare `--milestone`. Scope to active set if
 * any are active; else consider all. Within scope: most recent `created:`,
 * tie-break by largest slug.
 */
function _latestMilestone(root) {
  const all = milestoneScan.scan(root);
  if (all.length === 0) return null;
  const active = all.filter((m) => m.status === 'active');
  const pool = active.length > 0 ? active : all;
  const ranked = pool
    .map((m) => ({ ...m, _created: _readCreated(root, m.slug) || '' }))
    .sort((a, b) => {
      if (a._created !== b._created) return a._created < b._created ? 1 : -1;
      return a.slug < b.slug ? 1 : a.slug > b.slug ? -1 : 0;
    });
  return ranked[0];
}

function _fail(json, msg) {
  if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
  else console.error(msg);
  process.exit(1);
}

function run(args) {
  args = args || [];
  const json = args.includes('--json');
  const task = _arg(args, '--task');
  const slug = _arg(args, '--slug');
  const projectFlag = _flag(args, '--project');
  const milestoneFlag = _flag(args, '--milestone');

  let projectDir = repoRoot();
  if (projectFlag.present) {
    if (projectFlag.value === null) {
      const found = registry.findProjectRoot(process.cwd());
      if (!found) {
        _fail(json,
          'cp quick: --project given without a name, but cwd is not inside ' +
          'any project (no .planning/PROJECT.md found in cwd or any parent).');
      }
      projectDir = found;
    } else {
      const pr = _resolveProject(projectFlag.value);
      if (!pr.ok) _fail(json, pr.error);
      projectDir = pr.path;
    }
  }

  let milestoneSlug = '';
  if (milestoneFlag.present) {
    if (milestoneFlag.value === null) {
      const latest = _latestMilestone(projectDir);
      if (!latest) {
        _fail(json,
          'cp quick: --milestone given without a name, but the project has ' +
          'no milestones in .planning/milestones/.');
      }
      milestoneSlug = latest.slug;
    } else {
      const mr = _resolveMilestone(projectDir, milestoneFlag.value);
      if (!mr.ok) _fail(json, mr.error);
      milestoneSlug = mr.slug;
    }
  }

  const r = quick.setup({ task, slug, projectDir, milestoneSlug });
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
    return;
  }
  if (!r.ok) {
    console.error(`cp quick-setup: ${r.error}`);
    process.exit(1);
  }
  console.log(`✓ quick task scaffolded`);
  console.log(`  slug:  ${r.slug}`);
  console.log(`  dir:   ${r.dir}`);
  if (milestoneSlug) console.log(`  milestone: ${milestoneSlug}`);
  console.log(`  next:  edit DESIGN.md, then work the task`);
}

module.exports = { name: 'quick-setup', run };

