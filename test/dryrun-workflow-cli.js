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

section('cp workflow diagram dev → stdout contains parent + child phases');
{
  const r = cp(['workflow', 'diagram', 'dev'], repoRoot);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  ok('stdout contains plan parent phase', r.stdout.includes('plan'),
    'stdout=' + r.stdout.slice(0, 400));
  ok('stdout contains child-plan', r.stdout.includes('child-plan'),
    'stdout=' + r.stdout.slice(0, 400));
  ok('stdout contains child-execute', r.stdout.includes('child-execute'),
    'stdout=' + r.stdout.slice(0, 400));
}

// ============================================================
// Section 5.5: inspect (NEW — plan 47-01)
// ============================================================
section('cp workflow inspect no args → usage on stderr, exit 2');
{
  const r = cp(['workflow', 'inspect'], repoRoot);
  ok('exit 2', r.status === 2, 'status=' + r.status);
  ok('stderr mentions Usage', r.stderr.includes('Usage: cp workflow inspect'),
    'stderr=' + r.stderr);
}

section('cp workflow inspect <missing> → template-not-found, exit 3');
{
  const r = cp(['workflow', 'inspect', 'does-not-exist'], repoRoot);
  ok('exit 3', r.status === 3, 'status=' + r.status);
  ok('stderr says not found', r.stderr.includes('not found'),
    'stderr=' + r.stderr);
}

section('cp workflow inspect <name> --bogus → unknown option, exit 2');
{
  const r = cp(['workflow', 'inspect', 'dev', '--bogus'], repoRoot);
  ok('exit 2', r.status === 2, 'status=' + r.status);
  ok('stderr mentions unknown option', r.stderr.includes('unknown option'),
    'stderr=' + r.stderr);
}

section('cp workflow inspect dev → shows YAML + wave decomposition, exit 0');
{
  const r = cp(['workflow', 'inspect', 'dev'], repoRoot);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  ok('stdout starts with template header', r.stdout.startsWith('# template: dev'),
    'stdout=' + r.stdout.slice(0, 80));
  ok('stdout contains workflow: dev YAML key', r.stdout.includes('workflow: dev'),
    'stdout has YAML body');
  ok('stdout contains "Deduced execution sequence" header',
    r.stdout.includes('=== Deduced execution sequence ==='),
    'stdout missing wave header');
  ok('stdout reports "1 wave(s)"', r.stdout.includes('1 wave(s)'),
    'stdout=' + r.stdout.slice(-400));
  ok('stdout has Wave 1 header', /Wave 1 of 1/.test(r.stdout),
    'stdout missing wave 1 line');
  ok('stdout shows plan role', /plan.*role: planner/.test(r.stdout),
    'stdout missing plan role line');
  ok('stdout shows child-plan as child of plan',
    /child-plan/.test(r.stdout) && /parent:\s*plan/.test(r.stdout),
    'stdout missing child-plan parent line');
}

section('cp workflow inspect dev --json → structured JSON, exit 0');
{
  const r = cp(['workflow', 'inspect', 'dev', '--json'], repoRoot);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch (_) {}
  ok('stdout is valid JSON', parsed !== null, 'stdout=' + r.stdout.slice(0, 200));
  if (parsed) {
    ok('json.workflow=dev', parsed.workflow === 'dev', 'workflow=' + parsed.workflow);
    ok('json.binds_to=milestone', parsed.binds_to === 'milestone',
      'binds_to=' + parsed.binds_to);
    ok('json.total_phases=3', parsed.total_phases === 3,
      'total_phases=' + parsed.total_phases);
    ok('json.total_waves=1', parsed.total_waves === 1,
      'total_waves=' + parsed.total_waves);
    ok('json.waves is array of length 1', Array.isArray(parsed.waves) && parsed.waves.length === 1,
      'waves.length=' + (parsed.waves && parsed.waves.length));
    ok('json wave 1 phase is plan with planner role',
      parsed.waves && parsed.waves[0].phases[0].id === 'plan' &&
        parsed.waves[0].phases[0].role === 'planner',
      'wave1.phase=' + JSON.stringify(parsed.waves && parsed.waves[0].phases[0]));
  }
}

