'use strict';

const path = require('path');
const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/lifecycle');

function run(args = []) {
  const root = repoRoot();
  let name = null;
  let dryRun = false;
  let noCommit = false;
  let json = false;
  let noAudit = false;
  let auditWarn = false;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--json') json = true;
    else if (a === '--no-audit') noAudit = true;
    else if (a === '--audit-warn') auditWarn = true;
    else if (a === '--force') force = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!name) name = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }

  if (noAudit) {
    console.error('cp: --no-audit override — consistency gate SKIPPED for this complete-milestone run.');
  }
  if (force) {
    console.error('cp: --force override — verify gate SKIPPED for this complete-milestone run.');
  }

  const r = lifecycle.completeMilestone(root, { name, dryRun, noCommit, noAudit, auditWarn, force });

  if (json) {
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok && (r.reason === 'audit-failed' || r.reason === 'audit-error')) process.exit(2);
    else process.exit(r.ok ? 0 : 1);
    return;
  }

  if (!r.ok) {
    console.error(`complete-milestone: ${r.reason}`);
    if (r.reason === 'incomplete') {
      console.error(`\nMilestone "${r.milestone}" still has work to do:`);
      for (const rep of r.verify.reports.filter(x => !x.ok)) {
        const extra = rep.error ? ` [${rep.error}]` : '';
        if (rep.plansTotal === 0) {
          // v1.5 phase shape: phase-level SUMMARY.md is the proof.
          console.error(`  Phase ${rep.phaseNum} ${rep.name || '(unknown)'}: missing phase-level SUMMARY.md${extra}`);
        } else {
          const missing = (rep.summariesMissing || []).join(', ') || '—';
          console.error(`  Phase ${rep.phaseNum} ${rep.name || '(unknown)'}: plans ${rep.plansDone}/${rep.plansTotal} done; missing SUMMARY: ${missing}${extra}`);
        }
      }
      process.exit(1);
    } else if (r.reason === 'audit-failed') {
      const s = r.audit.summary;
      console.error(`\nMilestone "${r.milestone}" blocked by cp audit:`);
      console.error(`  ${s.high} HIGH, ${s.medium} MEDIUM, ${s.low} LOW  (blocking on ${r.blockingSeverity})`);
      const findings = r.audit.findings.filter(f =>
        r.blockingSeverity === 'HIGH' ? f.severity === 'HIGH' : (f.severity === 'HIGH' || f.severity === 'MEDIUM')
      );
      for (const f of findings.slice(0, 10)) {
        console.error(`  [${f.severity}] ${f.id}: ${f.message}`);
        console.error(`    at ${f.location}`);
      }
      if (findings.length > 10) console.error(`  ... and ${findings.length - 10} more (run \`cp audit\` for full list)`);
      console.error('\nFix with \`cp audit\` then iterate, or override with \`cp complete-milestone --no-audit\` (not recommended).');
      console.error('Use \`cp complete-milestone --audit-warn\` to ship despite MEDIUM findings.');
      process.exit(2);
    } else if (r.reason === 'audit-error') {
      console.error(`\nAudit threw: ${r.auditError}`);
      console.error('Refusing to complete milestone. File a bug, or use --no-audit to override.');
      process.exit(2);
    } else if (r.hint) {
      console.error(r.hint);
      process.exit(1);
    } else {
      process.exit(1);
    }
  }

  if (r.alreadyShipped) {
    console.log(r.message || `Milestone "${r.milestone}" already shipped. No-op.`);
    return;
  }

  console.log(`Milestone:   ${r.milestone}`);
  console.log(`Phases:      ${r.phases.join(', ')}`);
  console.log(`Subsystems:  ${r.agg.subsystems.join(', ') || '—'}`);
  console.log(`Files:       ${r.agg.filesCreated.length} created, ${r.agg.filesModified.length} modified`);
  if (r.audit && !r.audit.skipped) {
    const s = r.audit.summary;
    const flag = s.low > 0 ? ` (${s.low} LOW finding(s) — run \`cp audit\` to review)` : '';
    console.log(`Audit:       ${s.high} HIGH, ${s.medium} MEDIUM, ${s.low} LOW${flag}`);
  } else if (r.audit && r.audit.skipped) {
    console.log('Audit:       SKIPPED (--no-audit)');
  }
  console.log(`\nActions${dryRun ? ' (dry-run)' : ''}:`);
  for (const a of r.actions) {
    const rel = path.relative(root, a.path);
    const mark = a.kind === 'write' ? '✓' : a.kind === 'delete' ? '✗' : '·';
    console.log(`  ${mark} ${a.kind.padEnd(6)} ${rel}${a.reason ? '  (' + a.reason + ')' : ''}`);
  }
  if (!dryRun && r.commit) console.log(`\nCommitted:   ${r.commit}`);
}

module.exports = { name: 'complete-milestone', run };
