'use strict';

/**
 * `cp milestone <subcommand>` — milestone discovery helpers.
 *
 * Subcommands:
 *   cp milestone list [--json]   List milestones in the current project's
 *                                .planning/milestones/ directory.
 */

const { repoRoot } = require('../../lib/paths');
const milestoneScan = require('../../lib/milestone-scan');

const _scan = milestoneScan.scan;
const _parseName = milestoneScan._parseName;

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

