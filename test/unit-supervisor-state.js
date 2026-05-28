'use strict';

/**
 * Tests for lib/supervisor.js — v1.4 supervised-run state helpers.
 *
 * Covers:
 *   - initRun creates the directory + canonical state.json
 *   - readState / writeState round-trip with `updated` bump
 *   - setPath auto-vivifies intermediate objects
 *   - appendPath creates and grows arrays at a dot-path
 *   - getPath returns undefined for missing segments
 *   - prototype-polluting keys are rejected
 *   - traversal into arrays is rejected
 *   - slug validation rejects path-traversal and bad characters
 *   - isOutputAllowed enforces declared output prefixes lexically
 *   - isOutputAllowed rejects paths that escape the project root
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const supervisor = require('../lib/supervisor');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function tmpdir(suffix = '') {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cp-supervisor-${suffix}-`));
}

// ---------- initRun ----------

section('initRun creates state.json with canonical fields');
{
  const dir = tmpdir('init');
  const s = supervisor.initRun('test-run-1', {workflow: 'milestone', milestone: 'v1.5'}, {projectDir: dir});
  const p = path.join(dir, '.planning', 'runs', 'test-run-1', 'state.json');
  ok('state.json exists', fs.existsSync(p));
  ok('run_id set', s.run_id === 'test-run-1');
  ok('workflow set', s.workflow === 'milestone');
  ok('supervised default true', s.supervised === true);
  ok('phases default empty object', s.phases && typeof s.phases === 'object' && Object.keys(s.phases).length === 0);
  ok('status default pending', s.status === 'pending');
}

section('initRun refuses to overwrite existing state.json');
{
  const dir = tmpdir('reinit');
  supervisor.initRun('test-run-2', {workflow: 'x'}, {projectDir: dir});
  let threw = false;
  try { supervisor.initRun('test-run-2', {workflow: 'y'}, {projectDir: dir}); }
  catch (_) { threw = true; }
  ok('second init throws', threw);
}

// ---------- read/write round trip ----------

section('readState / writeState round-trip');
{
  const dir = tmpdir('rw');
  supervisor.initRun('rw-1', {workflow: 'milestone'}, {projectDir: dir});
  const updated = supervisor.writeState('rw-1', {status: 'running', current_phase: 'plan'}, {projectDir: dir});
  ok('status patched', updated.status === 'running');
  ok('current_phase patched', updated.current_phase === 'plan');
  const fresh = supervisor.readState('rw-1', {projectDir: dir});
  ok('persisted to disk', fresh.status === 'running' && fresh.current_phase === 'plan');
  ok('run_id preserved on writeState', fresh.run_id === 'rw-1');
  ok('updated bumped', typeof fresh.updated === 'string' && fresh.updated.length > 0);
}

section('readState throws for missing run');
{
  const dir = tmpdir('miss');
  let threw = false;
  try { supervisor.readState('nope', {projectDir: dir}); }
  catch (_) { threw = true; }
  ok('throws on missing slug', threw);
}

// ---------- setPath / getPath ----------

section('setPath auto-vivifies intermediate objects');
{
  const dir = tmpdir('setpath');
  supervisor.initRun('sp-1', {workflow: 'milestone'}, {projectDir: dir});
  supervisor.setPath('sp-1', 'phases.plan.status', 'running', {projectDir: dir});
  const v = supervisor.getPath('sp-1', 'phases.plan.status', {projectDir: dir});
  ok('value round-trips', v === 'running');
  const full = supervisor.readState('sp-1', {projectDir: dir});
  ok('intermediate object created', full.phases && full.phases.plan && full.phases.plan.status === 'running');
}

section('getPath returns undefined for missing segments');
{
  const dir = tmpdir('getmiss');
  supervisor.initRun('gp-1', {workflow: 'milestone'}, {projectDir: dir});
  ok('missing top-level → undefined', supervisor.getPath('gp-1', 'nope', {projectDir: dir}) === undefined);
  ok('missing nested → undefined', supervisor.getPath('gp-1', 'a.b.c', {projectDir: dir}) === undefined);
}

// ---------- appendPath ----------

section('appendPath creates and grows arrays');
{
  const dir = tmpdir('append');
  supervisor.initRun('ap-1', {workflow: 'milestone'}, {projectDir: dir});
  supervisor.appendPath('ap-1', 'phases.plan.classifier_history', {ts: 't1', class: 'in-flow'}, {projectDir: dir});
  supervisor.appendPath('ap-1', 'phases.plan.classifier_history', {ts: 't2', class: 'side'}, {projectDir: dir});
  const arr = supervisor.getPath('ap-1', 'phases.plan.classifier_history', {projectDir: dir});
  ok('array length 2', Array.isArray(arr) && arr.length === 2);
  ok('first entry preserved', arr[0].ts === 't1' && arr[0].class === 'in-flow');
  ok('second entry preserved', arr[1].ts === 't2' && arr[1].class === 'side');
}

section('appendPath refuses to append to non-array');
{
  const dir = tmpdir('append-bad');
  supervisor.initRun('apb-1', {workflow: 'milestone'}, {projectDir: dir});
  supervisor.setPath('apb-1', 'phases.plan.status', 'running', {projectDir: dir});
  let threw = false;
  try { supervisor.appendPath('apb-1', 'phases.plan.status', 'x', {projectDir: dir}); }
  catch (_) { threw = true; }
  ok('throws on non-array target', threw);
}

// ---------- security: prototype pollution ----------

section('prototype-polluting keys are rejected');
{
  const dir = tmpdir('proto');
  supervisor.initRun('pp-1', {workflow: 'milestone'}, {projectDir: dir});
  for (const bad of ['__proto__', 'constructor', 'prototype']) {
    let threw = false;
    try { supervisor.setPath('pp-1', bad + '.polluted', true, {projectDir: dir}); }
    catch (_) { threw = true; }
    ok('rejects ' + bad + ' (top)', threw);

    let threw2 = false;
    try { supervisor.setPath('pp-1', 'phases.' + bad, true, {projectDir: dir}); }
    catch (_) { threw2 = true; }
    ok('rejects ' + bad + ' (nested)', threw2);
  }
  ok('Object.prototype not polluted', ({}).polluted === undefined);
}

// ---------- security: traversal through arrays ----------

section('traversal through arrays is rejected');
{
  const dir = tmpdir('arr');
  supervisor.initRun('ar-1', {workflow: 'milestone'}, {projectDir: dir});
  supervisor.setPath('ar-1', 'phases.plan.history', [], {projectDir: dir});
  let threw = false;
  try { supervisor.setPath('ar-1', 'phases.plan.history.0', 'x', {projectDir: dir}); }
  catch (_) { threw = true; }
  ok('throws when intermediate is array', threw);
}

// ---------- security: slug validation ----------

section('slug validation rejects path traversal and bad characters');
{
  const dir = tmpdir('slug');
  for (const bad of ['', '../escape', 'a/b', 'a\\b', 'has space', 'foo$bar']) {
    let threw = false;
    try { supervisor.initRun(bad, {workflow: 'x'}, {projectDir: dir}); }
    catch (_) { threw = true; }
    ok('rejects slug ' + JSON.stringify(bad), threw);
  }
  // Valid characters should pass
  let okSlug = false;
  try { supervisor.initRun('valid_slug-1.0', {workflow: 'x'}, {projectDir: dir}); okSlug = true; }
  catch (_) {}
  ok('accepts [a-z0-9._-]+', okSlug);
}

// ---------- isOutputAllowed ----------

section('isOutputAllowed enforces declared output prefixes');
{
  const root = tmpdir('outputs');
  const declared = ['lib/foo.js', 'test/foo/', '.planning/runs/'];
  ok('exact file match', supervisor.isOutputAllowed(declared, 'lib/foo.js', root) === true);
  ok('within declared dir', supervisor.isOutputAllowed(declared, 'test/foo/bar.js', root) === true);
  ok('within nested declared dir', supervisor.isOutputAllowed(declared, '.planning/runs/abc/state.json', root) === true);
  ok('sibling file rejected', supervisor.isOutputAllowed(declared, 'lib/foo2.js', root) === false);
  ok('parent of declared rejected', supervisor.isOutputAllowed(declared, 'lib/', root) === false);
  ok('unrelated path rejected', supervisor.isOutputAllowed(declared, 'src/bar.js', root) === false);
  ok('empty declared list rejected', supervisor.isOutputAllowed([], 'lib/foo.js', root) === false);
}

section('isOutputAllowed rejects paths that escape project root');
{
  const root = tmpdir('escape');
  const declared = ['lib/'];
  ok('rejects ../', supervisor.isOutputAllowed(declared, '../outside.js', root) === false);
  ok('rejects deep escape', supervisor.isOutputAllowed(declared, 'lib/../../outside.js', root) === false);
}

// ---------- summary ----------

if (failed > 0) {
  console.log(`\n${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`\nAll supervisor-state checks passed. (${passed})`);
