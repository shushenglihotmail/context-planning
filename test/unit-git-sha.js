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

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
