'use strict';

/**
 * `cp milestone-setup-check <slug> [--json]`
 *
 * Used by milestone.yaml's `setup` phase (kind: scaffold) to validate
 * prerequisites before a milestone workflow begins. Non-zero exit
 * causes the workflow runner to halt with the printed hints.
 */

const { repoRoot } = require('../../lib/paths');
const helpers = require('../../lib/milestone-helpers');

function run(args) {
  args = args || [];
  const json = args.includes('--json');
  const slug = args.find(a => !a.startsWith('--')) || null;
  const r = helpers.setupCheck(slug, { projectDir: repoRoot() });
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
    return;
  }
  for (const c of r.checks) {
    if (c.ok) console.log(`  ✓ ${c.name}`);
    else console.log(`  ✗ ${c.name} — ${c.hint}`);
  }
  if (!r.ok) {
    console.error('\ncp milestone-setup-check: ' + r.error);
    process.exit(1);
  }
  console.log(`\n✓ milestone "${r.milestoneSlug}" setup checks passed`);
}

module.exports = { name: 'milestone-setup-check', run };
