/**
 * test/unit-worktree.js — coverage for lib/worktree.js + `cp worktree`
 * (v0.4.3).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const CLI = path.join(REPO, 'bin', 'cp.js');
const worktree = require(path.join(REPO, 'lib', 'worktree'));

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
function run(args, cwd, env) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
}

// =============================================================
section('slugify');
{
  ok('lowercases',         worktree.slugify('Cool Feature') === 'cool-feature');
  ok('replaces underscores', worktree.slugify('my_cool_thing') === 'my-cool-thing');
  ok('collapses hyphens',  worktree.slugify('foo---bar') === 'foo-bar');
  ok('strips punctuation', worktree.slugify('feature/1.0!') === 'feature10');
  ok('strips leading/trailing -', worktree.slugify('-hi-') === 'hi');
  let threw = null;
  try { worktree.slugify('!!!'); } catch (e) { threw = e; }
  ok('throws on empty result', threw !== null);
}

// =============================================================
section('defaultWorktreePath / defaultBranchName');
{
  const root = process.platform === 'win32' ? 'C:\\work\\projects\\myrepo' : '/work/projects/myrepo';
  ok('sibling path correct',
    worktree.defaultWorktreePath(root, 'cool') === path.join(path.dirname(root), 'myrepo-cool'));
  ok('branch name prefixed', worktree.defaultBranchName('cool') === 'cp/cool');
}

// =============================================================
section('parseGitWorktreeList');
{
  const raw = `worktree /work/projects/myrepo
HEAD abc123
branch refs/heads/main

worktree /work/projects/myrepo-cool
HEAD def456
branch refs/heads/cp/cool

worktree /work/projects/myrepo-bare
HEAD 000000
detached
`;
  const list = worktree.parseGitWorktreeList(raw);
  ok('3 entries', list.length === 3, `got ${list.length}`);
  ok('first is main', list[0].branch === 'main');
  ok('second is cp/cool', list[1].branch === 'cp/cool');
  ok('third is detached', list[2].detached === true);
  ok('strips refs/heads/', !list.some((t) => t.branch && t.branch.startsWith('refs/')));
}

// =============================================================
section('renderWorktreesDoc / parseWorktreesDoc round-trip');
{
  const entries = [
    { slug: 'a', branch: 'cp/a', path: '/x/a', phase: '01', created: '2026-05-19', notes: '' },
    { slug: 'b', branch: 'cp/b', path: '/x/b', phase: null,  created: '2026-05-20', notes: 'WIP' },
  ];
  const rendered = worktree.renderWorktreesDoc(entries);
  ok('contains table header', /\| Slug \| Branch \|/.test(rendered));
  ok('contains both slugs', /\| a \|/.test(rendered) && /\| b \|/.test(rendered));
  const parsed = worktree.parseWorktreesDoc(rendered);
  ok('round-trip preserves count', parsed.length === 2);
  ok('round-trip preserves slug+branch+path',
    parsed[0].slug === 'a' && parsed[0].branch === 'cp/a' && parsed[0].path === '/x/a');
  ok('round-trip preserves phase (string)', parsed[0].phase === '01');
  ok('round-trip preserves null phase', parsed[1].phase === null);
  ok('round-trip preserves notes', parsed[1].notes === 'WIP');
}

// =============================================================
section('parseWorktreesDoc tolerates noise');
{
  const messy = `# Worktrees

Random prose nobody asked for.

| Slug | Branch | Path | Phase | Created | Notes |
|------|--------|------|-------|---------|-------|
| ok   | cp/ok  | /x   | —     | 2026-05-19 | hi |

unrelated trailing line
`;
  const r = worktree.parseWorktreesDoc(messy);
  ok('parsed 1 entry', r.length === 1);
  ok('null phase normalised', r[0].phase === null);
}

// =============================================================
section('addRegistryEntry / removeRegistryEntry');
{
  const root = mktmp('registry');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });

  const r1 = worktree.addRegistryEntry(root, {
    slug: 'foo', branch: 'cp/foo', path: '/x/foo', phase: null, created: '2026-05-19',
  });
  ok('action list = 1', r1.actions.length === 1);
  ok('alreadyPresent false on first add', r1.alreadyPresent === false);

  // Apply directly (mirrors CLI flow)
  fs.writeFileSync(r1.actions[0].path, r1.actions[0].after);

  const reg = worktree.listRegistry(root);
  ok('listRegistry returns 1', reg.length === 1);
  ok('slug matches', reg[0].slug === 'foo');

  // Re-add same slug -> alreadyPresent=true
  const r2 = worktree.addRegistryEntry(root, {
    slug: 'foo', branch: 'cp/foo', path: '/x/foo', phase: null, created: '2026-05-19',
  });
  ok('alreadyPresent true on duplicate', r2.alreadyPresent === true);

  // Remove existing
  const rr = worktree.removeRegistryEntry(root, 'foo');
  ok('remove returns 1 action', rr.actions.length === 1);
  ok('remove returns the removed entry', rr.removed && rr.removed.slug === 'foo');
  fs.writeFileSync(rr.actions[0].path, rr.actions[0].after);
  ok('listRegistry now empty', worktree.listRegistry(root).length === 0);

  // Remove non-existent
  const rNone = worktree.removeRegistryEntry(root, 'nope');
  ok('remove non-existent: no actions', rNone.actions.length === 0);
  ok('remove non-existent: removed=null', rNone.removed === null);
}

// =============================================================
section('CLI e2e: worktree create / list / remove');
{
  const root = bootProject('wt-cli');
  // Use a temp sub-dir for the worktree path to avoid clobbering the sibling
  // of the tmp dir (which has unstable names in CI).
  const wpath = path.join(root, '..', `${path.basename(root)}-cool`);

  const cr = run(['worktree', 'create', 'cool', '--path', wpath, '--phase', '1', '--no-commit'], root);
  ok('create exit 0', cr.status === 0, `stderr: ${cr.stderr}`);
  ok('create output mentions registered', /worktree registered/.test(cr.stdout));
  ok('WORKTREES.md created',
    fs.existsSync(path.join(root, '.planning', 'WORKTREES.md')));
  ok('git worktree directory exists', fs.existsSync(wpath));

  // list
  const lr = run(['worktree', 'list'], root);
  ok('list exit 0', lr.status === 0);
  ok('list shows the slug',  /cool/.test(lr.stdout));
  ok('list shows on-disk',   /on disk/.test(lr.stdout));

  // list --json
  const jr = run(['worktree', 'list', '--json'], root);
  ok('list --json exit 0', jr.status === 0);
  const j = JSON.parse(jr.stdout);
  ok('json.registered has 1', j.registered.length === 1);
  ok('json.registered[0].slug = cool', j.registered[0].slug === 'cool');
  ok('json.git is an array', Array.isArray(j.git));

  // remove
  const rm = run(['worktree', 'remove', 'cool', '--no-commit'], root);
  ok('remove exit 0', rm.status === 0, `stderr: ${rm.stderr}`);
  ok('worktree dir gone', !fs.existsSync(wpath));

  const after = worktree.listRegistry(root);
  ok('registry empty after remove', after.length === 0);

  // Remove non-existent: error
  const rmGhost = run(['worktree', 'remove', 'does-not-exist'], root);
  ok('remove non-existent: exit 1', rmGhost.status === 1);
  ok('remove non-existent: error message',
    /No worktree registered/.test(rmGhost.stderr), `stderr: ${rmGhost.stderr}`);
}

// =============================================================
section('CLI e2e: --no-create skips git worktree add');
{
  const root = bootProject('wt-nocreate');
  const wpath = path.join(root, '..', `${path.basename(root)}-skip`);

  const cr = run(['worktree', 'create', 'skip', '--path', wpath, '--no-create', '--no-commit'], root);
  ok('exit 0', cr.status === 0, `stderr: ${cr.stderr}`);
  ok('registry has entry', worktree.listRegistry(root).length === 1);
  ok('git did NOT create the dir', !fs.existsSync(wpath));
  ok('output mentions skipping', /skipping git worktree add/.test(cr.stdout));
}

// =============================================================
section('CLI: usage errors');
{
  const root = bootProject('wt-usage');
  const noSub = run(['worktree'], root);
  ok('no subcommand: exit 2', noSub.status === 2);
  const badSub = run(['worktree', 'frobnicate'], root);
  ok('bad subcommand: exit 2', badSub.status === 2);
  const missingName = run(['worktree', 'create'], root);
  ok('create without name: exit 2', missingName.status === 2);
  const missingRemoveSlug = run(['worktree', 'remove'], root);
  ok('remove without slug: exit 2', missingRemoveSlug.status === 2);
}

// Cleanup: also clean up sibling worktree dirs we created
const siblings = [];
for (const d of tracked) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  // Best-effort: clean up any sibling -<slug> dirs left behind
  try {
    const parent = path.dirname(d);
    const base = path.basename(d);
    for (const f of fs.readdirSync(parent)) {
      if (f.startsWith(`${base}-`)) {
        try { fs.rmSync(path.join(parent, f), { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

section('lib/worktree: shell-out helpers exported (v0.4.4)');
{
  ok('runGitWorktreeAdd is a function',
    typeof worktree.runGitWorktreeAdd === 'function');
  ok('runGitWorktreeRemove is a function',
    typeof worktree.runGitWorktreeRemove === 'function');
  ok('listGitWorktrees is a function',
    typeof worktree.listGitWorktrees === 'function');

  // listGitWorktrees in a non-git dir returns [] (does not throw).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-wt-nongit-'));
  tracked.push(tmp);
  const out = worktree.listGitWorktrees(tmp);
  ok('listGitWorktrees on non-git dir returns []',
    Array.isArray(out) && out.length === 0);

  // listGitWorktrees inside a real git repo returns at least the main worktree.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-wt-gitrepo-'));
  tracked.push(repo);
  execSync('git init -q', { cwd: repo, stdio: 'ignore' });
  execSync('git config user.email test@test', { cwd: repo, stdio: 'ignore' });
  execSync('git config user.name test', { cwd: repo, stdio: 'ignore' });
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  execSync('git add . && git commit -q -m init', { cwd: repo, stdio: 'ignore' });
  const trees = worktree.listGitWorktrees(repo);
  ok('listGitWorktrees in real repo returns >=1 worktree',
    Array.isArray(trees) && trees.length >= 1, `got ${JSON.stringify(trees)}`);
  ok('listGitWorktrees first entry has .path',
    trees[0] && typeof trees[0].path === 'string');
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
