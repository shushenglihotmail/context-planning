'use strict';

const path = require('path');
const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/lifecycle');

function run(args = []) {
  const root = repoRoot();
  let num = null;
  let name = null;
  let plans = 0;
  let milestoneName = null;
  let dryRun = false;
  let noCommit = false;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--name') name = args[++i];
    else if (a === '--plans') plans = parseInt(args[++i], 10) || 0;
    else if (a === '--milestone') milestoneName = args[++i];
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--force') force = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!num) num = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  if (!num || !name) {
    console.error('Usage: cp scaffold-phase <N> --name <name> [--plans <count>] [--milestone <name>] [--no-commit] [--dry-run] [--force]');
    process.exit(2);
  }

  let r;
  try {
    r = lifecycle.scaffoldPhase(root, num, { dryRun, name, plans, milestone: milestoneName, force });
  } catch (e) {
    console.error(`scaffold-phase: ${e.message}`);
    process.exit(1);
  }

  if (!r.ok) {
    if (r.reason === 'prior-phase-incomplete') {
      process.stderr.write(`cp: cannot scaffold phase ${num} — prior phase ${r.priorPhase} has ticked plans without SUMMARY.md:\n`);
      for (const planId of r.missingSummaries) {
        process.stderr.write(`  - ${planId}\n`);
      }
      process.stderr.write('\nWrite the missing summaries with:\n');
      process.stderr.write(`  cp write-summary ${r.missingSummaries[0]} --from <json>\n\n`);
      process.stderr.write('Or override with --force (not recommended).\n');
      process.exit(2);
    }
    console.error(`scaffold-phase: ${r.reason}`);
    if (r.reason === 'phase-exists') {
      console.error(`  ${path.relative(root, r.phaseDir)} already exists.`);
    } else if (r.reason === 'milestone-not-found') {
      console.error(`  No milestone named "${milestoneName}" in ROADMAP.md.`);
    } else if (r.reason === 'no-active-milestone') {
      console.error(`  No in-progress milestone. Run \`cp scaffold-milestone <name>\` first or pass --milestone.`);
    }
    process.exit(1);
  }

  if (force) {
    process.stderr.write('cp: --force used, skipping prior-summary check\n');
  }

  for (const a of r.actions) {
    const rel = path.relative(root, a.path);
    console.log(`${dryRun ? '·' : '✓'} ${rel}`);
  }
  console.log(`Phase ${r.phaseNum} added to milestone "${r.milestone}"${r.plans.length ? ` (${r.plans.length} plan${r.plans.length === 1 ? '' : 's'}: ${r.plans.join(', ')})` : ''}`);
  if (dryRun) return;
  if (!noCommit) {
    const commit = lifecycle.gitCommit(root, `cp: scaffold-phase ${r.phaseNum} (${name})`, {
      paths: lifecycle.pathsFromActions(r.actions),
    });
    if (commit) console.log(`committed ${commit}`);
  }
}

module.exports = { name: 'scaffold-phase', run };
