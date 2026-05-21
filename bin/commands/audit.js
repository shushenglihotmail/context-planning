'use strict';

/**
 * `cp audit` — Tier 3 (detect + repair) drift sweep.
 *
 * Read-only by default. With `--fix`, runs the audit-fix orchestrator:
 * classifies findings into auto/manual/skip and applies auto-fixers
 * with one atomic git commit per fix (cap via --max).
 *
 * Exit codes:
 *   0  no findings (or --fix cleaned everything)
 *   1  LOW/MEDIUM findings only (read-only) OR --fix had failures
 *   2  any HIGH finding, or any finding with --strict, or usage error
 *      OR --fix succeeded but manual findings remain
 */

const path = require('path');
const { repoRoot } = require('../../lib/paths');
const audit = require('../../lib/audit');
const auditFix = require('../../lib/audit-fix');

function run(args = []) {
  let json = false;
  let strict = false;
  let milestoneFilter = null;
  let phaseFilter = null;
  let quiet = false;
  // v0.8 P8 --fix mode
  let fixMode = false;
  let maxFixes = 5;
  let fixSeverity = 'all';
  let fixDryRun = false;
  let fixInteractive = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') json = true;
    else if (a === '--strict') strict = true;
    else if (a === '--quiet') quiet = true;
    else if (a === '--milestone') milestoneFilter = args[++i];
    else if (a === '--phase') phaseFilter = args[++i];
    else if (a === '--fix') fixMode = true;
    else if (a === '--max') maxFixes = parseInt(args[++i], 10);
    else if (a === '--severity') fixSeverity = String(args[++i] || '').toLowerCase();
    else if (a === '--dry-run') fixDryRun = true;
    else if (a === '--interactive') fixInteractive = true;
    else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`unknown option: ${a}`);
      printUsage();
      process.exit(2);
    }
  }

  if (Number.isNaN(maxFixes) || maxFixes < 1) {
    console.error('cp audit --fix: --max must be a positive integer');
    process.exit(2);
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

  // ---- --fix path ----
  if (fixMode) {
    if (fixInteractive) {
      process.stderr.write('cp audit --fix --interactive: not yet implemented in v0.8 — proceeding non-interactively.\n');
    }
    const classified = auditFix.classify(findings, { severity: fixSeverity });
    const fixResult = auditFix.applyFixes(root, classified.auto, { max: maxFixes, dryRun: fixDryRun });
    const summaryFix = auditFix.summarize(fixResult.applied, classified.manual, fixResult.failed);

    if (json) {
      process.stdout.write(JSON.stringify({
        findings, summary,
        classify: {
          auto: classified.auto.length,
          manual: classified.manual.length,
          skip: classified.skip.length,
        },
        fix: {
          applied: fixResult.applied.map((a) => ({ id: a.finding.id, location: a.finding.location, commit: a.commit, dryRun: !!a.dryRun })),
          failed: fixResult.failed.map((f) => ({ id: f.finding.id, error: f.error })),
          stopped: fixResult.stopped,
        },
        summary_fix: summaryFix,
      }, null, 2) + '\n');
    } else {
      printFixHuman(classified, fixResult, summaryFix, fixDryRun);
    }

    // exit code policy: failed → 1; manual remain → 2; otherwise 0.
    let code;
    if (fixResult.failed.length > 0) code = 1;
    else if (classified.manual.length > 0) code = 2;
    else code = 0;
    process.exit(code);
  }

  // ---- read-only path ----
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

function printFixHuman(classified, fixResult, summaryFix, dryRun) {
  process.stdout.write(`\ncp audit --fix${dryRun ? ' (dry-run)' : ''}\n`);
  process.stdout.write(`  auto:    ${classified.auto.length}\n`);
  process.stdout.write(`  manual:  ${classified.manual.length}\n`);
  process.stdout.write(`  skip:    ${classified.skip.length}\n`);

  if (fixResult.applied.length > 0) {
    process.stdout.write(`\nApplied (${fixResult.applied.length}):\n`);
    for (const a of fixResult.applied) {
      const tag = a.dryRun ? '[dry-run]' : (a.commit || '(no-commit)');
      process.stdout.write(`  ✓ ${a.finding.id} @ ${a.finding.location || '(no location)'}  ${tag}\n`);
    }
  }
  if (fixResult.failed.length > 0) {
    process.stdout.write(`\nFailed (${fixResult.failed.length}):\n`);
    for (const f of fixResult.failed) {
      process.stdout.write(`  ✗ ${f.finding.id}: ${f.error}\n`);
    }
    process.stdout.write('Loop stopped on first failure. Re-run after addressing the cause.\n');
  }
  if (classified.manual.length > 0) {
    process.stdout.write(`\nManual (${classified.manual.length}) — these need you:\n`);
    for (const m of classified.manual) {
      process.stdout.write(`  • [${m.finding.severity}] ${m.finding.id} @ ${m.finding.location || '(no location)'}\n`);
      process.stdout.write(`      ${m.suggestion}\n`);
    }
  }
  process.stdout.write(`\nSummary: applied=${summaryFix.applied}, manual=${summaryFix.manual}, failed=${summaryFix.failed}\n`);
}

function printUsage() {
  process.stderr.write(
    'Usage: cp audit [--json] [--strict] [--milestone <name>] [--phase <N>] [--quiet]\n' +
    '       cp audit --fix [--max N] [--severity high|medium|all] [--dry-run] [--interactive]\n' +
    '                     [--milestone <name>] [--phase <N>] [--json]\n' +
    '\n' +
    'Detect mode (no --fix):\n' +
    '  --json       Emit JSON { findings, summary, exit_code }\n' +
    '  --strict     Exit 2 on any finding (default: only HIGH triggers 2)\n' +
    '  --milestone  Limit to one milestone (by name)\n' +
    '  --phase      Limit to one phase (by number)\n' +
    '  --quiet      Suppress "no findings" line on clean runs\n' +
    '\n' +
    'Fix mode (--fix):\n' +
    '  --max N      Cap auto-fixes per run (default 5)\n' +
    '  --severity   Only fix findings at or above this level (default all)\n' +
    '  --dry-run    Plan fixes without committing or mutating\n' +
    '  --interactive Prompt per fix (v0.8: warns + falls back to non-interactive)\n' +
    '\n' +
    'Detect exit codes: 0 = clean; 1 = LOW/MEDIUM; 2 = HIGH (or --strict + any).\n' +
    'Fix exit codes:    0 = all clean; 1 = any failed; 2 = manual findings remain.\n'
  );
}

module.exports = { name: 'audit', run };
