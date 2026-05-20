'use strict';

const path = require('path');
const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/lifecycle');

function run(args = []) {
  const root = repoRoot();
  let name = null;
  let dryRun = false;
  let noCommit = false;
  let status = 'in-progress';
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--planned') status = 'planned';
    else if (a === '--status') status = args[++i];
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!name) name = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  if (!name) {
    console.error('Usage: cp scaffold-milestone <name> [--planned] [--no-commit] [--dry-run]');
    process.exit(2);
  }

  let r;
  try {
    r = lifecycle.scaffoldMilestone(root, name, { dryRun, status });
  } catch (e) {
    console.error(`scaffold-milestone: ${e.message}`);
    process.exit(1);
  }

  if (!r.ok) {
    console.error(`scaffold-milestone: ${r.reason}`);
    if (r.reason === 'milestone-exists') {
      console.error(`  "${r.milestone}" already exists (status: ${r.status}).`);
    }
    process.exit(1);
  }

  for (const a of r.actions) {
    const rel = path.relative(root, a.path);
    console.log(`${dryRun ? '·' : '✓'} ${rel}`);
  }
  console.log(`Milestone:   ${r.milestone} [${r.status}]`);
  if (dryRun) return;
  if (!noCommit) {
    const commit = lifecycle.gitCommit(root, `cp: scaffold-milestone ${r.milestone}`, {
      paths: lifecycle.pathsFromActions(r.actions),
    });
    if (commit) console.log(`committed ${commit}`);
  }
}

module.exports = { name: 'scaffold-milestone', run };
