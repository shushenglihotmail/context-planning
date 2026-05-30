/**
 * test/unit-command-help.js — `--help` / `-h` for the 7 commands that
 * gained printUsage helpers in this batch (capture, config,
 * scaffold-milestone, scaffold-phase, tick, write-summary, worktree).
 *
 * Asserts that:
 *   - exit code is 0
 *   - stdout contains "Usage:" and mentions the command name
 *   - stderr is empty (the help text goes to stdout, not stderr)
 *
 * Also covers worktree's per-subcommand help (create/list/remove) and
 * spot-checks that missing required args print usage to stderr with
 * exit code 2.
 */
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const CLI = path.join(REPO, 'bin', 'cp.js');

let passed = 0;
let failed = 0;

function section(title) { console.log(`\n=== ${title} ===`); }
function ok(label, cond, extra) {
  if (cond) { passed++; console.log(`  \u2713 ${label}`); return; }
  failed++;
  console.log(`  \u2717 ${label}${extra ? `  (${extra})` : ''}`);
}
function run(args) {
  // cwd is REPO — these are help-only invocations, no .planning needed.
  return spawnSync(process.execPath, [CLI, ...args], { cwd: REPO, encoding: 'utf8' });
}

const COMMANDS = [
  'capture',
  'config',
  'scaffold-milestone',
  'scaffold-phase',
  'tick',
  'write-summary',
  'worktree',
];

const WORKTREE_SUBS = ['create', 'list', 'remove'];

// =============================================================
section('--help / -h for each command');
for (const cmd of COMMANDS) {
  for (const flag of ['--help', '-h']) {
    const r = run([cmd, flag]);
    const label = `cp ${cmd} ${flag}`;
    ok(`${label}: exit 0`, r.status === 0, `exit=${r.status} stderr=${r.stderr.slice(0, 120)}`);
    ok(`${label}: stdout non-empty`, r.stdout.length > 0);
    ok(`${label}: stdout starts with "Usage:"`,
      /^Usage:/.test(r.stdout),
      `stdout head: ${r.stdout.slice(0, 60).replace(/\n/g, '\\n')}`);
    ok(`${label}: mentions "${cmd}"`,
      r.stdout.includes(cmd),
      `stdout: ${r.stdout.slice(0, 120).replace(/\n/g, '\\n')}`);
    ok(`${label}: stderr empty`,
      r.stderr === '' || r.stderr === '\n',
      `stderr: ${r.stderr.slice(0, 120)}`);
    ok(`${label}: lists -h, --help flag`,
      /-h,\s*--help/.test(r.stdout),
      `stdout: ${r.stdout.slice(0, 200).replace(/\n/g, '\\n')}`);
  }
}

// =============================================================
section('cp worktree <sub> --help / -h');
for (const sub of WORKTREE_SUBS) {
  for (const flag of ['--help', '-h']) {
    const r = run(['worktree', sub, flag]);
    const label = `cp worktree ${sub} ${flag}`;
    ok(`${label}: exit 0`, r.status === 0, `exit=${r.status} stderr=${r.stderr.slice(0, 120)}`);
    ok(`${label}: starts with "Usage: cp worktree ${sub}"`,
      r.stdout.startsWith(`Usage: cp worktree ${sub}`),
      `stdout head: ${r.stdout.slice(0, 80).replace(/\n/g, '\\n')}`);
    ok(`${label}: stderr empty`,
      r.stderr === '' || r.stderr === '\n',
      `stderr: ${r.stderr.slice(0, 120)}`);
  }
}

// =============================================================
section('missing required args print usage to stderr (exit 2)');
{
  // Each of these is missing the required positional arg. The new
  // printUsage(stderr) replaces the old terse single-line error.
  const cases = [
    ['capture',            'capture <text>'],
    ['scaffold-milestone', 'scaffold-milestone <name>'],
    ['tick',               'tick <plan-id>'],
    // scaffold-phase needs both <N> AND --name; --from is required for write-summary
    ['scaffold-phase',     'scaffold-phase <N>'],
    ['write-summary',      'write-summary <plan-id>'],
  ];
  for (const [cmd, marker] of cases) {
    const r = run([cmd]);
    ok(`cp ${cmd} (no args): exit 2`, r.status === 2, `exit=${r.status}`);
    ok(`cp ${cmd} (no args): stderr starts with "Usage:"`,
      /^Usage:/.test(r.stderr),
      `stderr head: ${r.stderr.slice(0, 80).replace(/\n/g, '\\n')}`);
    ok(`cp ${cmd} (no args): stderr mentions "${marker}"`,
      r.stderr.includes(marker),
      `stderr: ${r.stderr.slice(0, 200).replace(/\n/g, '\\n')}`);
  }
}

// =============================================================
section('cp worktree (no sub) prints top-level help to stdout (exit 0)');
{
  const r = run(['worktree']);
  ok('exit 0', r.status === 0, `exit=${r.status} stderr=${r.stderr.slice(0, 120)}`);
  ok('stdout starts with "Usage: cp worktree"',
    r.stdout.startsWith('Usage: cp worktree'),
    `stdout head: ${r.stdout.slice(0, 80).replace(/\n/g, '\\n')}`);
  ok('mentions create / list / remove',
    r.stdout.includes('create') && r.stdout.includes('list') && r.stdout.includes('remove'));
}

// =============================================================
section('cp worktree <unknown-sub> prints usage to stderr (exit 2)');
{
  const r = run(['worktree', 'bogus-sub']);
  ok('exit 2', r.status === 2, `exit=${r.status}`);
  ok('stderr mentions unknown subcommand',
    /Unknown worktree subcommand/i.test(r.stderr),
    `stderr: ${r.stderr.slice(0, 200).replace(/\n/g, '\\n')}`);
}

// =============================================================
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
