'use strict';

const path = require('path');
const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/lifecycle');

function run(args = []) {
  const root = repoRoot();
  let planId = null;
  let undo = false;
  let noCommit = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--undo') undo = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!planId) planId = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  if (!planId) { console.error('Usage: cp tick <plan-id> [--undo] [--no-commit] [--dry-run]'); process.exit(2); }

  let result;
  try {
    result = lifecycle.tickPlan(root, planId, { dryRun, done: !undo });
  } catch (e) {
    console.error(`tick: ${e.message}`);
    process.exit(1);
  }
  for (const a of result.actions) {
    const rel = path.relative(root, a.path);
    console.log(`${dryRun ? '·' : '✓'} ${rel}`);
  }
  if (result.actions.length === 0) {
    console.log(`(no change — plan ${planId} already ${undo ? 'unticked' : 'ticked'})`);
    return;
  }
  if (dryRun) return;
  if (!noCommit) {
    const verb = undo ? 'untick' : 'tick';
    const commit = lifecycle.gitCommit(root, `cp: ${verb} plan ${planId}`, {
      paths: lifecycle.pathsFromActions(result.actions),
    });
    if (commit) console.log(`committed ${commit}`);
  }
}

module.exports = { name: 'tick', run };
