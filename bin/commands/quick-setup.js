'use strict';

/**
 * `cp quick-setup --task "<txt>" [--slug <slug>] [--json]`
 *
 * Scaffolds .planning/quick/<YYYY-MM-DD>-<slug>/ with DESIGN.md + STATE.md.
 */

const { repoRoot } = require('../../lib/paths');
const quick = require('../../lib/quick-helpers');

function _arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function run(args) {
  args = args || [];
  const json = args.includes('--json');
  const task = _arg(args, '--task');
  const slug = _arg(args, '--slug');
  const r = quick.setup({ task, slug, projectDir: repoRoot() });
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
  console.log(`  next:  edit DESIGN.md, then work the task`);
}

module.exports = { name: 'quick-setup', run };
