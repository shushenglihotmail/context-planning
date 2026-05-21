'use strict';

/**
 * Tests for lib/git.js — v0.8 P1 SHA pinning helper.
 *
 * Verifies:
 *   - headSha returns a 40-char hex SHA in a git repo with a commit
 *   - headSha returns null in a fresh git repo with no commits
 *   - headSha returns null in a non-git directory
 *   - headSha returns null and writes a single stderr warning when
 *     git is not on PATH (simulated via empty PATH)
 *   - headSha never throws
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const git = require('../lib/git');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  \u2713 ${label}`); passed++; }
  else { console.log(`  \u2717 ${label}${detail ? ' \u2014 ' + detail : ''}`); failed++; }
}
function section(title) { console.log(`\n=== ${title} ===`); }

function mkRepo(suffix, withCommit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-git-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  if (withCommit) {
    fs.writeFileSync(path.join(dir, 'README.md'), '# t\n');
    execSync('git add README.md', { cwd: dir });
    execSync('git commit -q -m init', { cwd: dir });
  }
  return dir;
}

section('headSha returns SHA in a populated git repo');
{
  const root = mkRepo('with-commit', true);
  const sha = git.headSha({ cwd: root });
  ok('returns non-null', sha !== null);
  ok('returns a 40-char hex string', typeof sha === 'string' && /^[0-9a-f]{40}$/i.test(sha), `got: ${JSON.stringify(sha)}`);
  // Cross-check against direct git invocation.
  const direct = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  ok('matches `git rev-parse HEAD`', sha === direct);
}

section('headSha returns null in a fresh git repo without commits');
{
  git._resetWarnedForTests();
  const root = mkRepo('no-commit', false);
  const sha = git.headSha({ cwd: root });
  ok('returns null (no HEAD to resolve yet)', sha === null);
}

section('headSha returns null in a non-git directory');
{
  git._resetWarnedForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-git-nongit-'));
  const sha = git.headSha({ cwd: dir });
  ok('returns null in non-git tmp dir', sha === null);
}

section('headSha emits a single stderr warning when git is missing');
{
  git._resetWarnedForTests();
  // Run a child process with empty PATH so spawn('git', ...) hits ENOENT.
  // Cross-platform: empty PATH on both POSIX and Windows prevents resolution.
  const child = spawnSync(process.execPath, [
    '-e',
    "const g = require(process.argv[1]); g._resetWarnedForTests(); const a = g.headSha({ cwd: process.cwd() }); const b = g.headSha({ cwd: process.cwd() }); process.stdout.write(JSON.stringify({ a, b }));",
    path.resolve(__dirname, '..', 'lib', 'git.js'),
  ], {
    encoding: 'utf8',
    env: { ...process.env, PATH: '' },
    cwd: os.tmpdir(),
  });
  const out = JSON.parse(child.stdout || '{}');
  ok('two consecutive calls both return null', out.a === null && out.b === null);
  const warnings = (child.stderr || '').match(/cp: git not found \u2014 SHA pinning skipped/g) || [];
  ok('exactly one stderr warning despite two calls', warnings.length === 1, `got ${warnings.length} warnings; stderr: ${JSON.stringify(child.stderr)}`);
}

section('headSha never throws');
{
  let threw = false;
  try {
    git.headSha({ cwd: '/this/path/does/not/exist/anywhere' });
    git.headSha({ cwd: process.cwd() });
    git.headSha();
  } catch (err) {
    threw = true;
  }
  ok('no exception across bad cwd / missing opts', !threw);
}

// ---------- diffNameOnly (v0.8 P2) ----------

function mkRepoWithDiff(suffix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-git-diff-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  // base commit: README.md only
  fs.writeFileSync(path.join(dir, 'README.md'), '# t\n');
  execSync('git add README.md', { cwd: dir });
  execSync('git commit -q -m base', { cwd: dir });
  const base = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
  // end commit: add lib/foo.js (A), modify README.md (M), add a file with a space (A)
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lib', 'foo.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, 'README.md'), '# t v2\n');
  fs.writeFileSync(path.join(dir, 'a b.txt'), 'spaced\n');
  execSync('git add -A', { cwd: dir });
  execSync('git commit -q -m end', { cwd: dir });
  const end = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
  return { dir, base, end };
}

section('diffNameOnly returns status + path entries');
{
  const { dir, base, end } = mkRepoWithDiff('happy');
  const diff = git.diffNameOnly(base, end, { cwd: dir });
  ok('returns array', Array.isArray(diff));
  ok('has 3 entries (lib/foo.js, README.md, "a b.txt")', diff.length === 3,
    `got ${diff.length}: ${JSON.stringify(diff)}`);
  const byPath = Object.fromEntries(diff.map((e) => [e.path, e.status]));
  ok('lib/foo.js is A (added)', byPath['lib/foo.js'] === 'A');
  ok('README.md is M (modified)', byPath['README.md'] === 'M');
  ok('NUL-separated parser handles space in filename', byPath['a b.txt'] === 'A');
}

section('diffNameOnly returns [] on invalid inputs');
{
  const { dir, end } = mkRepoWithDiff('bad');
  ok('returns [] for null base', git.diffNameOnly(null, end, { cwd: dir }).length === 0);
  ok('returns [] for empty end', git.diffNameOnly('abc', '', { cwd: dir }).length === 0);
  ok('returns [] for non-existent base SHA', git.diffNameOnly('0000000000000000000000000000000000000000', end, { cwd: dir }).length === 0);
}

section('diffNameOnly returns [] when base == end');
{
  const { dir, end } = mkRepoWithDiff('same');
  ok('empty diff for same SHA both sides', git.diffNameOnly(end, end, { cwd: dir }).length === 0);
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
