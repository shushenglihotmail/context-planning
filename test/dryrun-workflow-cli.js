'use strict';

/**
 * Dryrun tests for the `cp workflow` CLI sub-commands.
 *
 * Spawns the cp binary in temp projects and verifies stdout/stderr/exit-code
 * contracts for all `cp workflow` sub-commands, including the new `brainstorm`
 * command added in plan 41-03. ~25 assertions.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const cpBin = path.resolve(__dirname, '..', 'bin', 'cp.js');
const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(__dirname, 'fixtures', 'workflows');

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
 * Create a minimal temp project with .planning/ and git init.
 * No superpowers markers — resolveSkill('brainstorm') falls back to manual.
 */
function mkFixture(suffix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-wf-cli-' + suffix + '-'));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
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
section('cp workflow no-args → USAGE to stdout, exit 0');
{
  const dir = mkFixture('help');
  const r = cp(['workflow'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  ok('stdout contains "cp workflow"', r.stdout.includes('cp workflow'),
    'stdout=' + r.stdout.slice(0, 200));
}

// ============================================================
// Section 2: ls
// ============================================================
section('cp workflow ls in repo root → 3 built-ins listed');
{
  const r = cp(['workflow', 'ls'], repoRoot);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  // Check all 3 built-in names appear in stdout
  ok('stdout contains debug', r.stdout.includes('debug'), 'stdout=' + r.stdout);
  ok('stdout contains dev', r.stdout.includes('dev'), 'stdout=' + r.stdout);
  ok('stdout contains quick', r.stdout.includes('quick'), 'stdout=' + r.stdout);
  ok('stdout contains built-in', r.stdout.includes('built-in'), 'stdout=' + r.stdout);
}

section('cp workflow ls --json → valid JSON, 3+ entries with required fields');
{
  const r = cp(['workflow', 'ls', '--json'], repoRoot);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  let arr = null;
  try { arr = JSON.parse(r.stdout); } catch (_) {}
  ok('stdout is valid JSON array', Array.isArray(arr), 'stdout=' + r.stdout.slice(0, 300));
  ok('at least 3 entries', arr && arr.length >= 3, 'len=' + (arr ? arr.length : 'null'));
  // Verify first entry has expected fields
  const entry = arr && arr[0];
  ok('entry has name field', !!(entry && entry.name), 'entry=' + JSON.stringify(entry));
  ok('entry has source field', !!(entry && entry.source), 'entry=' + JSON.stringify(entry));
  ok('entry has binds_to field', !!(entry && entry.binds_to), 'entry=' + JSON.stringify(entry));
  ok('entry has phaseCount field', entry && typeof entry.phaseCount === 'number',
    'entry=' + JSON.stringify(entry));
}

// ============================================================
// Section 3: show
// ============================================================
section('cp workflow show dev → stdout starts with "# template: dev", contains phases:');
{
  const r = cp(['workflow', 'show', 'dev'], repoRoot);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  ok('stdout starts with # template: dev', r.stdout.startsWith('# template: dev'),
    'stdout=' + r.stdout.slice(0, 100));
  ok('stdout contains phases:', r.stdout.includes('phases:'), 'stdout=' + r.stdout.slice(0, 200));
}

section('cp workflow show nonexistent → exit 3, not found in stderr');
{
  const r = cp(['workflow', 'show', 'nonexistent-template-xyz'], repoRoot);
  ok('exit 3', r.status === 3, 'status=' + r.status);
  ok('stderr has not found', r.stderr.includes('not found'), 'stderr=' + r.stderr);
}

// ============================================================
// Section 4: validate
// ============================================================
section('cp workflow validate dev → stdout "OK: dev", exit 0');
{
  const r = cp(['workflow', 'validate', 'dev'], repoRoot);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  ok('stdout has OK: dev', r.stdout.includes('OK: dev'), 'stdout=' + r.stdout);
}

section('cp workflow validate cycle.yaml (absolute path) → exit 2, Cycle in stderr');
{
  const cyclePath = path.join(fixturesDir, 'cycle.yaml');
  const r = cp(['workflow', 'validate', cyclePath], repoRoot);
  ok('exit 2', r.status === 2, 'status=' + r.status);
  ok('stderr contains Cycle', /cycle/i.test(r.stderr), 'stderr=' + r.stderr);
}

section('cp workflow validate dangling-dep.yaml → exit 2');
{
  const danglingPath = path.join(fixturesDir, 'dangling-dep.yaml');
  const r = cp(['workflow', 'validate', danglingPath], repoRoot);
  ok('exit 2', r.status === 2, 'status=' + r.status + ' stderr=' + r.stderr);
}

// ============================================================
// Section 5: diagram
// ============================================================
section('cp workflow diagram quick → stdout begins with "flowchart TD", exit 0');
{
  const r = cp(['workflow', 'diagram', 'quick'], repoRoot);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  ok('stdout begins with flowchart TD', r.stdout.startsWith('flowchart TD'),
    'stdout=' + r.stdout.slice(0, 100));
  ok('stdout contains discuss', r.stdout.includes('discuss'), 'stdout=' + r.stdout.slice(0, 300));
  ok('stdout contains execute', r.stdout.includes('execute'), 'stdout=' + r.stdout.slice(0, 300));
  ok('stdout contains verify', r.stdout.includes('verify'), 'stdout=' + r.stdout.slice(0, 300));
  ok('stdout contains arrow -->', r.stdout.includes('-->'), 'stdout=' + r.stdout.slice(0, 300));
}

section('cp workflow diagram dev → stdout contains parallel research phases');
{
  const r = cp(['workflow', 'diagram', 'dev'], repoRoot);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  ok('stdout contains research-prior-art', r.stdout.includes('research-prior-art'),
    'stdout=' + r.stdout.slice(0, 400));
  ok('stdout contains research-constraints', r.stdout.includes('research-constraints'),
    'stdout=' + r.stdout.slice(0, 400));
}

// ============================================================
// Section 6: init
// ============================================================
section('cp workflow init in fresh temp → creates .planning/workflows/, exit 0');
{
  const dir = mkFixture('init');
  const r = cp(['workflow', 'init'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  const wfDir = path.join(dir, '.planning', 'workflows');
  ok('.planning/workflows/ created', fs.existsSync(wfDir), 'dir=' + wfDir);
}

section('cp workflow init again → idempotent, exit 0');
{
  const dir = mkFixture('init2');
  cp(['workflow', 'init'], dir); // first call
  const r = cp(['workflow', 'init'], dir); // second call
  ok('exit 0 on re-init', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
}

// ============================================================
// Section 7: new
// ============================================================
section('cp workflow new my-flow --from quick → creates my-flow.yaml, exit 0');
{
  const dir = mkFixture('new');
  const r = cp(['workflow', 'new', 'my-flow', '--from', 'quick'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  const dest = path.join(dir, '.planning', 'workflows', 'my-flow.yaml');
  ok('file created', fs.existsSync(dest), 'dest=' + dest);
  const content = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  ok('content has workflow: my-flow', content.includes('workflow: my-flow'),
    'content=' + content.slice(0, 200));
}

section('cp workflow new my-flow --from quick repeat → exit 6 (already exists)');
{
  const dir = mkFixture('new2');
  cp(['workflow', 'new', 'my-flow', '--from', 'quick'], dir);
  const r = cp(['workflow', 'new', 'my-flow', '--from', 'quick'], dir);
  ok('exit 6', r.status === 6, 'status=' + r.status);
  ok('stderr has "already exists"', r.stderr.includes('already exists'), 'stderr=' + r.stderr);
}

section('cp workflow new my-flow --from quick --force → exit 0');
{
  const dir = mkFixture('force');
  cp(['workflow', 'new', 'my-flow', '--from', 'quick'], dir);
  const r = cp(['workflow', 'new', 'my-flow', '--from', 'quick', '--force'], dir);
  ok('exit 0 with --force', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
}

section('cp workflow new bare-flow (no --from) → creates stub, exit 0');
{
  const dir = mkFixture('bare');
  const r = cp(['workflow', 'new', 'bare-flow'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  const dest = path.join(dir, '.planning', 'workflows', 'bare-flow.yaml');
  ok('stub file created', fs.existsSync(dest), 'dest=' + dest);
}

// ============================================================
// Section 8: import
// ============================================================
section('cp workflow import linear.yaml → copies in, exit 0');
{
  const dir = mkFixture('import');
  const linearPath = path.join(fixturesDir, 'linear.yaml');
  const r = cp(['workflow', 'import', linearPath], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  // linear.yaml has workflow: linear, so dest name is linear
  const dest = path.join(dir, '.planning', 'workflows', 'linear.yaml');
  ok('linear.yaml imported', fs.existsSync(dest), 'dest=' + dest);
}

section('cp workflow import cycle.yaml → refuses (invalid), exit 2');
{
  const dir = mkFixture('import2');
  const cyclePath = path.join(fixturesDir, 'cycle.yaml');
  const r = cp(['workflow', 'import', cyclePath], dir);
  ok('exit 2', r.status === 2, 'status=' + r.status + ' stderr=' + r.stderr);
}

// ============================================================
// Section 9: brainstorm (NEW — plan 41-03)
// ============================================================
section('cp workflow brainstorm --workflow demo → exit 0, manual fallback (no superpowers)');
{
  // Use a fresh fixture with no .claude/ or superpowers markers → manual fallback
  const dir = mkFixture('brainstorm');
  const r = cp(['workflow', 'brainstorm', '--workflow', 'demo'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  // In manual mode: stdout has either the manual prompt text or the context block
  ok('stdout non-empty', r.stdout.length > 0, 'stdout empty');
  // Context block always present in stdout
  ok('stdout contains context (workflow name)', r.stdout.includes('demo'),
    'stdout=' + r.stdout.slice(0, 400));
  // Stderr should have the "next:" hint (manual path)
  ok('stderr has "out:" or "next:"',
    r.stderr.includes('out:') || r.stderr.includes('next:'),
    'stderr=' + r.stderr);
}

section('cp workflow brainstorm --out <nonexistent-parent>/foo.yaml → exit 2, parent dir not found');
{
  const dir = mkFixture('brainstorm2');
  // Use a path whose parent dir clearly does not exist
  const badOut = path.join(dir, 'no-such-dir', 'foo.yaml');
  const r = cp(['workflow', 'brainstorm', '--out', badOut], dir);
  ok('exit 2', r.status === 2, 'status=' + r.status);
  ok('stderr has parent dir not found', r.stderr.includes('parent dir not found'),
    'stderr=' + r.stderr);
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
