'use strict';

/**
 * `cp autonomous` — v0.10 P36.
 *
 * Walks pending phases of the active milestone, delegating per-phase
 * planning + execution to caller-supplied hooks. Smart-gated on test
 * failure, audit HIGH, and executor deviation; stops cleanly via
 * `.planning/.continue-here.md`.
 *
 * From the CLI alone (no skill wrapping), the per-phase delegation
 * callbacks are not available — so the bare CLI is most useful for
 * --check / --json previews and for unit-test fixtures. The full
 * autonomous loop is driven by `/cp-autonomous` (phase 37) which
 * supplies the real per-phase callbacks.
 *
 * Flags:
 *   --scope=<value>   phase | <N> | <N>-<M> | milestone (default: milestone)
 *   --check           Preview; exit 1 if any phase would run.
 *   --json            Machine-readable structured output.
 *   --quiet           Suppress per-phase progress lines.
 *
 * Exit codes:
 *   0  success (nothing to do, or all in-scope phases completed)
 *   1  --check found pending work, or stopped at a smart gate
 *   2  hard error (usage, no active milestone, invalid scope)
 */

const { repoRoot } = require('../../lib/paths');
const autonomous = require('../../lib/autonomous');

async function run(args = []) {
  let scopeArg;
  let startArg;
  let check = false;
  let json = false;
  let quiet = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--check') check = true;
    else if (a === '--json') { json = true; quiet = true; }
    else if (a === '--quiet') quiet = true;
    else if (a === '--help' || a === '-h') { printUsage(); process.exit(0); }
    else if (a.startsWith('--scope=')) scopeArg = a.slice('--scope='.length);
    else if (a === '--scope') { scopeArg = args[++i]; }
    else if (a.startsWith('--')) {
      process.stderr.write(`cp autonomous: unknown flag "${a}"\n`);
      printUsage();
      process.exit(2);
    } else {
      if (startArg !== undefined) {
        process.stderr.write(`cp autonomous: unexpected positional "${a}" (START already set to "${startArg}")\n`);
        process.exit(2);
      }
      startArg = a;
    }
  }

  const root = repoRoot(process.cwd());
  const result = await autonomous.runAutonomous(root, {
    start: startArg,
    scope: scopeArg,
    dryRun: check,
  });

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }

  // Hard errors → exit 2.
  if (!result.ok && !result.stopped) {
    if (!json) {
      process.stderr.write(`cp autonomous: ${result.reason}: ${result.message || ''}\n`);
    }
    process.exit(2);
  }

  // --check path
  if (check) {
    if (!json && !quiet) {
      if (result.phasesWouldRun && result.phasesWouldRun.length) {
        process.stdout.write(
          `cp autonomous --check: ${result.phasesWouldRun.length} phase(s) would run ` +
          `(${result.totalPlans} pending plan(s)).\n` +
          `  Milestone: ${result.milestone}\n` +
          `  Phases:    ${result.phasesWouldRun.join(', ')}\n`
        );
      } else {
        process.stdout.write('cp autonomous --check: nothing pending.\n');
      }
    }
    process.exit(result.phasesWouldRun && result.phasesWouldRun.length ? 1 : 0);
  }

  // Real run — surface stopped state.
  if (result.stopped) {
    if (!json) {
      process.stderr.write(
        `\ncp autonomous: STOPPED at phase ${result.failedPhase}` +
        (result.failedPlan ? ` plan ${result.failedPlan}` : '') +
        `\n  Reason: ${result.stopReason}\n` +
        (result.continueHere ? `  See:    ${result.continueHere}\n` : '')
      );
    }
    process.exit(1);
  }

  // Success
  if (!json && !quiet) {
    process.stdout.write(
      `\ncp autonomous: COMPLETE\n` +
      `  Milestone:        ${result.milestone}\n` +
      `  Phases processed: ${result.phasesProcessed.map((p) => p.phase).join(', ')}\n` +
      `  Total plans:      ${result.phasesProcessed.reduce((s, p) => s + p.plans, 0)}\n`
    );
  }
  process.exit(0);
}

function printUsage() {
  process.stdout.write(
    'Usage: cp autonomous [START] [--scope=<value>] [--check] [--json] [--quiet]\n' +
    '\n' +
    '  Walks pending phases of the active milestone autonomously.\n' +
    '  Bounded to a single milestone. Smart-gated on test/audit/deviation.\n' +
    '\n' +
    'START (optional):\n' +
    '  (omitted)            auto-detect from STATE.md\n' +
    '  <phase-number>       e.g. "32" — start at this phase\n' +
    '  "<milestone-name>"   e.g. "v0.10 Autonomy" — first pending phase\n' +
    '\n' +
    'Flags:\n' +
    '  --scope=phase        just the START phase\n' +
    '  --scope=<N>          next N phases from START (inclusive)\n' +
    '  --scope=<N>-<M>      explicit phase range (e.g. --scope=32-34)\n' +
    '  --scope=milestone    all remaining phases in milestone (DEFAULT)\n' +
    '  --check              preview only; exit 1 if anything would run.\n' +
    '  --json               structured machine-readable output.\n' +
    '  --quiet              suppress progress lines.\n' +
    '\n' +
    'NOTE: the bare CLI is most useful for --check previews. Full\n' +
    'autonomous execution is driven by /cp-autonomous (slash skill).\n'
  );
}

module.exports = { name: 'autonomous', run };
