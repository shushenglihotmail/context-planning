'use strict';

/**
 * Integration test for the `cp run` CLI — end-to-end happy path.
 *
 * Spawns the cp binary (NOT the lib directly) for each step and verifies that
 * the full start → mark-complete loop → done lifecycle works correctly using
 * the built-in `quick` workflow (3 phases: discuss → execute → verify).
 *
 * ~10 assertions.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const cpBin = path.resolve(__dirname, '..', 'bin', 'cp.js');

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
 * Create a temp project suitable for end-to-end runtime tests.
 * git init + .planning/ with minimal PROJECT.md and ROADMAP.md.
 */
function mkFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-int-run-'));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.planning', 'PROJECT.md'),
    '# Integration Test Project\n\n## Constraints\n\n- Keep it simple\n'
  );
  fs.writeFileSync(
    path.join(dir, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Phases\n'
  );
  return dir;
}

function cp(args, cwd, opts) {
  return spawnSync(process.execPath, [cpBin].concat(args), Object.assign(
    { cwd: cwd, encoding: 'utf8' },
    opts || {}
  ));
}

// ============================================================
// Setup
// ============================================================
console.log('\n=== integration-run-cli setup ===');
const dir = mkFixture();
ok('fixture created', fs.existsSync(path.join(dir, '.planning')), 'dir=' + dir);

// ============================================================
// Step 1: cp run quick → capture slug
// ============================================================
section('cp run quick → exit 0, slug on stderr');
let slug = null;
{
  const r = cp(['run', 'quick'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  const m = r.stderr.match(/slug: (\S+)/);
  ok('slug captured from stderr', !!m, 'stderr=' + r.stderr);
  slug = m ? m[1] : null;
  ok('stdout has instruction', r.stdout.length > 0, 'stdout empty');
}

// ============================================================
// Step 2: cp run status --json → in-progress, wave 1
// ============================================================
section('cp run status --json → status in-progress, wave 1');
{
  const r = cp(['run', 'status', '--json'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status);
  let arr = null;
  try { arr = JSON.parse(r.stdout); } catch (_) {}
  ok('valid JSON array', Array.isArray(arr), 'stdout=' + r.stdout.slice(0, 200));
  const entry = arr && arr.find(function(e) { return e.slug === slug; });
  ok('entry for slug found', !!entry, 'slug=' + slug + ' arr=' + JSON.stringify(arr));
  ok('status is in-progress', entry && entry.status === 'in-progress',
    'status=' + (entry ? entry.status : 'null'));
  ok('current_wave is 1', entry && entry.current_wave === 1,
    'current_wave=' + (entry ? entry.current_wave : 'null'));
}

// ============================================================
// Step 3: mark-complete discuss → wave advances
// ============================================================
section('cp run mark-complete <slug> discuss → exit 0, wave advances');
{
  const r = cp(
    ['run', 'mark-complete', slug, 'discuss'],
    dir,
    { input: '# Summary discuss\n\nDiscuss phase completed.\n' }
  );
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  // stderr should mention wave or slug
  ok('stderr mentions wave advance or slug',
    r.stderr.includes('wave') || r.stderr.includes(slug),
    'stderr=' + r.stderr);
}

// ============================================================
// Step 4: status check after discuss complete
// ============================================================
section('cp run status --json after discuss → wave advanced');
{
  const r = cp(['run', 'status', '--json'], dir);
  let arr = null;
  try { arr = JSON.parse(r.stdout); } catch (_) {}
  const entry = arr && arr.find(function(e) { return e.slug === slug; });
  ok('wave advanced past 1', entry && entry.current_wave > 1,
    'current_wave=' + (entry ? entry.current_wave : 'null'));
}

// ============================================================
// Step 5: mark-complete execute
// ============================================================
section('cp run mark-complete <slug> execute → exit 0');
{
  const r = cp(
    ['run', 'mark-complete', slug, 'execute'],
    dir,
    { input: '# Summary execute\n\nExecute phase completed.\n' }
  );
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
}

// ============================================================
// Step 6: mark-complete verify (last phase) → done
// ============================================================
section('cp run mark-complete <slug> verify → exit 0, done in stderr');
{
  const r = cp(
    ['run', 'mark-complete', slug, 'verify'],
    dir,
    { input: '# Summary verify\n\nVerify phase completed.\n' }
  );
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  // After final phase: stderr says "Run complete"
  ok('stderr indicates completion',
    r.stderr.includes('complete') || r.stderr.includes('done') || r.stderr.includes('Done'),
    'stderr=' + r.stderr);
}

// ============================================================
// Step 7: status --json → status done
// ============================================================
section('cp run status --json → status done after all phases');
{
  const r = cp(['run', 'status', '--json'], dir);
  let arr = null;
  try { arr = JSON.parse(r.stdout); } catch (_) {}
  const entry = arr && arr.find(function(e) { return e.slug === slug; });
  ok('entry still present', !!entry, 'slug=' + slug);
  ok('status is done', entry && entry.status === 'done',
    'status=' + (entry ? entry.status : 'null'));
}

// ============================================================
// Step 8: cp run resume after done
// ============================================================
section('cp run resume <slug> after done → exit 0, prints something (last wave re-shown)');
{
  // Expected behavior: resumeRun clamps to last wave and returns its instruction.
  // The CLI prints that instruction and exits 0. This is the documented behavior.
  const r = cp(['run', 'resume', slug], dir);
  ok('exit 0 (resume of done run re-shows last wave)', r.status === 0,
    'status=' + r.status + ' stderr=' + r.stderr);
  ok('stdout non-empty (last wave instruction)', r.stdout.length > 0, 'stdout empty');
}

// ============================================================
// Cleanup
// ============================================================
section('cleanup');
try {
  fs.rmSync(dir, { recursive: true, force: true });
  ok('fixture cleaned up', true);
} catch (_) {
  ok('fixture cleaned up', false, 'could not remove ' + dir);
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
