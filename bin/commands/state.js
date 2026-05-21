'use strict';

/**
 * `cp state <subcommand>` — STATE.md management.
 *
 * v0.8 Phase 20: explicit verb for regenerating the derived block of
 * STATE.md. Useful after pulling colleagues' commits, hand-editing
 * ROADMAP, or when the auto-regen in tick/write-summary somehow skipped.
 *
 * Subcommands:
 *   regen [--dry-run] [--quiet]
 *
 * Exit codes:
 *   0 — rewrote or unchanged
 *   1 — derive failed / unexpected error
 *   2 — bad args / unknown subcommand
 */

const { repoRoot } = require('../../lib/paths');
const state = require('../../lib/state');

function usage(stream = process.stderr, code = 2) {
  stream.write([
    'Usage: cp state <subcommand> [options]',
    '',
    'Subcommands:',
    '  regen [--dry-run] [--quiet]    Regenerate derived block of STATE.md',
    '',
  ].join('\n'));
  process.exit(code);
}

function runRegen(args) {
  let dryRun = false;
  let quiet = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--quiet' || a === '-q') quiet = true;
    else if (a === '--help' || a === '-h') usage(process.stdout, 0);
    else {
      process.stderr.write(`cp state regen: unknown option: ${a}\n`);
      process.exit(2);
    }
  }
  const root = repoRoot();
  let result;
  try {
    result = state.regenerate(root, { dryRun });
  } catch (err) {
    process.stderr.write(`cp state regen: failed: ${err.message}\n`);
    process.exit(1);
  }
  if (result.action === 'skipped') {
    if (!quiet) process.stderr.write(`cp state regen: skipped (${result.reason})\n`);
    process.exit(0);
  }
  if (result.action === 'unchanged') {
    if (!quiet) process.stdout.write('cp state regen: unchanged\n');
    process.exit(0);
  }
  if (result.action === 'rewritten') {
    const tag = dryRun ? ' (dry-run)' : '';
    if (!quiet) {
      const d = result.derived || {};
      process.stdout.write(
        `cp state regen: rewritten${tag} — phase=${d.phase ?? '-'} plan=${d.plan ?? '-'} status=${d.status ?? '-'} ${d.progressPercent ?? 0}%\n`
      );
    }
    process.exit(0);
  }
  process.stdout.write(`cp state regen: ${result.action}\n`);
  process.exit(0);
}

function run(args = []) {
  if (args.length === 0) usage();
  const [sub, ...rest] = args;
  if (sub === 'regen') return runRegen(rest);
  if (sub === '--help' || sub === '-h' || sub === 'help') usage(process.stdout, 0);
  process.stderr.write(`cp state: unknown subcommand: ${sub}\n`);
  usage();
}

module.exports = { name: 'state', run };
