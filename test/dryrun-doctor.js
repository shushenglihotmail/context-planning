#!/usr/bin/env node
/**
 * Dry-run tests for `cp doctor` — the v0.5 sectioned output.
 *
 * Spawns `bin/cp.js doctor` against temp fixtures and asserts output
 * sections, --json shape, --quiet shape, and exit codes.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const BIN = path.join(REPO, 'bin', 'cp.js');

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
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(label + ` (=${e})`, a === e, `got ${a}`);
}
function section(name) { console.log(`\n=== ${name} ===`); }
function mktmp(n) { return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-doctor-' + n + '-')); }
function writeFile(p, c) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c || ''); }
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

const created = [];
function track(d) { created.push(d); return d; }

/**
 * Run `cp doctor` with given args in the specified cwd.
 * Returns { stdout, exitCode }.
 */
function runDoctor(cwd, extraArgs = []) {
  const args = ['doctor', ...extraArgs];
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: (err.stdout || '') + (err.stderr || ''), exitCode: err.status || 1 };
  }
}

/**
 * Create a minimal .planning/ fixture with config.json.
 */
function buildFixture(rootDir, configOverrides = {}) {
  // Minimal git-like marker so repoRoot() resolves
  fs.mkdirSync(path.join(rootDir, '.git'), { recursive: true });

  const planDir = path.join(rootDir, '.planning');
  fs.mkdirSync(planDir, { recursive: true });

  // Load defaults from template and merge overrides
  const defaults = JSON.parse(fs.readFileSync(path.join(REPO, 'templates', 'config.json'), 'utf8'));
  const merged = { ...defaults, ...configOverrides };
  if (configOverrides.cp) {
    merged.cp = { ...defaults.cp, ...configOverrides.cp };
  }
  fs.writeFileSync(path.join(planDir, 'config.json'), JSON.stringify(merged, null, 2) + '\n');

  // Minimal required files
  writeFile(path.join(planDir, 'PROJECT.md'), '# Test Project\n');
  writeFile(path.join(planDir, 'ROADMAP.md'), '# Roadmap\n\n## Phases\n');
  writeFile(path.join(planDir, 'STATE.md'), '# State\n');
}

