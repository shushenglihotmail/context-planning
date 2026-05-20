#!/usr/bin/env node
/**
 * Dry-run test for `cp gsd-import`. Exercises the auditor against five
 * fixture projects covering the classification matrix:
 *
 *   1. no-planning           — empty directory
 *   2. pure-gsd              — has all GSD sentinels, no `cp` block
 *   3. cp-aware-gsd-superset — pure-gsd + `cp` block merged
 *   4. corrupt               — config.json is malformed
 *   5. integrity-issues      — pure-gsd with a missing PLAN.md, missing
 *                              SUMMARY for a done plan, an orphan dir,
 *                              and a frontmatter parse error
 *
 * Also runs the CLI binary end-to-end via execFileSync to prove the
 * subcommand wiring.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const CP = path.join(REPO, 'bin', 'cp.js');
const importer = require(path.join(REPO, 'lib', 'import'));

// ---------- tiny test runner ----------
let passed = 0;
let failed = 0;
const failures = [];
function ok(label, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ' :: ' + detail : ''}`);
    console.log(`  \u2717 ${label}${detail ? ' :: ' + detail : ''}`);
  }
}
function section(name) {
  console.log(`\n=== ${name} ===`);
}
function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
function mktmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-gsdimport-' + prefix + '-'));
}

// ---------- fixture builders ----------

function buildNoPlanning() {
  const root = mktmp('nop');
  writeFile(path.join(root, 'README.md'), '# Just a repo, no planning.\n');
  return root;
}

function buildPureGsd() {
  const root = mktmp('puregsd');
  const dot = path.join(root, '.planning');
  for (const d of ['research', 'todos/pending', 'seeds', 'phases']) {
    fs.mkdirSync(path.join(dot, d), { recursive: true });
  }
  writeFile(path.join(dot, 'REQUIREMENTS.md'), '# Requirements\n- REQ-01\n- REQ-02\n');
  writeFile(path.join(dot, 'PROJECT.md'), '# Project: PureGSD\n');
  writeFile(path.join(dot, 'ROADMAP.md'), `# Roadmap

## Phases

### \u2705 v1.0 (Shipped 2026-01-01)

### Phase 1: Foundation
Plans:
- [x] 01-01: scaffold
- [x] 01-02: auth

### \uD83D\uDEA7 v1.1 (In Progress)

### Phase 2: Sharing
Plans:
- [ ] 02-01: share token
`);
  writeFile(path.join(dot, 'STATE.md'), '# State\n');
  writeFile(path.join(dot, 'MILESTONES.md'), '# Milestones\n');
  // pure-GSD config — no cp block
  writeFile(path.join(dot, 'config.json'), JSON.stringify({
    mode: 'interactive',
    granularity: 'standard',
    project_code: 'puregsd',
    workflow: { research: true },
    paths: { planning_dir: '.planning' },
  }, null, 2));

  writeFile(path.join(dot, 'phases', '01-foundation', '01-01-PLAN.md'),
`---
phase: 01-foundation
plan: 01
type: execute
---

# Plan 01-01
`);
  writeFile(path.join(dot, 'phases', '01-foundation', '01-01-SUMMARY.md'),
`---
phase: 01-foundation
plan: 01
subsystem: core
---

# Summary 01-01
`);
  writeFile(path.join(dot, 'phases', '01-foundation', '01-02-PLAN.md'),
`---
phase: 01-foundation
plan: 02
type: execute
---

# Plan 01-02
`);
  writeFile(path.join(dot, 'phases', '01-foundation', '01-02-SUMMARY.md'),
`---
phase: 01-foundation
plan: 02
subsystem: auth
---

# Summary 01-02
`);
  writeFile(path.join(dot, 'phases', '02-sharing', '02-01-PLAN.md'),
`---
phase: 02-sharing
plan: 01
type: execute
---

# Plan 02-01
`);
  return root;
}

function buildCpAware() {
  const root = buildPureGsd();
  // Pre-create quick/ so this fixture is truly "nothing to do" for audit.
  fs.mkdirSync(path.join(root, '.planning', 'quick'), { recursive: true });
  const cfgPath = path.join(root, '.planning', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.cp = {
    workflow_provider: 'superpowers',
    gsd_compat_mode: true,
    providers: {
      superpowers: { detect: { any_of: [] }, skills: { plan: 'writing-plans' } },
      manual: { detect: { always: true }, skills: {} },
    },
  };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  // also drop an active milestone marker
  writeFile(path.join(root, '.planning', 'MILESTONE-CONTEXT.md'),
`# Milestone Context: v1.1 Sharing

**Status**: in progress
**Started**: 2026-05-01
`);
  return root;
}

function buildCorruptConfig() {
  const root = buildPureGsd();
  fs.writeFileSync(path.join(root, '.planning', 'config.json'), '{not valid json,');
  return root;
}

function buildIntegrityIssues() {
  const root = buildPureGsd();
  const dot = path.join(root, '.planning');

  // 1) Delete the PLAN.md for 02-01 (ROADMAP still references it).
  fs.unlinkSync(path.join(dot, 'phases', '02-sharing', '02-01-PLAN.md'));

  // 2) Mark 02-01 done in ROADMAP without writing a SUMMARY.
  let rm = fs.readFileSync(path.join(dot, 'ROADMAP.md'), 'utf8');
  rm = rm.replace('- [ ] 02-01: share token', '- [x] 02-01: share token');
  fs.writeFileSync(path.join(dot, 'ROADMAP.md'), rm);

  // 3) Create an orphan phase dir (not referenced in ROADMAP).
  fs.mkdirSync(path.join(dot, 'phases', '09-orphan'), { recursive: true });
  writeFile(path.join(dot, 'phases', '09-orphan', '09-01-PLAN.md'),
`---
phase: 09-orphan
plan: 01
---

# Orphan plan
`);

  // 4) Corrupt a PLAN.md's frontmatter.
  writeFile(path.join(dot, 'phases', '01-foundation', '01-01-PLAN.md'),
`---
phase: 01-foundation
plan: 01
must_haves:
  truths:
    - "unterminated string
---

# bad frontmatter
`);

  return root;
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

// ---------- tests ----------

const created = [];
function track(root) { created.push(root); return root; }

try {
  section('Classification: no .planning/');
  {
    const root = track(buildNoPlanning());
    const r = importer.audit(root);
    ok('classification is no-planning', r.classification === 'no-planning', r.classification);
    ok('planning.present is false', r.planning.present === false);
    ok('cpAware is false', r.cpAware === false);
    ok('wouldCreate lists .planning/', r.plan.wouldCreate.includes('.planning/'));
    ok('wouldCreate lists ROADMAP.md', r.plan.wouldCreate.includes('.planning/ROADMAP.md'));
    ok('exit code is 2 (changes pending)', importer.exitCode(r) === 2);
    ok('recommendation mentions cp init',
      /cp init/i.test(r.recommendation), r.recommendation);
    const out = importer.render(r);
    ok('render includes the classification line', out.includes('no .planning/ directory'));
    ok('render includes the plan section', /Plan if you run/.test(out));
  }

  section('Classification: pure-GSD');
  {
    const root = track(buildPureGsd());
    const r = importer.audit(root);
    ok('classification is pure-gsd', r.classification === 'pure-gsd', r.classification);
    ok('gsdProject true', r.gsdProject === true);
    ok('cpAware false', r.cpAware === false);
    ok('config parseable', r.config.parseable === true);
    ok('no cp block detected', r.config.hasCpBlock === false);
    ok('GSD config keys preserved in report',
      r.config.gsdKeys.includes('mode') && r.config.gsdKeys.includes('project_code'));
    ok('research/ sentinel detected', r.sentinels.gsd['.planning/research'] === true);
    ok('seeds/ sentinel detected', r.sentinels.gsd['.planning/seeds'] === true);
    ok('codebase/ not a GSD sentinel (cp also writes it)',
      r.sentinels.gsd['.planning/codebase'] === undefined);
    ok('phases scanned: 2', r.phases.length === 2);
    const p1 = r.phases.find((p) => p.dir === '01-foundation');
    const p2 = r.phases.find((p) => p.dir === '02-sharing');
    ok('phase 01-foundation has 2 plans', p1 && p1.planCount === 2);
    ok('phase 01-foundation has 2 summaries', p1 && p1.summaryCount === 2);
    ok('phase 02-sharing has 1 plan', p2 && p2.planCount === 1);
    ok('phase 02-sharing has 0 summaries', p2 && p2.summaryCount === 0);
    ok('would modify config.json (add cp block)',
      r.plan.wouldModify.some((s) => s.startsWith('.planning/config.json')));
    ok('would NOT recreate PROJECT.md (already exists)',
      !r.plan.wouldCreate.includes('.planning/PROJECT.md'));
    ok('exit code is 2 (changes pending)', importer.exitCode(r) === 2);
    ok('recommendation mentions --apply', /--apply/.test(r.recommendation), r.recommendation);
    const out = importer.render(r);
    ok('render shows "modify config.json"', /modify\s+\.planning\/config\.json/.test(out));
    ok('render shows phase inventory', /01-foundation/.test(out) && /2 plan/.test(out));
  }

  section('Classification: cp-aware GSD superset');
  {
    const root = track(buildCpAware());
    const r = importer.audit(root);
    ok('classification is cp-aware-gsd-superset',
      r.classification === 'cp-aware-gsd-superset', r.classification);
    ok('cpAware true', r.cpAware === true);
    ok('gsdProject true', r.gsdProject === true);
    ok('hasCpBlock true', r.config.hasCpBlock === true);
    ok('GSD keys still preserved alongside cp',
      r.config.gsdKeys.includes('mode') && !r.config.gsdKeys.includes('cp'));
    ok('active milestone detected', r.activeMilestone !== null);
    ok('active milestone name found',
      r.activeMilestone && /v1\.1/.test(r.activeMilestone.name),
      r.activeMilestone && r.activeMilestone.name);
    ok('would NOT modify config.json', r.plan.wouldModify.length === 0);
    ok('would NOT create extra files', r.plan.wouldCreate.length === 0);
    ok('exit code is 0 (nothing to do)', importer.exitCode(r) === 0);
    ok('recommendation says nothing to import',
      /Nothing to import/i.test(r.recommendation), r.recommendation);
    const out = importer.render(r);
    ok('render shows active milestone block', /Active milestone/.test(out));
    ok('render shows provider line', /Workflow provider/.test(out));
  }

  section('Classification: corrupt config');
  {
    const root = track(buildCorruptConfig());
    const r = importer.audit(root);
    ok('config.present true', r.config.present === true);
    ok('config.parseable false', r.config.parseable === false);
    const parseErr = r.issues.find((i) => i.kind === 'config-parse');
    ok('records config-parse error', !!parseErr);
    ok('parse error is severity=error', parseErr && parseErr.severity === 'error');
    ok('exit code is 1 (errors)', importer.exitCode(r) === 1);
    // Classification: hasCpBlock=false, gsdProject=true => pure-gsd
    ok('still classified pure-gsd despite corrupt config',
      r.classification === 'pure-gsd', r.classification);
  }

  section('Classification: integrity issues across the project');
  {
    const root = track(buildIntegrityIssues());
    const r = importer.audit(root);

    // 1) frontmatter parse error on 01-01-PLAN.md
    const fmErr = r.issues.find((i) => i.kind === 'frontmatter-parse');
    ok('records frontmatter-parse error', !!fmErr);
    ok('frontmatter error names the bad file',
      fmErr && /01-01-PLAN/.test(fmErr.file));

    // 2) ROADMAP plan 02-01 has no PLAN.md
    const missingPlan = r.issues.find((i) => i.kind === 'roadmap-plan-no-file' && i.plan === '02-01');
    ok('records roadmap-plan-no-file for 02-01', !!missingPlan);

    // 3) ROADMAP plan 02-01 is done but has no SUMMARY
    const missingSummary = r.issues.find((i) => i.kind === 'done-plan-no-summary' && i.plan === '02-01');
    ok('records done-plan-no-summary for 02-01', !!missingSummary);

    // 4) orphan phase dir 09-orphan
    const orphan = r.issues.find((i) => i.kind === 'orphan-phase-dir');
    ok('records orphan-phase-dir', !!orphan);
    ok('orphan info names phase 9 dir', orphan && /09/.test(orphan.message));

    ok('orphan severity is info', orphan && orphan.severity === 'info');
    ok('exit code is 1 (errors present)', importer.exitCode(r) === 1);

    const out = importer.render(r);
    ok('render lists the frontmatter error', /frontmatter-parse/.test(out));
    ok('render lists roadmap-plan-no-file', /roadmap-plan-no-file/.test(out));
    ok('render lists done-plan-no-summary', /done-plan-no-summary/.test(out));
    ok('render counts issues correctly',
      /Issues: \d+ \(errors: \d+, warnings: \d+, info: \d+\)/.test(out));
  }

  section('JSON output mode (CLI)');
  {
    const root = track(buildPureGsd());
    // Pure-GSD root has pending changes -> exits with code 2. execFileSync
    // throws on non-zero exit, but stdout is preserved on the error object.
    let out = '';
    let exitCode = 0;
    try {
      out = execFileSync(process.execPath, [CP, 'gsd-import', '--root', root, '--json'], {
        encoding: 'utf8',
      });
    } catch (e) {
      out = e.stdout || '';
      exitCode = e.status;
    }
    let parsed;
    try {
      parsed = JSON.parse(out);
    } catch (e) {
      parsed = null;
    }
    ok('--json output is valid JSON', !!parsed);
    ok('JSON report has classification', parsed && parsed.classification === 'pure-gsd');
    ok('JSON report has phases array', parsed && Array.isArray(parsed.phases));
    ok('--json mode still honours exit code', exitCode === 2, `got ${exitCode}`);
  }

  section('CLI exit codes');
  {
    const root = track(buildPureGsd());
    let exitCode = 0;
    try {
      execFileSync(process.execPath, [CP, 'gsd-import', '--root', root], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (e) {
      exitCode = e.status;
    }
    ok('pure-GSD CLI exits with code 2', exitCode === 2, `got ${exitCode}`);

    const cleanRoot = track(buildCpAware());
    let cleanCode = -1;
    try {
      execFileSync(process.execPath, [CP, 'gsd-import', '--root', cleanRoot], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      cleanCode = 0;
    } catch (e) {
      cleanCode = e.status;
    }
    ok('cp-aware CLI exits with code 0', cleanCode === 0, `got ${cleanCode}`);
  }

  section('--apply runs cp init additively');
  {
    const root = track(buildPureGsd());
    const cfgBefore = fs.readFileSync(path.join(root, '.planning', 'config.json'), 'utf8');
    ok('before --apply: no cp block in config', !/"cp"/.test(cfgBefore));

    execFileSync(process.execPath, [CP, 'gsd-import', '--root', root, '--apply'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const cfgAfter = fs.readFileSync(path.join(root, '.planning', 'config.json'), 'utf8');
    ok('after --apply: cp block present in config', /"cp"/.test(cfgAfter));
    const cfgObj = JSON.parse(cfgAfter);
    ok('after --apply: GSD keys preserved (mode)', cfgObj.mode === 'interactive');
    ok('after --apply: GSD keys preserved (project_code)', cfgObj.project_code === 'puregsd');
    ok('after --apply: cp.workflow_provider exists',
      cfgObj.cp && typeof cfgObj.cp.workflow_provider === 'string');

    // re-audit should now be clean
    const r2 = importer.audit(root);
    ok('after --apply: re-audit classification is cp-aware-gsd-superset',
      r2.classification === 'cp-aware-gsd-superset', r2.classification);
    ok('after --apply: re-audit has no pending changes',
      r2.plan.wouldCreate.length === 0 && r2.plan.wouldModify.length === 0);
    ok('after --apply: re-audit exit code is 0', importer.exitCode(r2) === 0);
  }

  console.log(`\nPassed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log('  - ' + f);
    process.exitCode = 1;
  } else {
    console.log('All gsd-import dry-run checks passed.');
  }
} finally {
  for (const d of created) {
    try { rmrf(d); } catch { /* best effort */ }
  }
}
