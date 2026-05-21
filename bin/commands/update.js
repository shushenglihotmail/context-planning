'use strict';

/**
 * `cp update` — v0.9 P33 case-4 onboarding helper.
 *
 * Refreshes per-repo cp state (skill files, config defaults, drift fixes).
 * The documented user-facing invocation is the npx-fronted one-liner:
 *
 *     npx -y --package=context-planning@latest -- cp update
 *
 * That single command fetches the latest cp via npx (per-user cache, no
 * sudo) and runs `cp update` against the cwd.
 *
 * Flags:
 *   --dry-run     Preview without writing.
 *   --check       Exit 1 if anything would change (CI-friendly).
 *   --quiet       Suppress non-essential output.
 *   --json        Machine-readable summary.
 *
 * Exit codes:
 *   0  nothing to do, or update applied successfully
 *   1  --check found pending changes, or audit-fix had partial failures
 *   2  .planning/ missing, no harness detected, or usage error
 */

const { repoRoot } = require('../../lib/paths');
const update = require('../../lib/update');

function run(args = []) {
  let dryRun = false;
  let check = false;
  let quiet = false;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--check') { check = true; dryRun = true; }
    else if (a === '--quiet') quiet = true;
    else if (a === '--json') { json = true; quiet = true; }
    else if (a === '--help' || a === '-h') { printUsage(); process.exit(0); }
    else {
      process.stderr.write(`cp update: unknown argument "${a}"\n`);
      printUsage();
      process.exit(2);
    }
  }

  const root = repoRoot(process.cwd());
  const result = update.runUpdate(root, { dryRun, check, quiet });

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }

  if (!result.ok) {
    if (!json) process.stderr.write(`${result.message}\n`);
    process.exit(2);
  }

  if (check && result.changed) {
    if (!quiet) process.stdout.write('\ncp update --check: changes pending. Re-run without --check to apply.\n');
    process.exit(1);
  }

  // Failed steps (e.g. audit-fix could not commit) — surface as exit 1.
  const stepFailed = result.steps.some((s) => s.failed && s.failed > 0);
  process.exit(stepFailed ? 1 : 0);
}

function printUsage() {
  process.stdout.write(
    'Usage: cp update [--dry-run | --check] [--quiet] [--json]\n' +
    '\n' +
    '  Refreshes per-repo cp state: skill files, config defaults, drift fixes.\n' +
    '  Does NOT touch the npm package itself — use the npx one-liner for that:\n' +
    '\n' +
    '    npx -y --package=context-planning@latest -- cp update\n' +
    '\n' +
    'Flags:\n' +
    '  --dry-run   Preview without writing.\n' +
    '  --check     Exit 1 if anything would change (CI-friendly). Implies --dry-run.\n' +
    '  --quiet     Suppress non-essential output.\n' +
    '  --json      Machine-readable summary (implies --quiet).\n'
  );
}

module.exports = { name: 'update', run };
