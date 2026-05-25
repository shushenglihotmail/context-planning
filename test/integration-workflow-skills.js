'use strict';

/**
 * Integration test for v1.1 cp-workflow-* agent skills.
 *
 * The skills themselves are markdown instructions for an AI agent — they
 * can't be "executed" by a unit framework. What we CAN verify is:
 *
 *   1. The shipped skill files have valid shape (parseable frontmatter,
 *      required keys, body present) so the installers don't ship junk.
 *   2. The CLI commands they wrap (`cp run quick <name>`, `cp run abandon`)
 *      behave the way the skills assume — covering the slices not exercised
 *      by integration-run-cli.js (named slugs + abandon flow).
 *
 * Complement to:
 *   - test/integration-run-cli.js  (happy path: discuss → execute → verify → done)
 *   - test/unit-v034.js            (installer auto-pickup of the new skill files)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const CLI = path.join(REPO, 'bin', 'cp.js');

let passed = 0, failed = 0;
const failures = [];

function ok(label, cond, detail) {
  if (cond) {
    passed++;
    console.log('  \u2713 ' + label);
  } else {
    failed++;
    failures.push(label + (detail ? ': ' + detail : ''));
    console.log('  \u2717 ' + label + (detail ? ' \u2014 ' + detail : ''));
  }
}

function section(title) { console.log('\n=== ' + title + ' ==='); }

function cp(args, cwd, opts) {
  return spawnSync(process.execPath, [CLI].concat(args), Object.assign(
    { cwd: cwd, encoding: 'utf8' },
    opts || {}
  ));
}

function mkFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-wfskills-'));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.planning', 'PROJECT.md'),
    '# Test\n\n## Constraints\n\n- Keep it simple\n'
  );
  fs.writeFileSync(
    path.join(dir, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Phases\n'
  );
  return dir;
}

// ============================================================
// Part 1: skill file shape — frontmatter + body well-formed
// ============================================================
section('cp-workflow-* skills: source files are well-formed');

const skillFiles = [
  { name: 'cp-workflow-run',    src: path.join(REPO, 'commands', 'cp', 'workflow-run.md') },
  { name: 'cp-workflow-list',   src: path.join(REPO, 'commands', 'cp', 'workflow-list.md') },
  { name: 'cp-workflow-resume', src: path.join(REPO, 'commands', 'cp', 'workflow-resume.md') },
];

for (const skill of skillFiles) {
  ok(`${skill.name}: source file exists`, fs.existsSync(skill.src), skill.src);
  if (!fs.existsSync(skill.src)) continue;

  const body = fs.readFileSync(skill.src, 'utf8').replace(/\r\n/g, '\n');

  ok(`${skill.name}: starts with YAML frontmatter`,
    body.startsWith('---\n'),
    'first 40 chars: ' + JSON.stringify(body.slice(0, 40)));

  const fmEnd = body.indexOf('\n---\n', 4);
  ok(`${skill.name}: frontmatter is closed`, fmEnd > 0, 'no closing ---');
  if (fmEnd <= 0) continue;

  const fm = body.slice(4, fmEnd);

  // Both installers (copilot + claude) rely on a `name:` key matching the
  // skill file name. Without this, /cp-workflow-* dispatch silently breaks.
  ok(`${skill.name}: frontmatter has 'name:' matching file`,
    new RegExp(`^name:\\s+${skill.name}\\s*$`, 'm').test(fm),
    'fm=' + JSON.stringify(fm));

  // description: drives the agent's skill autoload heuristic.
  ok(`${skill.name}: frontmatter has 'description:'`,
    /^description:\s+\S/m.test(fm));

  // Body must contain numbered Steps (matches the autonomous.md / quick.md
  // pattern used by every other cp-* skill).
  const skillBody = body.slice(fmEnd + 5);
  ok(`${skill.name}: body has numbered Step sections`,
    /^##\s+Step\s+\d/m.test(skillBody),
    'no `## Step N` headings found');
}

// ============================================================
// Part 2: `cp run quick <name>` — named slug honoured
// (integration-run-cli.js covers the unnamed slug case.)
// ============================================================
section('cp run quick "smoke-test" → slug uses the given name');
const dir1 = mkFixture();
let namedSlug = null;
{
  const r = cp(['run', 'quick', 'smoke-test'], dir1);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  const m = r.stderr.match(/slug:\s*(\S+)/);
  ok('slug captured', !!m, 'stderr=' + r.stderr);
  namedSlug = m ? m[1] : null;
  ok('slug contains the requested name',
    namedSlug && namedSlug.includes('smoke-test'),
    'slug=' + namedSlug);
}

// ============================================================
// Part 3: `cp run abandon <slug>` → status flips to abandoned
// (Not covered by integration-run-cli.js; the cp-workflow-resume skill
// promises this path works.)
// ============================================================
section('cp run abandon <slug> --yes → status becomes "abandoned"');
{
  const r = cp(['run', 'abandon', namedSlug, '--yes'], dir1);
  ok('abandon exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
}
{
  const r = cp(['run', 'status', '--json'], dir1);
  let arr = null;
  try { arr = JSON.parse(r.stdout); } catch (_) {}
  ok('status --json parses', Array.isArray(arr), 'stdout=' + r.stdout.slice(0, 200));
  const entry = arr && arr.find(e => e.slug === namedSlug);
  ok('entry still listed after abandon', !!entry, 'slug=' + namedSlug);
  ok('status is "abandoned"',
    entry && entry.status === 'abandoned',
    'status=' + (entry ? entry.status : 'null'));
}

// ============================================================
// Cleanup
// ============================================================
section('cleanup');
try {
  fs.rmSync(dir1, { recursive: true, force: true });
  ok('fixture cleaned up', true);
} catch (_) {
  ok('fixture cleaned up', false, 'could not remove ' + dir1);
}

// ============================================================
// Results
// ============================================================
console.log('\n----------------------------------------');
console.log('Passed: ' + passed + '   Failed: ' + failed);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
