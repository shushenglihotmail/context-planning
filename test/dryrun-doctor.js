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

} finally {
  for (const d of created) rmrf(d);
}

// ---------- summary ----------
console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exitCode = 1;
} else {
  console.log('All doctor dry-run checks passed.');
}
