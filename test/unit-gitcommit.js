/**
 * test/unit-gitcommit.js — v0.3.3
 *
 * Regression coverage for the CONCERNS High "gitCommit uses repo-wide
 * `git add -A`". The old behaviour swept unrelated working-tree edits
 * into a `cp:`-prefixed commit. New behaviour:
 *
 *   - `gitCommit(root, msg)`             → stages only `.planning/`
 *   - `gitCommit(root, msg, { paths })`  → stages exactly those paths
 *   - `gitCommit(root, msg, { planningOnly: false })` → legacy add -A
 *
 * Plus coverage for the `pathsFromActions` helper.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const lifecycle = require(path.join(REPO, 'lib', 'lifecycle'));

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

function gitInit(root) {
  execSync('git init -q', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email "cp-test@example.com"', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name "cp-test"', { cwd: root, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'pipe' });
  fs.writeFileSync(path.join(root, 'README.md'), '# seed\n');
  execSync('git add README.md', { cwd: root, stdio: 'pipe' });
  execSync('git commit -q -m "seed"', { cwd: root, stdio: 'pipe' });
}

function statusPorcelain(root) {
  return execSync('git status --porcelain', { cwd: root, stdio: 'pipe' }).toString();
}

function listCommittedFiles(root) {
  return execSync('git show --name-only --pretty=format:""', { cwd: root, stdio: 'pipe' })
    .toString().trim().split(/\r?\n/).filter(Boolean);
}

// =============================================================
section('lib/lifecycle: pathsFromActions');
{
  ok('empty input -> []', JSON.stringify(lifecycle.pathsFromActions([])) === '[]');
  ok('null input -> []', JSON.stringify(lifecycle.pathsFromActions(null)) === '[]');
  ok('undefined input -> []', JSON.stringify(lifecycle.pathsFromActions(undefined)) === '[]');

  const actions = [
    { kind: 'write', path: '/a.md' },
    { kind: 'write', path: '/b.md' },
    { kind: 'delete', path: '/c.md' },
    { kind: 'write', path: '/a.md' },       // dup, should dedup
    { kind: 'skip', path: '/d.md' },        // ignored kind
    { kind: 'mkdir', path: '/dir/' },       // ignored kind
    { kind: 'write' },                      // missing path
    null,                                   // junk
  ];
  const got = lifecycle.pathsFromActions(actions);
  ok('preserves order + dedup + filters', JSON.stringify(got) === JSON.stringify(['/a.md', '/b.md', '/c.md']));
}

// =============================================================
section('lib/lifecycle: gitCommit default scope (planningOnly)');
{
  const root = mktmp('gc-default');
  gitInit(root);

  // Dirty file OUTSIDE .planning/ — must NOT be staged by the default call.
  fs.writeFileSync(path.join(root, 'app.js'), 'console.log(1)\n');

  // State change inside .planning/
  fs.mkdirSync(path.join(root, '.planning'));
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# state\n');

  const hash = lifecycle.gitCommit(root, 'cp: test default scope');
  ok('returns commit hash', typeof hash === 'string' && hash.length > 0);

  const files = listCommittedFiles(root);
  ok('commit contains .planning/STATE.md', files.some((f) => f === '.planning/STATE.md'));
  ok('commit does NOT contain app.js', !files.includes('app.js'));

  const dirty = statusPorcelain(root);
  ok('app.js still untracked after commit', /\?\?\s+app\.js/.test(dirty));
}

// =============================================================
section('lib/lifecycle: gitCommit with explicit paths');
{
  const root = mktmp('gc-paths');
  gitInit(root);

  // Two state-layer changes
  fs.mkdirSync(path.join(root, '.planning'));
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# state\n');
  fs.writeFileSync(path.join(root, '.planning', 'NOTES.md'), '# notes\n');
  // Dirty file outside .planning/
  fs.writeFileSync(path.join(root, 'side.js'), '// noise\n');

  // Caller passes ONLY STATE.md path.
  const hash = lifecycle.gitCommit(root, 'cp: test explicit', {
    paths: [path.join(root, '.planning', 'STATE.md')],
  });
  ok('returns commit hash', typeof hash === 'string' && hash.length > 0);

  const files = listCommittedFiles(root);
  ok('commit contains STATE.md',  files.includes('.planning/STATE.md'));
  ok('commit excludes NOTES.md',  !files.includes('.planning/NOTES.md'));
  ok('commit excludes side.js',   !files.includes('side.js'));

  const dirty = statusPorcelain(root);
  ok('NOTES.md still untracked',  /\?\?\s+\.planning\/NOTES\.md/.test(dirty));
  ok('side.js still untracked',   /\?\?\s+side\.js/.test(dirty));
}

// =============================================================
section('lib/lifecycle: gitCommit with relative paths');
{
  const root = mktmp('gc-relpath');
  gitInit(root);

  fs.mkdirSync(path.join(root, '.planning'));
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# state\n');
  fs.writeFileSync(path.join(root, 'other.js'), 'x\n');

  // Pass a repo-relative path (not absolute)
  const hash = lifecycle.gitCommit(root, 'cp: test relpath', {
    paths: ['.planning/STATE.md'],
  });
  ok('accepts relative path -> commits', typeof hash === 'string' && hash.length > 0);
  const files = listCommittedFiles(root);
  ok('commit only contains STATE.md', files.length === 1 && files[0] === '.planning/STATE.md');
}

// =============================================================
section('lib/lifecycle: gitCommit empty staging returns null');
{
  const root = mktmp('gc-empty');
  gitInit(root);
  fs.writeFileSync(path.join(root, 'untracked.js'), 'noise\n');
  // No .planning/ at all — default scope finds nothing.
  const hash = lifecycle.gitCommit(root, 'cp: nothing');
  ok('returns null when no staged changes', hash === null);
}

// =============================================================
section('lib/lifecycle: gitCommit planningOnly:false is legacy add -A');
{
  const root = mktmp('gc-legacy');
  gitInit(root);
  fs.writeFileSync(path.join(root, 'pulled-in.js'), 'sweep\n');
  const hash = lifecycle.gitCommit(root, 'cp: legacy', { planningOnly: false });
  ok('legacy mode commits', typeof hash === 'string');
  const files = listCommittedFiles(root);
  ok('legacy mode swept in pulled-in.js', files.includes('pulled-in.js'));
}

// =============================================================
section('end-to-end: cp scaffold ops do NOT sweep dirty working tree');
{
  // Use the actual CLI surface so we cover the bin/cp.js call sites.
  const root = mktmp('e2e-scope');
  gitInit(root);
  // Bootstrap a cp project.
  const cli = path.join(REPO, 'bin', 'cp.js');
  execSync(`node "${cli}" init --no-commit`, { cwd: root, stdio: 'pipe' });
  execSync('git add -A && git commit -q -m "cp: init"', { cwd: root, stdio: 'pipe' });

  // Drop a dirty source file outside .planning/.
  fs.writeFileSync(path.join(root, 'dirty.js'), '// must not be committed\n');

  // Run scaffold-milestone — historically this would commit dirty.js too.
  execSync(`node "${cli}" scaffold-milestone v0.1`, { cwd: root, stdio: 'pipe' });

  const files = listCommittedFiles(root);
  ok('scaffold-milestone commit excludes dirty.js', !files.includes('dirty.js'));
  ok('scaffold-milestone commit touched ROADMAP.md',
    files.some((f) => f.endsWith('ROADMAP.md')));

  const dirty = statusPorcelain(root);
  ok('dirty.js still untracked after scaffold-milestone',
    /\?\?\s+dirty\.js/.test(dirty));

  // Same for scaffold-phase.
  execSync(`node "${cli}" scaffold-phase 1 --name MVP --plans 1`, { cwd: root, stdio: 'pipe' });
  const files2 = listCommittedFiles(root);
  ok('scaffold-phase commit excludes dirty.js', !files2.includes('dirty.js'));
  ok('scaffold-phase commit touched a PLAN.md',
    files2.some((f) => f.endsWith('PLAN.md')));

  // And scaffold-codebase.
  execSync(`node "${cli}" scaffold-codebase`, { cwd: root, stdio: 'pipe' });
  const files3 = listCommittedFiles(root);
  ok('scaffold-codebase commit excludes dirty.js', !files3.includes('dirty.js'));
  ok('scaffold-codebase commit touched codebase/ STACK.md',
    files3.some((f) => f.endsWith('codebase/STACK.md') || f.endsWith('codebase\\STACK.md')));
}

// Cleanup
for (const d of tracked) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
