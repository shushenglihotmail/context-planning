'use strict';

const path = require('path');
const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/lifecycle');
const codebaseMapper = require('../../lib/codebase-mapper');

function run(args = []) {
  const root = repoRoot();
  let dryRun = false;
  let force = false;
  let noCommit = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--force') force = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }

  let r;
  try {
    r = codebaseMapper.scaffoldCodebase(root, { dryRun, force });
  } catch (e) {
    console.error(`scaffold-codebase: ${e.message}`);
    process.exit(1);
  }

  for (const a of r.actions) {
    const rel = path.relative(root, a.path);
    const mark = dryRun ? '·' : (a.kind === 'mkdir' ? '+' : '✓');
    console.log(`${mark} ${a.kind.padEnd(5)} ${rel}`);
  }
  if (r.skipped.length) {
    console.log(`\nSkipped ${r.skipped.length} existing file(s) — use --force to overwrite:`);
    for (const s of r.skipped) console.log(`  = ${s}`);
  }
  console.log(`\nCodebase dir: ${path.relative(root, r.codebaseDir)}`);
  console.log(`Created:      ${r.created.length} stub(s)`);
  if (dryRun) return;
  if (!noCommit && r.actions.some((a) => a.kind === 'write' || a.kind === 'mkdir')) {
    const commit = lifecycle.gitCommit(root, `cp: scaffold-codebase (${r.created.length} stubs)`, {
      paths: lifecycle.pathsFromActions(r.actions),
    });
    if (commit) console.log(`committed     ${commit}`);
  }
  if (r.created.length > 0) {
    console.log(`\nNext: run /cp-map-codebase to fill the stubs with a real analysis.`);
  }
}

module.exports = { name: 'scaffold-codebase', run };
