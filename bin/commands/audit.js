'use strict';

/**
 * `cp audit` — Tier 3 (detect) drift sweep.
 *
 * Read-only. Walks .planning/ and reports drift findings with severity,
 * location, and a recommended fix.
 *
 * Exit codes:
 *   0  no findings
 *   1  LOW/MEDIUM findings only
 *   2  any HIGH finding, or any finding with --strict, or usage error
 */

const path = require('path');
const { repoRoot } = require('../../lib/paths');
const audit = require('../../lib/audit');

function run(args = []) {
  let json = false;
  let strict = false;
  let milestoneFilter = null;
  let phaseFilter = null;
  let quiet = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') json = true;
    else if (a === '--strict') strict = true;
    else if (a === '--quiet') quiet = true;
    else if (a === '--milestone') milestoneFilter = args[++i];
    else if (a === '--phase') phaseFilter = args[++i];
    else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`unknown option: ${a}`);
      printUsage();
      process.exit(2);
    }
  }

  const root = repoRoot();

  let result;
  try {
    result = audit.runAudit(root, { milestone: milestoneFilter, phase: phaseFilter });
  } catch (e) {
    if (json) {
      process.stdout.write(JSON.stringify({ error: e.message, exit_code: 2 }, null, 2) + '\n');
    } else {
      process.stderr.write(`cp audit: ${e.message}\n`);
    }
    process.exit(2);
  }

  const { findings, summary } = result;
  const hasHigh = summary.high > 0;
  const any = summary.total > 0;
  const exitCode = hasHigh ? 2 : (strict && any ? 2 : (any ? 1 : 0));

  if (json) {
    process.stdout.write(JSON.stringify({ findings, summary, exit_code: exitCode }, null, 2) + '\n');
    process.exit(exitCode);
  }

  if (!any) {
    if (!quiet) process.stdout.write(`cp audit: no findings (0 HIGH, 0 MEDIUM, 0 LOW)\n`);
    process.exit(0);
  }

  // Human output: grouped by severity
  const groups = [
    ['HIGH', findings.filter((f) => f.severity === 'HIGH')],
    ['MEDIUM', findings.filter((f) => f.severity === 'MEDIUM')],
    ['LOW', findings.filter((f) => f.severity === 'LOW')],
  ];

  for (const [sev, list] of groups) {
    if (list.length === 0) continue;
    process.stdout.write(`\n[${sev}] (${list.length})\n`);
    for (const f of list) {
      process.stdout.write(`  • ${f.id}: ${f.message}\n`);
      process.stdout.write(`    at ${f.location}\n`);
      if (f.fix) process.stdout.write(`    fix: ${f.fix}\n`);
    }
  }

  process.stdout.write(`\nSummary: ${summary.high} HIGH, ${summary.medium} MEDIUM, ${summary.low} LOW (${summary.total} total)\n`);
  if (strict && any) {
    process.stdout.write('--strict: exiting 2 on any finding.\n');
  }
  process.exit(exitCode);
}

function printUsage() {
  process.stderr.write(
    'Usage: cp audit [--json] [--strict] [--milestone <name>] [--phase <N>] [--quiet]\n' +
    '\n' +
    '  --json       Emit JSON { findings, summary, exit_code }\n' +
    '  --strict     Exit 2 on any finding (default: only HIGH triggers 2)\n' +
    '  --milestone  Limit to one milestone (by name)\n' +
    '  --phase      Limit to one phase (by number)\n' +
    '  --quiet      Suppress "no findings" line on clean runs\n' +
    '\n' +
    'Exit codes: 0 = clean; 1 = LOW/MEDIUM only; 2 = HIGH (or --strict + any).\n'
  );
}

module.exports = { name: 'audit', run };
