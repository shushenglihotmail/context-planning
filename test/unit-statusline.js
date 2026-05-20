/**
 * test/unit-statusline.js — coverage for `cp statusline` (v0.4.1).
 *
 * statusline is a prompt-shell helper. Critical properties:
 *   1. NEVER throws / emits noise outside a cp project — exit 0, no output.
 *   2. Renders something useful when state exists.
 *   3. --json shape stable for harness integration.
 *   4. --format custom template tokens resolve.
 *   5. ANSI color escapes off when --no-color or NO_COLOR set.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const CLI = path.join(REPO, 'bin', 'cp.js');

let passed = 0;
let failed = 0;
const tracked = [];

function section(title) { console.log(`\n=== ${title} ===`); }
function ok(label, cond, extra) {
  if (cond) { passed++; console.log(`  \u2713 ${label}`); return; }
  failed++;
  console.log(`  \u2717 ${label}${extra ? `  (${extra})` : ''}`);
}
function mktmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `cp-${prefix}-`));
  tracked.push(d);
  return d;
}
function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, NO_COLOR: '1', ...(opts.env || {}) },
    encoding: 'utf8',
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', code: r.status };
}
function bootProject(prefix) {
  const root = mktmp(prefix);
  execSync('git init -q', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email "t@e.com"', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name "t"', { cwd: root, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'pipe' });
  fs.writeFileSync(path.join(root, 'README.md'), '# seed\n');
  execSync('git add -A && git commit -q -m "seed"', { cwd: root, stdio: 'pipe' });
  execSync(`node "${CLI}" init --no-commit`, { cwd: root, stdio: 'pipe' });
  execSync('git add -A && git commit -q -m "cp: init"', { cwd: root, stdio: 'pipe' });
  return root;
}
function withMilestone(root, name) {
  execSync(`node "${CLI}" scaffold-milestone "${name}" --no-commit`, { cwd: root, stdio: 'pipe' });
  execSync('git add -A && git commit -q -m "cp: milestone"', { cwd: root, stdio: 'pipe' });
}
function withPhase(root, num, name, plans) {
  execSync(`node "${CLI}" scaffold-phase ${num} --name ${name} --plans ${plans} --no-commit`, { cwd: root, stdio: 'pipe' });
  execSync('git add -A && git commit -q -m "cp: phase"', { cwd: root, stdio: 'pipe' });
}

// =============================================================
section('statusline: silent outside any project');
{
  // os.tmpdir() is not a git repo with .planning/ROADMAP.md
  const r = run(['statusline'], { cwd: os.tmpdir() });
  ok('exit code 0', r.code === 0, `got ${r.code}`);
  ok('no stdout', r.stdout.trim() === '', `got: ${JSON.stringify(r.stdout)}`);
  ok('no stderr', r.stderr.trim() === '', `got: ${JSON.stringify(r.stderr)}`);
}

// =============================================================
section('statusline: silent in fresh git repo without cp init');
{
  const root = mktmp('statusline-bare');
  execSync('git init -q', { cwd: root, stdio: 'pipe' });
  const r = run(['statusline'], { cwd: root });
  ok('exit code 0', r.code === 0);
  ok('no stdout', r.stdout.trim() === '');
}

// =============================================================
section('statusline: cp project, no milestone yet');
{
  const root = bootProject('statusline-init');
  const r = run(['statusline'], { cwd: root });
  ok('exit code 0', r.code === 0);
  ok('mentions cp', /cp/.test(r.stdout));
  // After `cp init`, ROADMAP has the placeholder "v0.1 (MVP)" milestone heading.
  // Either "(no milestone)" or the placeholder appears — both are valid.
  ok('non-empty output', r.stdout.trim().length > 0);
}

// =============================================================
section('statusline: full state — milestone + phase + plans');
{
  const root = bootProject('statusline-full');
  withMilestone(root, 'v0.5 — Cool Stuff');
  withPhase(root, 1, 'first-phase', 3);

  const text = run(['statusline'], { cwd: root });
  ok('exit code 0', text.code === 0, `stderr: ${text.stderr}`);
  ok('contains milestone name',
    /v0\.5/.test(text.stdout), `got: ${text.stdout}`);
  ok('contains phase label (slugified)',
    /01-first-phase/.test(text.stdout) || /first-phase/.test(text.stdout),
    `got: ${text.stdout}`);
  ok('contains done/total (0/3)',
    /0\/3/.test(text.stdout), `got: ${text.stdout}`);

  // --json shape
  const j = run(['statusline', '--json'], { cwd: root });
  ok('--json exit 0', j.code === 0);
  const obj = JSON.parse(j.stdout);
  ok('json.milestone present', typeof obj.milestone === 'string' && obj.milestone.length > 0);
  ok('json.phase present', obj.phase && obj.phase.total === 3);
  ok('json.phase.done = 0', obj.phase.done === 0);
  ok('json.nextPlan present', obj.nextPlan && obj.nextPlan.planId);
  ok('json.branch present (some string)', typeof obj.branch === 'string');

  // --format custom template
  const f = run(['statusline', '--format', '[%M | %P | %D | %N]'], { cwd: root });
  ok('--format exit 0', f.code === 0);
  ok('--format substituted',
    /\[v0\.5.*\|.*first-phase.*\|.*0\/3.*\|.*01-01\]/.test(f.stdout),
    `got: ${f.stdout}`);

  // --no-color suppresses ANSI escapes
  const nc = run(['statusline', '--no-color'], { cwd: root });
  ok('--no-color: no ANSI escapes',
    !/\x1b\[/.test(nc.stdout), `got: ${JSON.stringify(nc.stdout)}`);
}

// =============================================================
section('statusline: NO_COLOR env var suppresses ANSI');
{
  const root = bootProject('statusline-nocolor');
  withMilestone(root, 'v0.6 — Test');
  withPhase(root, 1, 'p', 1);
  const r = run(['statusline'], { cwd: root, env: { NO_COLOR: '1' } });
  ok('exit 0', r.code === 0);
  ok('no ANSI escapes', !/\x1b\[/.test(r.stdout), `got: ${JSON.stringify(r.stdout)}`);
}

// =============================================================
section('statusline: %B branch token resolves');
{
  const root = bootProject('statusline-branch');
  withMilestone(root, 'v0.7');
  withPhase(root, 1, 'foo', 1);
  // Cross-platform: don't redirect stderr / don't force cmd.exe shell.
  execSync('git checkout -b feature/cool', { cwd: root, stdio: 'pipe' });
  const r = run(['statusline', '--format', 'branch=%B'], { cwd: root });
  ok('contains the new branch name', /branch=feature\/cool/.test(r.stdout),
    `got: ${r.stdout}`);
}

// =============================================================
section('statusline: --json works in a totally empty milestone');
{
  const root = bootProject('statusline-emptymilestone');
  withMilestone(root, 'v0.8 — empty');
  const r = run(['statusline', '--json'], { cwd: root });
  ok('exit 0', r.code === 0);
  const obj = JSON.parse(r.stdout);
  ok('milestone resolved', /v0\.8/.test(obj.milestone || ''));
  // No phases yet -> phase is null
  ok('phase null (no phases scaffolded)', obj.phase === null);
  ok('nextPlan null', obj.nextPlan === null);
}

// Cleanup
for (const d of tracked) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
