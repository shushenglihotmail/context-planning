'use strict';

/**
 * `cp supersede <planId> --by <newPlanId> [--reason <text>] [--dry-run] [--no-commit]`
 *
 * v0.8 P10 — replace plan checkbox with `[~]` and append a "Superseded by"
 * note in PLAN.md. Atomic commit `cp(supersede): NN-MM superseded by X-YY`.
 */

const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/lifecycle');

function run(args = []) {
  let planId = null;
  let by = null;
  let reason = '';
  let dryRun = false;
  let json = false;
  let noCommit = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--by') by = args[++i];
    else if (a === '--reason') reason = args[++i] || '';
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--json') json = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--help' || a === '-h') { printUsage(); process.exit(0); }
    else if (a && !a.startsWith('-') && planId === null) planId = a;
    else {
      process.stderr.write(`cp supersede: unknown argument "${a}"\n`);
      process.exit(2);
    }
  }

  if (!planId) {
    process.stderr.write('cp supersede: <planId> required (e.g. `cp supersede 12-02 --by 14-01`)\n');
    process.exit(2);
  }
  if (!by) {
    process.stderr.write('cp supersede: --by <newPlanId> required\n');
    process.exit(2);
  }

  const root = repoRoot(process.cwd());
  let result;
  try {
    result = lifecycle.supersedePlan(root, planId, { by, reason, dryRun });
  } catch (err) {
    if (json) {
      process.stdout.write(JSON.stringify({ ok: false, error: err.message }) + '\n');
    } else {
      process.stderr.write(`cp supersede: ${err.message}\n`);
    }
    process.exit(2);
  }

  let commit = null;
  if (!dryRun && !noCommit && result.actions.length > 0) {
    const paths = result.actions.map((a) => a.path);
    const subject = `cp(supersede): ${planId} superseded by ${by}`;
    commit = lifecycle.gitCommit(root, subject, { paths });
  }

  const changed = result.actions.length > 0;
  if (json) {
    process.stdout.write(JSON.stringify({
      ok: true,
      planId, by, reason,
      dryRun,
      changed,
      roadmapChanged: result.roadmapChanged,
      planChanged: result.planChanged,
      commit,
      files: result.actions.map((a) => a.path),
    }, null, 2) + '\n');
  } else {
    const tag = dryRun ? '(dry-run) ' : '';
    process.stdout.write(`${tag}cp supersede: ${planId} → [~] (by ${by})${commit ? ` (${commit})` : ''}\n`);
    if (!changed) process.stdout.write('  (no changes — was the plan already superseded?)\n');
  }
  process.exit(changed ? 0 : 0);
}

function printUsage() {
  process.stdout.write(`Usage: cp supersede <planId> --by <newPlanId> [--reason "<text>"]
                           [--dry-run] [--json] [--no-commit]
`);
}

module.exports = { run };
