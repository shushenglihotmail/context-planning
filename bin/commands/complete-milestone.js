'use strict';

const path = require('path');
const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/lifecycle');

function run(args = []) {
  const root = repoRoot();
  let name = null;
  let dryRun = false;
  let noCommit = false;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--json') json = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!name) name = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }

  const r = lifecycle.completeMilestone(root, { name, dryRun, noCommit });

  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
    return;
  }

  if (!r.ok) {
    console.error(`complete-milestone: ${r.reason}`);
    if (r.reason === 'incomplete') {
      console.error(`\nMilestone "${r.milestone}" still has work to do:`);
      for (const rep of r.verify.reports.filter(x => !x.ok)) {
        console.error(`  Phase ${rep.phaseNum} ${rep.name}: plans ${rep.plansDone}/${rep.plansTotal} done; missing SUMMARY: ${rep.summariesMissing.join(', ') || '—'}`);
      }
    } else if (r.hint) {
      console.error(r.hint);
    }
    process.exit(1);
  }

  console.log(`Milestone:   ${r.milestone}`);
  console.log(`Phases:      ${r.phases.join(', ')}`);
  console.log(`Subsystems:  ${r.agg.subsystems.join(', ') || '—'}`);
  console.log(`Files:       ${r.agg.filesCreated.length} created, ${r.agg.filesModified.length} modified`);
  console.log(`\nActions${dryRun ? ' (dry-run)' : ''}:`);
  for (const a of r.actions) {
    const rel = path.relative(root, a.path);
    const mark = a.kind === 'write' ? '✓' : a.kind === 'delete' ? '✗' : '·';
    console.log(`  ${mark} ${a.kind.padEnd(6)} ${rel}${a.reason ? '  (' + a.reason + ')' : ''}`);
  }
  if (!dryRun && r.commit) console.log(`\nCommitted:   ${r.commit}`);
}

module.exports = { name: 'complete-milestone', run };