section('cp workflow inspect quick → 3 waves, exit 0');
{
  const r = cp(['workflow', 'inspect', 'quick', '--json'], repoRoot);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  const parsed = JSON.parse(r.stdout);
  ok('quick.total_waves=3', parsed.total_waves === 3,
    'total_waves=' + parsed.total_waves);
  ok('quick.binds_to=quick (51-03)', parsed.binds_to === 'quick',
    'binds_to=' + parsed.binds_to);
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
// Section 8.5: export (NEW — plan 44-01)
// ============================================================
section('cp workflow export → usage error when no name');
{
  const dir = mkFixture('export0');
  const r = cp(['workflow', 'export'], dir);
  ok('exit 2', r.status === 2, 'status=' + r.status);
  ok('stderr shows Usage', r.stderr.includes('Usage:'), 'stderr=' + r.stderr);
}

section('cp workflow export dev → writes ./dev.yaml without # template: header, exit 0');
{
  const dir = mkFixture('export1');
  const r = cp(['workflow', 'export', 'dev'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  const dest = path.join(dir, 'dev.yaml');
  ok('dev.yaml created at cwd', fs.existsSync(dest), 'dest=' + dest);
  if (fs.existsSync(dest)) {
    const body = fs.readFileSync(dest, 'utf8');
    ok('no "# template:" header line', !/^# template:/m.test(body),
      'first 80 chars: ' + JSON.stringify(body.slice(0, 80)));
    ok('contains "workflow: dev"', /^workflow:\s+dev\s*$/m.test(body),
      'body head: ' + JSON.stringify(body.slice(0, 80)));
  }
}

section('cp workflow export dev (file exists, no --force) → exit 6');
{
  const dir = mkFixture('export2');
  cp(['workflow', 'export', 'dev'], dir);
  const r2 = cp(['workflow', 'export', 'dev'], dir);
  ok('exit 6 on collision', r2.status === 6, 'status=' + r2.status);
  ok('stderr mentions --force', r2.stderr.includes('--force'), 'stderr=' + r2.stderr);
}

section('cp workflow export dev --force → overwrites cleanly, exit 0');
{
  const dir = mkFixture('export3');
  cp(['workflow', 'export', 'dev'], dir);
  const r2 = cp(['workflow', 'export', 'dev', '--force'], dir);
  ok('exit 0', r2.status === 0, 'status=' + r2.status + ' stderr=' + r2.stderr);
}

section('cp workflow export dev --as my-dev → embedded "workflow:" key rewritten');
{
  const dir = mkFixture('export4');
  const r = cp(['workflow', 'export', 'dev', '--as', 'my-dev'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  const dest = path.join(dir, 'my-dev.yaml');
  ok('my-dev.yaml created (default --out uses --as name)', fs.existsSync(dest),
    'dest=' + dest);
  if (fs.existsSync(dest)) {
    const body = fs.readFileSync(dest, 'utf8');
    ok('contains "workflow: my-dev"', /^workflow:\s+my-dev\s*$/m.test(body),
      'head: ' + JSON.stringify(body.slice(0, 80)));
    ok('NO line "workflow: dev" anywhere', !/^workflow:\s+dev\s*$/m.test(body),
      'rewrite missed');
  }
}

section('cp workflow export dev --as "" → exit 2 (empty --as rejected)');
{
  const dir = mkFixture('export5');
  const r = cp(['workflow', 'export', 'dev', '--as', ''], dir);
  ok('exit 2', r.status === 2, 'status=' + r.status);
  ok('stderr mentions --as', r.stderr.includes('--as'), 'stderr=' + r.stderr);
}

section('cp workflow export nope → exit 3 (template not found)');
{
  const dir = mkFixture('export6');
  const r = cp(['workflow', 'export', 'nope'], dir);
  ok('exit 3', r.status === 3, 'status=' + r.status);
  ok('stderr mentions "not found"', /not found/.test(r.stderr), 'stderr=' + r.stderr);
}

section('cp workflow export dev --out subdir/x.yaml → creates parent dir');
{
  const dir = mkFixture('export7');
  const r = cp(['workflow', 'export', 'dev', '--out', 'nested/sub/dev.yaml'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  const dest = path.join(dir, 'nested', 'sub', 'dev.yaml');
  ok('nested file created', fs.existsSync(dest), 'dest=' + dest);
}

section('cp workflow --help mentions export');
{
  const dir = mkFixture('exporthelp');
  const r = cp(['workflow', '--help'], dir);
  ok('exit 0', r.status === 0);
  ok('help includes "cp workflow export"',
    r.stdout.includes('cp workflow export'),
    'stdout=' + r.stdout.slice(0, 800));
  ok('help includes --as flag', r.stdout.includes('--as'),
    'stdout=' + r.stdout.slice(0, 800));
  ok('help includes "cp workflow inspect"',
    r.stdout.includes('cp workflow inspect'),
    'stdout=' + r.stdout.slice(0, 800));
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
