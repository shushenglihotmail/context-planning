'use strict';

/**
 * `cp deviate <phaseNum> --summary "<text>" [--reason "<text>"] [--dry-run] [--no-commit]`
 *
 * v0.8 P10 — append a dated `## Deviation YYYY-MM-DD` block to phase PLAN.md.
 * Atomic commit `cp(deviate): N <summary>`.
 */

const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/lifecycle');

function run(args = []) {
  let phaseNum = null;
  let summary = null;
  let reason = '';
  let dryRun = false;
  let json = false;
  let noCommit = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--summary') summary = args[++i];
    else if (a === '--reason') reason = args[++i] || '';
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--json') json = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--help' || a === '-h') { printUsage(); process.exit(0); }
    else if (a && !a.startsWith('-') && phaseNum === null) phaseNum = a;
    else {
      process.stderr.write(`cp deviate: unknown argument "${a}"\n`);
      process.exit(2);
    }
  }

  if (!phaseNum) {
    process.stderr.write('cp deviate: <phaseNum> required (e.g. `cp deviate 12 --summary "..."`)\n');
    process.exit(2);
  }
  if (!summary || !summary.trim()) {
    process.stderr.write('cp deviate: --summary "<text>" required\n');
    process.exit(2);
  }

  const root = repoRoot(process.cwd());
  let result;
  try {
    result = lifecycle.recordDeviation(root, phaseNum, { summary, reason, dryRun });
  } catch (err) {
    if (json) {
      process.stdout.write(JSON.stringify({ ok: false, error: err.message }) + '\n');
    } else {
      process.stderr.write(`cp deviate: ${err.message}\n`);
    }
    process.exit(2);
  }

  let commit = null;
  if (!dryRun && !noCommit && result.actions.length > 0) {
    const paths = result.actions.map((a) => a.path);
    const short = summary.trim().slice(0, 60);
    const subject = `cp(deviate): ${phaseNum} ${short}`;
    commit = lifecycle.gitCommit(root, subject, { paths });
  }

  if (json) {
    process.stdout.write(JSON.stringify({
      ok: true,
      phase: phaseNum,
      summary,
      reason,
      dryRun,
      changed: result.actions.length > 0,
      commit,
      files: result.actions.map((a) => a.path),
    }, null, 2) + '\n');
  } else {
    const tag = dryRun ? '(dry-run) ' : '';
    process.stdout.write(`${tag}cp deviate: phase ${phaseNum} — ${summary.trim()}${commit ? ` (${commit})` : ''}\n`);
  }
  process.exit(0);
}

function printUsage() {
  process.stdout.write(`Usage: cp deviate <phaseNum> --summary "<text>" [--reason "<text>"]
                          [--dry-run] [--json] [--no-commit]
`);
}

module.exports = { run };
