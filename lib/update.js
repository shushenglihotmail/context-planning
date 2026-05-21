'use strict';

/**
 * cp update — v0.9 P33 case-4 onboarding helper.
 *
 * Refreshes per-repo cp state without touching the npm package itself.
 * The documented user-facing invocation is the npx-fronted one-liner:
 *
 *     npx -y --package=context-planning@latest -- cp update
 *
 * That single command fetches the latest cp via npx (per-user cache, no
 * sudo) and runs `cp update` against the cwd. When already-installed
 * users prefer global install, plain `cp update` works the same way
 * but skips the binary refresh.
 *
 * Steps performed against the current repo:
 *   1. Verify `.planning/` exists (else exit 2 — never auto-init for update).
 *   2. Detect which harness(es) are installed.
 *   3. Re-run `cp install <harness> --force` for each detected harness.
 *   4. Re-run `cp config refresh` to merge any new upstream defaults.
 *   5. Run `cp audit --fix` (safe-severity only) to clean up drift.
 *   6. Print a structured summary.
 *
 * Cross-version migration hooks (e.g. SHA backfill) are intentionally
 * out of v0.9 scope; audit will flag missing SHAs and the user can run
 * `cp reconcile --all --infer-shas` deliberately.
 */

const fs = require('fs');
const path = require('path');
const { repoRoot, pluginRoot, planningDir } = require('./paths');
const provider = require('./provider');

/** Markers (file / directory) we use to detect each harness install. */
const HARNESS_MARKERS = {
  copilot: ['.github/skills/cp-status', '.github/skills/cp-new-project'],
  claude: ['.claude/commands/cp/status.md', '.claude/commands/cp/new-project.md'],
  cursor: ['.cursor/rules/cp-status.mdc', '.cursor/rules/cp-new-project.mdc'],
  aider: ['.aider.conf.yml'],
};

/**
 * Detect harness installs.
 *
 * Order of preference:
 *   1. Explicit `cp.harness` in config (single value).
 *   2. Filesystem markers (multi — a repo CAN have several installed).
 *
 * Returns an array (possibly empty). Tests rely on stable ordering matching
 * HARNESS_MARKERS key order.
 */
function detectHarnesses(root) {
  const found = new Set();

  // 1. Config-declared harness wins as a seed.
  try {
    const cfg = provider.loadConfig(root);
    const declared = cfg && cfg.cp && cfg.cp.harness;
    if (declared && HARNESS_MARKERS[declared]) found.add(declared);
  } catch (_) {
    /* missing or malformed config — fall through to filesystem detection */
  }

  // 2. Filesystem markers — anything found is added.
  for (const [harness, markers] of Object.entries(HARNESS_MARKERS)) {
    for (const m of markers) {
      if (fs.existsSync(path.join(root, m))) {
        found.add(harness);
        break;
      }
    }
  }

  // Preserve canonical order.
  return Object.keys(HARNESS_MARKERS).filter((h) => found.has(h));
}

/**
 * Run the update orchestration.
 *
 * @param {string} root  Repo root.
 * @param {object} opts
 * @param {boolean} opts.dryRun   Preview only — never write.
 * @param {boolean} opts.check    Exit non-zero if anything would change.
 * @param {boolean} opts.quiet    Suppress non-essential output (CI mode).
 * @param {Function} opts.log     Optional log sink (defaults to console.log).
 * @returns {{ ok: boolean, changed: boolean, steps: object[] }}
 */
