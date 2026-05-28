'use strict';

/**
 * Dryrun tests for the `cp run` CLI sub-commands.
 *
 * Spawns the cp binary in temp projects and verifies stdout/stderr/exit-code
 * contracts for all `cp run` sub-commands. ~20 assertions.
 *
 * No lib code is modified; all assertions adapt to the actual CLI output.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const cpBin = path.resolve(__dirname, '..', 'bin', 'cp.js');
// Repo root — built-in templates resolve from here.
const repoRoot = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
const failures = [];

function ok(label, cond, detail) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + label);
  } else {
    failed++;
    failures.push(label + (detail ? ': ' + detail : ''));
    console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
  }
}

function section(title) { console.log('\n=== ' + title + ' ==='); }

/**
 * Create a minimal temp project with .planning/ directory and git init.
 * Built-in templates (quick, dev, debug) are always available regardless of
 * cwd because lib/workflow.js resolves them from the package root.
 */
function mkFixture(suffix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-run-cli-' + suffix + '-'));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.planning', 'PROJECT.md'),
    '# Test Project\n\n## Constraints\n\n- Constraint A\n'
  );
  return dir;
}

function cp(args, cwd, opts) {
  return spawnSync(process.execPath, [cpBin].concat(args), Object.assign(
    { cwd: cwd || repoRoot, encoding: 'utf8' },
    opts || {}
  ));
}

// ============================================================
// Section 1: help / no-args
// ============================================================
section('cp run no-args → prints USAGE to stdout, exit 0');
{
  const dir = mkFixture('help');
  const r = cp(['run'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  ok('stdout contains "cp run"', r.stdout.includes('cp run'), 'stdout=' + r.stdout.slice(0, 200));
}

section('cp run --help → USAGE to stdout, exit 0');
{
  const dir = mkFixture('help2');
  const r = cp(['run', '--help'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  ok('stdout contains subcommands', r.stdout.includes('resume'), 'stdout=' + r.stdout.slice(0, 200));
}

// ============================================================
// Section 2: template not found
// ============================================================
section('cp run nonexistent foo → exit 3, template not found in stderr');
{
  const dir = mkFixture('notfound');
  const r = cp(['run', 'nonexistent', 'foo'], dir);
  ok('exit 3', r.status === 3, 'status=' + r.status);
  ok('stderr has template not found', r.stderr.includes('not found'), 'stderr=' + r.stderr);
}

// ============================================================
// Section 3: cp run quick --plan-only (no state mutation)
// ============================================================
section('cp run quick --plan-only → instruction on stdout, no slug on stderr, exit 0');
{
  const dir = mkFixture('planonly');
  const r = cp(['run', 'quick', '--plan-only'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  ok('stdout non-empty', r.stdout.length > 0, 'stdout empty');
  ok('stderr has no slug line', !r.stderr.includes('slug:'), 'stderr=' + r.stderr);
  // --plan-only must not create state files
  const customDir = path.join(dir, '.planning', 'custom');
  ok('no custom dir created', !fs.existsSync(customDir) ||
    fs.readdirSync(customDir).length === 0, 'customDir=' + customDir);
}

// ============================================================
// Section 4: cp run quick → creates run, captures slug
// ============================================================
let liveDir;
let liveSlug;

section('cp run quick → slug on stderr, instruction on stdout, exit 0');
{
  liveDir = mkFixture('live');
  const r = cp(['run', 'quick'], liveDir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  ok('stderr has slug', r.stderr.includes('slug:'), 'stderr=' + r.stderr);
  const m = r.stderr.match(/slug: (\S+)/);
  ok('slug captured', !!m, 'stderr=' + r.stderr);
  liveSlug = m ? m[1] : null;
  ok('stdout has instruction text', r.stdout.length > 0, 'stdout empty');
}

// ============================================================
// Section 5: re-run same workflow → exit 1, already in progress
// ============================================================
section('cp run quick again → exit 1, already in progress');
{
  const r = cp(['run', 'quick'], liveDir);
  ok('exit 1', r.status === 1, 'status=' + r.status);
  ok('stderr has "already in progress"', r.stderr.includes('already in progress'),
    'stderr=' + r.stderr);
}

// ============================================================
// Section 6: cp run status → table listing slug
// ============================================================
section('cp run status → table on stdout listing the slug');
{
  const r = cp(['run', 'status'], liveDir);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  ok('stdout contains slug', r.stdout.includes(liveSlug), 'stdout=' + r.stdout.slice(0, 300));
}

// ============================================================
// Section 7: cp run status --json → valid JSON array
// ============================================================
section('cp run status --json → valid JSON array');
{
  const r = cp(['run', 'status', '--json'], liveDir);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  let arr = null;
  try { arr = JSON.parse(r.stdout); } catch (_) {}
  ok('stdout is valid JSON array', Array.isArray(arr), 'stdout=' + r.stdout.slice(0, 300));
  ok('array has at least 1 entry', arr && arr.length >= 1, 'len=' + (arr ? arr.length : 'null'));
  const entry = arr && arr.find(function(e) { return e.slug === liveSlug; });
  ok('entry for live slug found', !!entry, 'slug=' + liveSlug);
}

// ============================================================
// Section 8: cp run resume <slug> → instruction + wave line
// ============================================================
section('cp run resume <slug> → instruction on stdout, wave on stderr');
{
  const r = cp(['run', 'resume', liveSlug], liveDir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  ok('stdout has instruction', r.stdout.length > 0, 'stdout empty');
  ok('stderr has wave', r.stderr.includes('wave'), 'stderr=' + r.stderr);
}

// ============================================================
// Section 9: cp run resume nonexistent-slug → exit 4
// ============================================================
section('cp run resume nonexistent-slug → exit 4, not found in stderr');
{
  const r = cp(['run', 'resume', 'nonexistent-slug-xyz'], liveDir);
  ok('exit 4', r.status === 4, 'status=' + r.status);
  ok('stderr has not found', r.stderr.includes('not found'), 'stderr=' + r.stderr);
}

// ============================================================
// Section 10: cp run mark-complete <slug> discuss with stdin
// ============================================================
section('cp run mark-complete <slug> setup → exit 0, stderr shows wave advance');
{
  const r = cp(
    ['run', 'mark-complete', liveSlug, 'setup'],
    liveDir,
    { input: '# Summary\n\nSetup phase done.\n' }
  );
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  // Stderr should mention slug and wave/advance (or "Run complete")
  ok('stderr mentions slug or wave', r.stderr.includes(liveSlug) || r.stderr.includes('wave'),
    'stderr=' + r.stderr);
}

// ============================================================
// Section 11: cp run abandon <slug> --yes → exit 0
// ============================================================
section('cp run abandon <slug> --yes → exit 0, Abandoned in stderr');
{
  const r = cp(['run', 'abandon', liveSlug, '--yes'], liveDir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  ok('stderr contains Abandoned', r.stderr.includes('Abandoned'), 'stderr=' + r.stderr);
}

// ============================================================
// Results
// ============================================================
console.log('\n----------------------------------------');
console.log('Passed: ' + passed + '   Failed: ' + failed);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach(function(f) { console.log('  - ' + f); });
  process.exit(1);
}
