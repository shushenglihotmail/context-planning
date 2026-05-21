'use strict';

/**
 * `cp reconcile <phaseNum>` — v0.8 P10 repair verb.
 *
 * Per-finding (or per-phase) backfill of base-commit / end-commit and
 * optional rewrite of expected-key-files. Atomic commit per change.
 *
 * Flags:
 *   --infer-shas        infer + write base-commit and end-commits for the phase
 *   --plan NN-MM        narrow scope to a single plan (paired with --accept or --infer-shas)
 *   --accept            rewrite expected-key-files from SUMMARY key-files (destructive)
 *   --dry-run           show what would change without writing or committing
 *   --json              machine-readable output
 *   --no-commit         apply changes but skip the atomic commit (for testing)
 *
 * Exit codes:
 *   0  changes applied (or nothing to do)
 *   1  partial failure (some reconcile operations could not resolve)
 *   2  usage error
 */

const path = require('path');
const { repoRoot } = require('../../lib/paths');
const reconcile = require('../../lib/reconcile');
const lifecycle = require('../../lib/lifecycle');
const audit = require('../../lib/audit');

function run(args = []) {
  let phaseNum = null;
  let planFilter = null;
  let inferShas = false;
  let accept = false;
  let dryRun = false;
  let json = false;
  let noCommit = false;
  let all = false;
  let phaseRangeSpec = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--infer-shas') inferShas = true;
    else if (a === '--accept') accept = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--json') json = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--all') all = true;
    else if (a === '--phase') phaseRangeSpec = String(args[++i] || '').trim();
    else if (a === '--plan') planFilter = String(args[++i] || '').trim();
    else if (a === '--help' || a === '-h') { printUsage(); process.exit(0); }
    else if (a && !a.startsWith('-') && phaseNum === null) phaseNum = a;
    else {
      process.stderr.write(`cp reconcile: unknown argument "${a}"\n`);
      process.exit(2);
    }
  }

  const isBulk = all || !!phaseRangeSpec;
  if (!isBulk && phaseNum === null) {
    process.stderr.write('cp reconcile: <phaseNum>, --all, or --phase <range> required\n');
    process.exit(2);
  }
  if (isBulk && phaseNum !== null) {
    process.stderr.write('cp reconcile: positional <phaseNum> conflicts with --all / --phase\n');
    process.exit(2);
  }
  if (!inferShas && !accept) {
    process.stderr.write('cp reconcile: one of --infer-shas or --accept is required\n');
    process.exit(2);
  }
  if (planFilter && !/^\d+(?:\.\d+)?-\d+$/.test(planFilter)) {
    process.stderr.write(`cp reconcile: invalid --plan "${planFilter}" (expected NN-MM)\n`);
    process.exit(2);
  }

  const root = repoRoot(process.cwd());

  // ----- bulk path (--all / --phase <range>) -----
  if (isBulk) {
    let phaseNums;
    if (all) {
      phaseNums = reconcile._listAllPhaseNums(root);
    } else {
      try {
        phaseNums = reconcile._parsePhaseRange(phaseRangeSpec);
      } catch (e) {
        process.stderr.write(`cp reconcile: --phase parse error: ${e.message}\n`);
        process.exit(2);
      }
    }
    return _runBulk(root, phaseNums, { inferShas, accept, dryRun, json, noCommit });
  }

  // ----- single-phase path (legacy) -----
  // Build the finding set we need to repair: re-run audit, then narrow.
  const auditRes = audit.runAudit(root, { phaseFilter: phaseNum });
  const findings = auditRes.findings.filter((f) => String(f.phaseNum) === String(phaseNum));

  const ops = [];

  if (inferShas) {
    // missing-base-commit (phase-level)
    const baseFindings = findings.filter((f) => f.id === 'missing-base-commit');
    for (const f of baseFindings) ops.push({ op: 'inferBase', finding: f });
    // missing-end-commit (plan-level)
    const endFindings = findings.filter((f) => f.id === 'missing-end-commit')
      .filter((f) => !planFilter || f.planId === planFilter);
    for (const f of endFindings) ops.push({ op: 'inferEnd', finding: f });

    // If no findings but user asked for --infer-shas, also try unconditional
    // backfill for the phase (covers fresh phases where audit returned 0).
    if (baseFindings.length === 0 && !planFilter) {
      ops.push({ op: 'inferBase', finding: { id: 'missing-base-commit', phaseNum } });
    }
  }

  if (accept) {
    const driftFindings = findings.filter((f) => f.id === 'expected-vs-actual-drift')
      .filter((f) => !planFilter || f.planId === planFilter);
    for (const f of driftFindings) ops.push({ op: 'accept', finding: f });
    if (driftFindings.length === 0) {
      process.stderr.write(`cp reconcile: no expected-vs-actual-drift findings to --accept\n`);
    }
  }

  const results = [];
  for (const o of ops) {
    try {
      let res;
      if (o.op === 'inferBase') res = reconcile.inferBaseCommit(root, o.finding.phaseNum, { dryRun });
      else if (o.op === 'inferEnd') res = reconcile.inferEndCommit(root, o.finding.planId, { dryRun });
      else if (o.op === 'accept') res = reconcile.acceptExpectedKeyFiles(root, o.finding.planId, { dryRun });
      else throw new Error(`unknown op ${o.op}`);

      // Commit atomically per change (unless dry-run / no-commit / nothing changed).
      let commit = null;
      if (!dryRun && !noCommit && res.changedPaths && res.changedPaths.length > 0) {
        const subject = _commitSubject(o, res);
        commit = lifecycle.gitCommit(root, subject, { paths: res.changedPaths });
      }
      results.push({ op: o.op, finding: o.finding, result: res, commit });
    } catch (err) {
      results.push({ op: o.op, finding: o.finding, error: err.message });
    }
  }

  const failed = results.filter((r) => r.error || (r.result && r.result.action === 'unresolvable'));
  const applied = results.filter((r) => r.result && (r.result.action === 'written' || r.result.action === 'would-write'));
  const skipped = results.filter((r) => r.result && r.result.action === 'already-set');

  if (json) {
    process.stdout.write(JSON.stringify({
      ok: failed.length === 0,
      phase: phaseNum,
      dryRun,
      applied: applied.length,
      skipped: skipped.length,
      failed: failed.length,
      results,
    }, null, 2) + '\n');
  } else {
    _printHuman(phaseNum, results, { dryRun });
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

/**
 * Bulk reconciler shared by --all and --phase <range>. Walks every phase
 * in `phaseNums`, runs the single-phase repair loop, batches results.
 */
function _runBulk(root, phaseNums, opts) {
  const { inferShas, accept, dryRun, json, noCommit } = opts;
  const auditRes = audit.runAudit(root);
  const aggResults = [];
  const perPhase = [];

  for (const phaseNum of phaseNums) {
    const findings = auditRes.findings.filter((f) => String(f.phaseNum) === String(phaseNum));
    const ops = [];
    if (inferShas) {
      const baseFindings = findings.filter((f) => f.id === 'missing-base-commit');
      for (const f of baseFindings) ops.push({ op: 'inferBase', finding: f });
      const endFindings = findings.filter((f) => f.id === 'missing-end-commit');
      for (const f of endFindings) ops.push({ op: 'inferEnd', finding: f });
    }
    if (accept) {
      const driftFindings = findings.filter((f) => f.id === 'expected-vs-actual-drift');
      for (const f of driftFindings) ops.push({ op: 'accept', finding: f });
    }
    const phaseResults = [];
    for (const o of ops) {
      try {
        let res;
        if (o.op === 'inferBase') res = reconcile.inferBaseCommit(root, o.finding.phaseNum, { dryRun });
        else if (o.op === 'inferEnd') res = reconcile.inferEndCommit(root, o.finding.planId, { dryRun });
        else if (o.op === 'accept') res = reconcile.acceptExpectedKeyFiles(root, o.finding.planId, { dryRun });
        else throw new Error(`unknown op ${o.op}`);

        let commit = null;
        if (!dryRun && !noCommit && res.changedPaths && res.changedPaths.length > 0) {
          const subject = _commitSubject(o, res);
          commit = lifecycle.gitCommit(root, subject, { paths: res.changedPaths });
        }
        phaseResults.push({ op: o.op, finding: o.finding, result: res, commit });
      } catch (err) {
        phaseResults.push({ op: o.op, finding: o.finding, error: err.message });
      }
    }
    if (phaseResults.length > 0) {
      perPhase.push({ phaseNum, results: phaseResults });
      aggResults.push(...phaseResults);
    }
  }

  const failed = aggResults.filter((r) => r.error || (r.result && r.result.action === 'unresolvable'));
  const applied = aggResults.filter((r) => r.result && (r.result.action === 'written' || r.result.action === 'would-write'));
  const skipped = aggResults.filter((r) => r.result && r.result.action === 'already-set');

  if (json) {
    process.stdout.write(JSON.stringify({
      ok: failed.length === 0,
      bulk: true,
      phasesScanned: phaseNums.length,
      phasesWithChanges: perPhase.length,
      dryRun,
      applied: applied.length,
      skipped: skipped.length,
      failed: failed.length,
      perPhase,
    }, null, 2) + '\n');
  } else {
    const tag = dryRun ? '(dry-run) ' : '';
    process.stdout.write(
      `${tag}cp reconcile — bulk (${phaseNums.length} phases scanned, ${perPhase.length} had changes)\n`
    );
    for (const p of perPhase) {
      _printHuman(p.phaseNum, p.results, { dryRun });
    }
    process.stdout.write(
      `\nTotals: ${applied.length} applied, ${skipped.length} skipped, ${failed.length} failed.\n`
    );
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

function _commitSubject(o, res) {
  if (o.op === 'inferBase') return `cp(reconcile): phase ${o.finding.phaseNum} base-commit ${res.sha.slice(0, 12)}`;
  if (o.op === 'inferEnd') return `cp(reconcile): ${o.finding.planId} end-commit ${res.sha.slice(0, 12)}`;
  if (o.op === 'accept') return `cp(reconcile): ${o.finding.planId} accept expected-key-files`;
  return `cp(reconcile): ${o.op}`;
}

function _printHuman(phaseNum, results, opts) {
  const tag = opts.dryRun ? '(dry-run) ' : '';
  process.stdout.write(`${tag}cp reconcile — phase ${phaseNum}\n`);
  if (results.length === 0) {
    process.stdout.write('  Nothing to reconcile.\n');
    return;
  }
  for (const r of results) {
    if (r.error) {
      process.stdout.write(`  ✗ ${r.op} (${r.finding && r.finding.planId || r.finding && r.finding.phaseNum}): ${r.error}\n`);
      continue;
    }
    const res = r.result || {};
    const mark = res.action === 'written' ? '✓' : res.action === 'would-write' ? '·' : res.action === 'already-set' ? '–' : '✗';
    process.stdout.write(`  ${mark} ${r.op}: ${res.detail}${r.commit ? ` (${r.commit})` : ''}\n`);
  }
}

function printUsage() {
  process.stdout.write(`Usage: cp reconcile <phaseNum> [--infer-shas|--accept] [--plan NN-MM]
                          [--dry-run] [--json] [--no-commit]
       cp reconcile --all [--infer-shas|--accept] [--dry-run] [--json] [--no-commit]
       cp reconcile --phase <range> [--infer-shas|--accept] [--dry-run] [--json] [--no-commit]

  <range>: "5", "5-8", "5..8", "5,7,9", "5,7-9"
`);
}

module.exports = { run };
