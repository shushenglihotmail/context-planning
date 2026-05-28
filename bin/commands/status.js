'use strict';

const pkg = require('../../package.json');
const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/lifecycle');
const runLifecycle = require('../../lib/run-lifecycle');

function run(args = []) {
  const json = args.includes('--json');
  // Dispatch: if a positional arg is given, show single-run status.
  const positional = args.find(a => !a.startsWith('--'));
  if (positional) {
    const r = runLifecycle.singleRunStatus(positional, { projectDir: repoRoot() });
    if (json) {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
      return;
    }
    if (!r.ok) { console.error(`cp status: ${r.error}`); process.exit(1); }
    const s = r.state;
    console.log(`Run:        ${s.run_id}`);
    console.log(`Workflow:   ${s.workflow || '-'}`);
    console.log(`Milestone:  ${s.milestone || '-'}`);
    console.log(`Status:     ${s.status || '-'}`);
    console.log(`Current:    ${s.current_phase || '-'}`);
    console.log(`Updated:    ${s.updated || '-'}`);
    if (s.phases && Object.keys(s.phases).length) {
      console.log('Phases:');
      for (const [pid, p] of Object.entries(s.phases)) {
        console.log(`  ${p.status === 'completed' ? '✓' : '·'} ${pid}: ${p.status || '-'}`);
      }
    }
    return;
  }
  const root = repoRoot();
  const r = lifecycle.statusReport(root);
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
    return;
  }
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  console.log(`cp v${pkg.version}`);
  console.log(`Repo:        ${root}`);
  console.log(`Milestone:   ${r.milestone || '(none in-progress)'}${r.milestoneStatus ? ` [${r.milestoneStatus}]` : ''}`);
  if (r.phases.length === 0) {
    console.log('Phases:      (none yet — run `/cp-autonomous` or `cp scaffold-phase 1`)');
  } else {
    console.log('Phases:');
    for (const p of r.phases) {
      const bar = p.total > 0 ? `${p.done}/${p.total}` : '0/0';
      const mark = p.total > 0 && p.done === p.total ? '✓' : '·';
      console.log(`  ${mark} Phase ${p.num} ${p.name}: ${bar} plans done`);
    }
  }
  if (r.nextPlan) {
    console.log(`\nNext plan:   ${r.nextPlan.planId} (Phase ${r.nextPlan.phaseNum}: ${r.nextPlan.phaseName})`);
    console.log(`             ${r.nextPlan.desc}`);
    console.log(`\nDo:          /cp-execute-phase ${r.nextPlan.phaseNum}`);
  } else if (r.milestone && r.milestoneStatus === 'shipped') {
    console.log(`\nMilestone "${r.milestone}" is shipped. Start the next one:`);
    console.log(`  cp new-milestone "<name>"   (or /cp-new-milestone)`);
  } else if (r.milestone) {
    console.log(`\nAll plans done. Run \`cp complete-milestone\` (or \`/cp-complete-milestone\`).`);
  } else {
    console.log(`\nNo milestone in progress. Start one:`);
    console.log(`  cp new-milestone "<name>"   (or /cp-new-milestone)`);
  }
}

module.exports = { name: 'status', run };
