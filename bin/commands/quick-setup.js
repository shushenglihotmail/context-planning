'use strict';

/**
 * `cp quick-setup --task "<txt>" [--slug <slug>] [--json]`
 *                [--project <name>] [--milestone <name>]
 *
 * Scaffolds .planning/quick/<YYYY-MM-DD>-<slug>/ with DESIGN.md + STATE.md.
 *
 * --project <name>    Resolve <name> to a project root via the P99 registry
 *                     and scaffold the quick task THERE instead of cwd.
 * --milestone <name>  Resolve <name> to a milestone in the chosen project
 *                     and tag the DESIGN.md frontmatter with its slug.
 */

const { repoRoot } = require('../../lib/paths');
const quick = require('../../lib/quick-helpers');
const registry = require('../../lib/registry');
const milestoneScan = require('../../lib/milestone-scan');
const { resolveByName, formatError } = require('../../lib/name-resolve');

function _arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
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

function run(args) {
  args = args || [];
  const json = args.includes('--json');
  const task = _arg(args, '--task');
  const slug = _arg(args, '--slug');
  const projectName = _arg(args, '--project');
  const milestoneName = _arg(args, '--milestone');

  let projectDir = repoRoot();
  if (projectName) {
    const pr = _resolveProject(projectName);
    if (!pr.ok) {
      if (json) {
        console.log(JSON.stringify({ ok: false, error: pr.error }, null, 2));
      } else {
        console.error(pr.error);
      }
      process.exit(1);
    }
    projectDir = pr.path;
  }

  let milestoneSlug = '';
  if (milestoneName) {
    const mr = _resolveMilestone(projectDir, milestoneName);
    if (!mr.ok) {
      if (json) {
        console.log(JSON.stringify({ ok: false, error: mr.error }, null, 2));
      } else {
        console.error(mr.error);
      }
      process.exit(1);
    }
    milestoneSlug = mr.slug;
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