try {

// ============================================================
section('cp doctor: sectioned output has expected sections');
{
  const root = track(mktmp('sections'));
  buildFixture(root);
  const { stdout, exitCode } = runDoctor(root);
  eq('exit code 0', exitCode, 0);
  ok('has version line', stdout.includes('cp v'));
  ok('has Repo root', stdout.includes('Repo root:'));
  ok('has .planning/', stdout.includes('.planning/'));
  ok('has Config:', stdout.includes('Config:'));
  ok('has schema version', stdout.includes('schema v'));
  ok('has Harnesses detected', stdout.includes('Harnesses detected:'));
  ok('has Providers detected', stdout.includes('Providers detected:'));
  ok('has Configured workflow_provider', stdout.includes('Configured workflow_provider:'));
  ok('has Roles section', stdout.includes('Roles'));
  ok('has GSD compatibility', stdout.includes('GSD compatibility:'));
  ok('manual always available', stdout.includes('manual') && stdout.includes('always available'));
}

// ============================================================
section('cp doctor --quiet: minimal output');
{
  const root = track(mktmp('quiet'));
  buildFixture(root);
  const { stdout, exitCode } = runDoctor(root, ['--quiet']);
  eq('exit code 0', exitCode, 0);
  ok('starts with Configured', stdout.trimStart().startsWith('Configured:'));
  ok('has role lines', stdout.includes('brainstorm') && stdout.includes('plan'));
  ok('no Harnesses section', !stdout.includes('Harnesses detected:'));
  ok('no GSD section', !stdout.includes('GSD compatibility:'));
}

// ============================================================
section('cp doctor --json: machine-parsable output');
{
  const root = track(mktmp('json'));
  buildFixture(root);
  const { stdout, exitCode } = runDoctor(root, ['--json']);
  eq('exit code 0', exitCode, 0);

  let json;
  try {
    json = JSON.parse(stdout);
  } catch (e) {
    json = null;
  }
  ok('output is valid JSON', json !== null);
  if (json) {
    ok('has version field', typeof json.version === 'string');
    ok('has root field', typeof json.root === 'string');
    ok('has configured field', typeof json.configured === 'string');
    ok('has harnesses array', Array.isArray(json.harnesses));
    ok('has providers array', Array.isArray(json.providers));
    ok('has roles object', typeof json.roles === 'object' && json.roles !== null);
    ok('roles has brainstorm', 'brainstorm' in json.roles);
    ok('roles.brainstorm has provider', typeof json.roles.brainstorm.provider === 'string');
    ok('roles.brainstorm has skill', typeof json.roles.brainstorm.skill === 'string');
  }
}

// ============================================================
section('cp doctor: exit 0 with fallback enabled (default)');
{
  const root = track(mktmp('fallback'));
  buildFixture(root);
  const { exitCode } = runDoctor(root);
  eq('exit code 0 even without superpowers', exitCode, 0);
}

// ============================================================
section('cp doctor --fix-dual-plan: no dual-plan → no-op');
{
  const root = track(mktmp('fdp-noop'));
  buildFixture(root);
  // Phase with only short-form PLAN.md (no long-form)
  const phaseDir = path.join(root, '.planning', 'phases', '01-only-short');
  fs.mkdirSync(phaseDir, { recursive: true });
  writeFile(path.join(phaseDir, 'PLAN.md'), '# Only short\n');
  const { stdout, exitCode } = runDoctor(root, ['--fix-dual-plan']);
  eq('exit code 0', exitCode, 0);
  ok('output mentions no issues', stdout.includes('No dual-plan issues'));
  ok('short-form still exists', fs.existsSync(path.join(phaseDir, 'PLAN.md')));
  ok('no .archive dir created', !fs.existsSync(path.join(root, '.planning', '.archive')));
}

// ============================================================
section('cp doctor --fix-dual-plan: dual-plan, short-form larger → archives long-form');
{
  const root = track(mktmp('fdp-short-wins'));
  buildFixture(root);
  const phaseDir = path.join(root, '.planning', 'phases', '02-dual');
  fs.mkdirSync(phaseDir, { recursive: true });
  // Short-form is larger
  writeFile(path.join(phaseDir, 'PLAN.md'), '# Short-form plan\nLots of content here.\n'.repeat(5));
  writeFile(path.join(phaseDir, '02-01-foo-PLAN.md'), '# Long-form\nSmall.\n');
  const { stdout, exitCode } = runDoctor(root, ['--fix-dual-plan']);
  eq('exit code 0', exitCode, 0);
  ok('short-form still exists', fs.existsSync(path.join(phaseDir, 'PLAN.md')));
  ok('long-form archived (not on disk)', !fs.existsSync(path.join(phaseDir, '02-01-foo-PLAN.md')));
  ok('output mentions archived or fixed', stdout.includes('Archived') || stdout.includes('Fixed'));
  const archiveDir = path.join(root, '.planning', '.archive', '02-dual');
  ok('.archive dir created', fs.existsSync(archiveDir));
  const archiveContents = fs.readdirSync(archiveDir);
  ok('one file in archive', archiveContents.length === 1);
  ok('archived file is the long-form', archiveContents[0].endsWith('02-01-foo-PLAN.md'));
}

// ============================================================
section('cp doctor --fix-dual-plan: dual-plan, long-form larger → archives short-form');
{
  const root = track(mktmp('fdp-long-wins'));
  buildFixture(root);
  const phaseDir = path.join(root, '.planning', 'phases', '03-dual');
  fs.mkdirSync(phaseDir, { recursive: true });
  // Long-form is larger
  writeFile(path.join(phaseDir, 'PLAN.md'), '# Short\nSmall.\n');
  writeFile(path.join(phaseDir, '03-01-bar-PLAN.md'), '# Long-form plan\nLots of content here.\n'.repeat(5));
  const { stdout, exitCode } = runDoctor(root, ['--fix-dual-plan']);
  eq('exit code 0', exitCode, 0);
  ok('long-form still exists', fs.existsSync(path.join(phaseDir, '03-01-bar-PLAN.md')));
  ok('short-form archived (not on disk)', !fs.existsSync(path.join(phaseDir, 'PLAN.md')));
  ok('output mentions archived or fixed', stdout.includes('Archived') || stdout.includes('Fixed'));
  const archiveDir = path.join(root, '.planning', '.archive', '03-dual');
  const archiveContents = fs.readdirSync(archiveDir);
  ok('archived file is the short-form', archiveContents[0].endsWith('PLAN.md'));
}

// ============================================================
section('cp doctor (no flag): dual-plan present → warns, does NOT archive');
{
  const root = track(mktmp('fdp-no-flag'));
  buildFixture(root);
  const phaseDir = path.join(root, '.planning', 'phases', '04-dual');
  fs.mkdirSync(phaseDir, { recursive: true });
  writeFile(path.join(phaseDir, 'PLAN.md'), '# Short\n');
  writeFile(path.join(phaseDir, '04-01-baz-PLAN.md'), '# Long\n');
  const { stdout, exitCode } = runDoctor(root);
  eq('exit code 0', exitCode, 0);
  ok('warns about dual-plan', stdout.includes('BOTH short-form PLAN.md') || stdout.includes('Pick one'));
  ok('short-form still exists', fs.existsSync(path.join(phaseDir, 'PLAN.md')));
  ok('long-form still exists', fs.existsSync(path.join(phaseDir, '04-01-baz-PLAN.md')));
  ok('no .archive created', !fs.existsSync(path.join(root, '.planning', '.archive')));
}

// ============================================================
section('cp doctor --fix-dual-plan: idempotent (second run is no-op)');
{
  const root = track(mktmp('fdp-idempotent'));
  buildFixture(root);
  const phaseDir = path.join(root, '.planning', 'phases', '05-dual');
  fs.mkdirSync(phaseDir, { recursive: true });
  writeFile(path.join(phaseDir, 'PLAN.md'), '# Short-form plan\nContent.\n'.repeat(3));
  writeFile(path.join(phaseDir, '05-01-foo-PLAN.md'), '# Long\nSmall.\n');
  // First run
  const r1 = runDoctor(root, ['--fix-dual-plan']);
  eq('first run exit 0', r1.exitCode, 0);
  ok('first run archives long-form', !fs.existsSync(path.join(phaseDir, '05-01-foo-PLAN.md')));
  // Second run
  const r2 = runDoctor(root, ['--fix-dual-plan']);
  eq('second run exit 0', r2.exitCode, 0);
  ok('second run reports no issues', r2.stdout.includes('No dual-plan issues'));
  ok('short-form still intact after second run', fs.existsSync(path.join(phaseDir, 'PLAN.md')));
}

} finally {
  for (const d of created) rmrf(d);
}
console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exitCode = 1;
} else {
  console.log('All doctor dry-run checks passed.');
}
