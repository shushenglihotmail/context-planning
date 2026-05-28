'use strict';

/**
 * Tests for lib/checkpoint.js — v1.4 phase checkpoint helpers.
 *
 * Builds a throwaway git repo in tmp and exercises snapshot / commit /
 * revert / restart against it.
 *
 * Covers:
 *   - snapshot records HEAD sha into state
 *   - commit stages declared outputs only, leaves out-of-scope dirty
 *   - commit skip-count reports out-of-scope dirty files
 *   - commit with no in-scope changes returns noChanges
 *   - revert restores in-scope writes, leaves out-of-scope dirty
 *   - revert removes untracked in-scope files
 *   - restart with clean tree resets HEAD to snapshot and re-pends phase
 *   - restart refuses when dirty (without --force)
 *   - restart refuses when unexpected commits exist (without --force)
 *   - declared output escaping project root is rejected
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const supervisor = require('../lib/supervisor');
const checkpoint = require('../lib/checkpoint');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function tmpdir(suffix = '') {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cp-checkpoint-${suffix}-`));
}

function git(args, cwd) {
  const r = spawnSync('git', args, {cwd: cwd, encoding: 'utf8'});
  if (r.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' failed: ' + (r.stderr || ''));
  }
  return r.stdout.trim();
}

function mkRepo(suffix) {
  const dir = tmpdir(suffix);
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 'cp-test@example.com'], dir);
  git(['config', 'user.name', 'cp-test'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n');
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'initial'], dir);
  return dir;
}

function head(cwd) { return git(['rev-parse', 'HEAD'], cwd); }

function setupRun(dir, slug, phaseOutputs) {
  supervisor.initRun(slug, {workflow: 'milestone'}, {projectDir: dir});
  supervisor.setPath(slug, 'phases.plan', {status: 'pending', outputs: phaseOutputs}, {projectDir: dir});
}

// ---------- snapshot ----------

section('snapshot records HEAD into state.json');
{
  const dir = mkRepo('snap');
  setupRun(dir, 'snap-1', ['lib/']);
  const r = checkpoint.snapshot('snap-1', 'plan', {projectDir: dir});
  const h = head(dir);
  ok('returned sha matches HEAD', r.sha === h);
  const st = supervisor.readState('snap-1', {projectDir: dir});
  ok('persisted snapshot_commit', st.phases.plan.snapshot_commit === h);
  ok('persisted snapshot_ts', typeof st.phases.plan.snapshot_ts === 'string');
}

// ---------- commit ----------

section('commit stages declared outputs only');
{
  const dir = mkRepo('commit');
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.mkdirSync(path.join(dir, 'src'));
  setupRun(dir, 'c-1', ['lib/']);
  checkpoint.snapshot('c-1', 'plan', {projectDir: dir});
  fs.writeFileSync(path.join(dir, 'lib', 'a.js'), 'export const a=1;');
  fs.writeFileSync(path.join(dir, 'src', 'b.js'), 'oops');
  const r = checkpoint.commit('c-1', 'plan', {projectDir: dir});
  ok('commit sha returned', typeof r.commit === 'string' && r.commit.length === 40);
  ok('skippedOutOfScope === 1', r.skippedOutOfScope === 1);
  // out-of-scope file should still be dirty (porcelain v1 reports `src/`
  // for untracked dir, so check substring 'src/' rather than full path).
  const st = git(['status', '--porcelain'], dir);
  ok('src/ still dirty', st.includes('src/'));
  ok('lib/a.js committed', !st.includes('lib/'));

  const state = supervisor.readState('c-1', {projectDir: dir});
  ok('phase status complete', state.phases.plan.status === 'complete');
  ok('commit_sha persisted', state.phases.plan.commit_sha === r.commit);
  ok('completed timestamp persisted', typeof state.phases.plan.completed === 'string');
}

section('commit returns noChanges when nothing in-scope is dirty');
{
  const dir = mkRepo('commit-empty');
  fs.mkdirSync(path.join(dir, 'lib'));
  setupRun(dir, 'ce-1', ['lib/']);
  checkpoint.snapshot('ce-1', 'plan', {projectDir: dir});
  fs.writeFileSync(path.join(dir, 'README.md'), '# changed\n');
  const r = checkpoint.commit('ce-1', 'plan', {projectDir: dir});
  ok('noChanges flag set', r.noChanges === true);
  ok('commit is null', r.commit === null);
  ok('skippedOutOfScope counts the dirty out-of-scope file', r.skippedOutOfScope === 1);
}

// ---------- revert ----------

section('revert restores tracked in-scope writes, leaves out-of-scope dirty');
{
  const dir = mkRepo('revert');
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'lib', 'a.js'), 'original');
  git(['add', '.'], dir); git(['commit', '-q', '-m', 'add a'], dir);
  setupRun(dir, 'r-1', ['lib/']);
  checkpoint.snapshot('r-1', 'plan', {projectDir: dir});
  fs.writeFileSync(path.join(dir, 'lib', 'a.js'), 'modified');
  fs.writeFileSync(path.join(dir, 'README.md'), '# also modified\n');
  const r = checkpoint.revert('r-1', 'plan', {projectDir: dir});
  ok('reverted reports at least one path', r.reverted.length >= 1);
  ok('lib/a.js restored', fs.readFileSync(path.join(dir, 'lib', 'a.js'), 'utf8') === 'original');
  const status = git(['status', '--porcelain'], dir);
  ok('README.md still dirty', status.includes('README.md'));
  const st = supervisor.readState('r-1', {projectDir: dir});
  ok('phase marked failed', st.phases.plan.status === 'failed');
}

section('revert removes untracked in-scope files');
{
  const dir = mkRepo('revert-untracked');
  fs.mkdirSync(path.join(dir, 'lib'));
  setupRun(dir, 'ru-1', ['lib/']);
  checkpoint.snapshot('ru-1', 'plan', {projectDir: dir});
  fs.writeFileSync(path.join(dir, 'lib', 'new.js'), 'created by sub-agent');
  checkpoint.revert('ru-1', 'plan', {projectDir: dir});
  ok('untracked new file removed', !fs.existsSync(path.join(dir, 'lib', 'new.js')));
}

// ---------- restart ----------

section('restart with clean tree resets HEAD to snapshot');
{
  const dir = mkRepo('restart');
  fs.mkdirSync(path.join(dir, 'lib'));
  setupRun(dir, 'rs-1', ['lib/']);
  checkpoint.snapshot('rs-1', 'plan', {projectDir: dir});
  const snap = head(dir);
  fs.writeFileSync(path.join(dir, 'lib', 'a.js'), 'export const a=1;');
  checkpoint.commit('rs-1', 'plan', {projectDir: dir});
  ok('HEAD advanced past snapshot', head(dir) !== snap);

  const r = checkpoint.restart('rs-1', 'plan', {projectDir: dir});
  ok('restartedTo is snapshot sha', r.restartedTo === snap);
  ok('HEAD reset to snapshot', head(dir) === snap);
  ok('lib/a.js removed (commit dropped)', !fs.existsSync(path.join(dir, 'lib', 'a.js')));
  const st = supervisor.readState('rs-1', {projectDir: dir});
  ok('phase re-pended', st.phases.plan.status === 'pending');
  ok('restart_history grew', Array.isArray(st.phases.plan.restart_history) && st.phases.plan.restart_history.length === 1);
  ok('snapshot_commit preserved', st.phases.plan.snapshot_commit === snap);
}

section('restart refuses when working tree is dirty');
{
  const dir = mkRepo('restart-dirty');
  fs.mkdirSync(path.join(dir, 'lib'));
  setupRun(dir, 'rd-1', ['lib/']);
  checkpoint.snapshot('rd-1', 'plan', {projectDir: dir});
  fs.writeFileSync(path.join(dir, 'lib', 'a.js'), 'x'); // commit it
  checkpoint.commit('rd-1', 'plan', {projectDir: dir});
  fs.writeFileSync(path.join(dir, 'README.md'), '# dirty\n');
  let threw = false;
  try { checkpoint.restart('rd-1', 'plan', {projectDir: dir}); }
  catch (e) { threw = e.message.includes('dirty'); }
  ok('throws when dirty', threw);
}

section('restart refuses when unexpected commits exist after snapshot');
{
  const dir = mkRepo('restart-unexpected');
  fs.mkdirSync(path.join(dir, 'lib'));
  setupRun(dir, 'ru-2', ['lib/']);
  checkpoint.snapshot('ru-2', 'plan', {projectDir: dir});
  fs.writeFileSync(path.join(dir, 'lib', 'a.js'), 'x');
  checkpoint.commit('ru-2', 'plan', {projectDir: dir});
  // Add an unexpected commit on top.
  fs.writeFileSync(path.join(dir, 'README.md'), '# more\n');
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'unrelated work'], dir);

  let threw = false;
  try { checkpoint.restart('ru-2', 'plan', {projectDir: dir}); }
  catch (e) { threw = e.message.includes('unexpected'); }
  ok('throws on unexpected later commits', threw);

  // --force overrides
  const r = checkpoint.restart('ru-2', 'plan', {projectDir: dir, force: true});
  ok('--force succeeds', r.restartedTo === r.state.phases.plan.snapshot_commit);
}

// ---------- declared output escape ----------

section('declared output escaping project root is rejected');
{
  const dir = mkRepo('escape');
  setupRun(dir, 'esc-1', ['../outside/']);
  let threw = false;
  try { checkpoint.commit('esc-1', 'plan', {projectDir: dir}); }
  catch (e) { threw = e.message.includes('escapes'); }
  ok('throws on escaping path', threw);
}

// ---------- summary ----------

if (failed > 0) {
  console.log(`\n${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`\nAll checkpoint checks passed. (${passed})`);