function runUpdate(root, opts = {}) {
  const { dryRun = false, check = false, quiet = false } = opts;
  const log = opts.log || ((msg) => process.stdout.write(msg + '\n'));
  const steps = [];

  // ----- Step 1: verify .planning/ -----
  const pdir = planningDir(root);
  if (!fs.existsSync(path.join(pdir, 'PROJECT.md'))) {
    return {
      ok: false,
      changed: false,
      reason: 'no-planning-dir',
      message:
        'cp update: .planning/PROJECT.md not found. Run `cp init` first ' +
        '(or `/cp-map-codebase` for an existing-code repo).',
      steps,
    };
  }

  // ----- Step 2: detect harnesses -----
  const harnesses = detectHarnesses(root);
  if (!quiet) log(`cp update: detected harness(es): ${harnesses.length ? harnesses.join(', ') : '(none)'}`);
  steps.push({ step: 'detect', harnesses });

  if (harnesses.length === 0) {
    return {
      ok: false,
      changed: false,
      reason: 'no-harness-detected',
      message:
        'cp update: no harness installation detected in this repo. Run ' +
        '`cp install <copilot|claude|cursor|aider>` first.',
      steps,
    };
  }

  // ----- Step 3: refresh harness skill files -----
  let anyChanged = false;
  for (const harness of harnesses) {
    const result = _refreshHarness(root, harness, { dryRun });
    steps.push({ step: 'install', harness, ...result });
    if (result.changed) anyChanged = true;
    if (!quiet) {
      const mark = dryRun ? '·' : (result.changed ? '✓' : '–');
      log(`  ${mark} cp install ${harness} --force  (${result.written} written, ${result.identical} identical, ${result.userModified} user-modified)`);
    }
  }

  // ----- Step 4: refresh config defaults -----
  const cfgRes = _refreshConfig(root, { dryRun });
  steps.push({ step: 'config-refresh', ...cfgRes });
  if (cfgRes.changed) anyChanged = true;
  if (!quiet) {
    const mark = dryRun ? '·' : (cfgRes.changed ? '✓' : '–');
    log(`  ${mark} cp config refresh           (${cfgRes.changed ? cfgRes.summary : 'already up to date'})`);
  }

  // ----- Step 5: audit --fix (safe severity only) -----
  const auditRes = _runAuditFix(root, { dryRun });
  steps.push({ step: 'audit-fix', ...auditRes });
  if (auditRes.applied > 0) anyChanged = true;
  if (!quiet) {
    const mark = dryRun ? '·' : (auditRes.applied > 0 ? '✓' : '–');
    log(`  ${mark} cp audit --fix              (${auditRes.applied} fixed, ${auditRes.remaining} remaining, ${auditRes.manual} manual)`);
  }

  // ----- Summary -----
  if (!quiet) {
    if (dryRun) log('\n(dry-run) cp update: no files written. Re-run without --dry-run to apply.');
    else if (anyChanged) log('\ncp update: complete. Review changes with `git log` and `cp status`.');
    else log('\ncp update: everything already up to date.');
  }

  return {
    ok: true,
    changed: anyChanged,
    dryRun,
    check,
    steps,
  };
}

function _refreshHarness(root, harness, { dryRun }) {
  const plug = pluginRoot();
  let installer;
  try {
    installer = require(path.join(plug, 'install', `${harness}.js`));
  } catch (e) {
    return { changed: false, written: 0, identical: 0, userModified: 0, error: e.message };
  }
  if (dryRun) {
    // Dry-run: do not actually call installer; report unknown as a non-zero
    // "would attempt" so summary signals user intent.
    return { changed: false, written: 0, identical: 0, userModified: 0, dryRun: true };
  }
  const result = installer.install({ pluginRoot: plug, repoRoot: root, force: true });
  const written = result.written || 0;
  const identical = result.identical || 0;
  const userModified = Array.isArray(result.userModified) ? result.userModified.length : 0;
  return {
    changed: written > 0,
    written,
    identical,
    userModified,
  };
}

function _refreshConfig(root, { dryRun }) {
  const p = provider.configPath(root);
  if (!fs.existsSync(p)) {
    return { changed: false, summary: 'no config' };
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const defaults = provider.loadDefaults();
  const { mergeCpDefaults } = require('./merge');
  const merged = mergeCpDefaults(raw, defaults);
  if (!merged.changed) return { changed: false, summary: 'already up to date' };
  if (dryRun) return { changed: true, summary: merged.summary, dryRun: true };
  fs.writeFileSync(p, JSON.stringify(merged.cfg, null, 2) + '\n');
  return { changed: true, summary: merged.summary };
}

function _runAuditFix(root, { dryRun }) {
  const audit = require('./audit');
  const auditFix = require('./audit-fix');
  const findings = audit.runAudit(root).findings;
  if (findings.length === 0) return { applied: 0, remaining: 0, manual: 0 };
  // Only auto-fix LOW + MEDIUM during update — never auto-touch HIGH (those
  // represent decisions the user must make).
  const classified = auditFix.classify(findings, { severity: 'low,medium' });
  const fixResult = auditFix.applyFixes(root, classified.auto, { max: 10, dryRun });
  return {
    applied: fixResult.applied.length,
    remaining: classified.auto.length - fixResult.applied.length,
    manual: classified.manual.length,
    failed: fixResult.failed.length,
  };
}

module.exports = {
  runUpdate,
  detectHarnesses,
  HARNESS_MARKERS,
};
