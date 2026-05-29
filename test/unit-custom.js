'use strict';

/**
 * Unit tests for lib/custom.js — custom run lifecycle management.
 *
 * Covers: createRun, listRuns, readState, writeState, writePhaseSummary,
 *         pruneAbandoned, runDir (~40 assertions).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');

const custom = require('../lib/custom');

let pass = 0;
let fail = 0;
const failures = [];

function section(title) { console.log('\n=== ' + title + ' ==='); }

function ok(label, cond, detail) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    failures.push(label + (detail ? ': ' + detail : ''));
    console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
  }
}

/** Create an isolated project dir with .planning/quick/ */
function freshProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-quick-'));
  fs.mkdirSync(path.join(dir, '.planning', 'quick'), { recursive: true });
  custom._resetDeprecationWarning();
  return dir;
}

/** Create an isolated project dir with legacy .planning/custom/ only. */
function freshLegacyProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-custom-legacy-'));
  fs.mkdirSync(path.join(dir, '.planning', 'custom'), { recursive: true });
  custom._resetDeprecationWarning();
  return dir;
}

// ---------- 1. createRun slug generation ----------

section('createRun — slug generation');

{
  const dir = freshProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  const slug = custom.createRun('debug', 'Auth Bug!', { projectDir: dir, now });
  ok('with name: starts with YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}/.test(slug), slug);
  ok('with name: matches expected pattern', /^\d{4}-\d{2}-\d{2}-auth-bug$/.test(slug), slug);
}

{
  const dir = freshProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  const slug = custom.createRun('debug', undefined, { projectDir: dir, now });
  ok('without name: matches date-workflow-HHMM pattern',
    /^\d{4}-\d{2}-\d{2}-debug-\d{4}$/.test(slug), slug);
}

{
  const dir = freshProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  const slug = custom.createRun('debug', 'Foo/Bar.baz', { projectDir: dir, now });
  ok('special chars slugified correctly', /foo-bar-baz$/.test(slug), slug);
}

{
  const dir = freshProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  const slug = custom.createRun('debug', 'UPPERCASE NAME', { projectDir: dir, now });
  ok('name lowercased', /uppercase-name$/.test(slug), slug);
}

{
  const dir = freshProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  const slug = custom.createRun('debug', 'foo  bar', { projectDir: dir, now });
  ok('multiple spaces collapsed to single dash', /foo-bar$/.test(slug), slug);
}

{
  const dir = freshProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  const slug = custom.createRun('debug', '  ---trimme---  ', { projectDir: dir, now });
  ok('leading/trailing dashes trimmed', /^\d{4}-\d{2}-\d{2}-trimme$/.test(slug), slug);
}

{
  const dir = freshProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  const longName = 'design a workflow for document work with phases clarify with user what document work is read through source materials for docs fan out phase to prepare for multiple documents';
  const slug = custom.createRun('debug', longName, { projectDir: dir, now });
  const namePart = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  ok('long name slug capped at 60 chars', namePart.length <= 60, `len=${namePart.length} slug=${slug}`);
  ok('capped slug has no trailing dash', !namePart.endsWith('-'), namePart);
  ok('capped slug starts with original name prefix', namePart.startsWith('design-a-workflow-for-document-work'), namePart);
}

// ---------- 2. createRun collision handling ----------

section('createRun — collision handling');

{
  const dir = freshProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  const s1 = custom.createRun('debug', 'my run', { projectDir: dir, now });
  ok('first call has no -2 suffix', !s1.endsWith('-2'), s1);

  const s2 = custom.createRun('debug', 'my run', { projectDir: dir, now });
  ok('second call same name gets -2 suffix', s2.endsWith('-2'), s2);

  const s3 = custom.createRun('debug', 'my run', { projectDir: dir, now });
  ok('third call gets -3 suffix', s3.endsWith('-3'), s3);

  ok('returns slug string (s2 defined)', typeof s2 === 'string');
}

// ---------- 3. createRun STATE.yaml shape ----------

section('createRun — STATE.yaml shape');

{
  const dir = freshProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  const slug = custom.createRun('perf', 'Slow Query', { projectDir: dir, now });
  const stateFile = path.join(dir, '.planning', 'quick', slug, 'STATE.yaml');

  ok('STATE.yaml file exists', fs.existsSync(stateFile), stateFile);

  const parsed = yaml.parse(fs.readFileSync(stateFile, 'utf8'));
  ok('has workflow field', parsed.workflow === 'perf', parsed.workflow);
  ok('has slug field', parsed.slug === slug, parsed.slug);
  ok('status is in-progress', parsed.status === 'in-progress', parsed.status);
  ok('binding is quick', parsed.binding === 'quick', parsed.binding);
  ok('started is ISO string', typeof parsed.started === 'string' && !isNaN(Date.parse(parsed.started)));
  ok('last_activity equals started at creation', parsed.last_activity === parsed.started);
  ok('completed is empty array', Array.isArray(parsed.completed) && parsed.completed.length === 0);
  ok('artifacts is empty object',
    typeof parsed.artifacts === 'object' && !Array.isArray(parsed.artifacts) &&
    Object.keys(parsed.artifacts).length === 0);
  ok('opts.now produces deterministic timestamp',
    parsed.started === now.toISOString(), parsed.started);
  ok('current_phase is null or absent',
    parsed.current_phase === null || parsed.current_phase === undefined);
}

// ---------- 4. readState / writeState ----------

section('readState and writeState');

{
  const dir = freshProject();

  // readState on unknown slug
  let threw = false;
  let threwMsg = '';
  try {
    custom.readState('no-such-run', { projectDir: dir });
  } catch (e) {
    threw = true;
    threwMsg = e.message;
  }
  ok('readState unknown slug throws', threw);
  ok('thrown error contains slug', threwMsg.includes('no-such-run'), threwMsg);

  // readState round-trip
  const now = new Date('2026-05-24T15:30:00.000Z');
  const slug = custom.createRun('debug', 'read test', { projectDir: dir, now });
  const state = custom.readState(slug, { projectDir: dir });
  ok('readState round-trip returns workflow', state.workflow === 'debug');
  ok('readState round-trip returns slug', state.slug === slug);

  // writeState updates status
  const now2 = new Date('2026-05-24T16:00:00.000Z');
  const updated = custom.writeState(slug, { status: 'done' }, { projectDir: dir, now: now2 });
  ok('writeState updates status', updated.status === 'done', updated.status);

  // writeState always updates last_activity to opts.now
  ok('writeState updates last_activity to opts.now',
    updated.last_activity === now2.toISOString(), updated.last_activity);

  // writeState shallow-merges artifacts
  const now3 = new Date('2026-05-24T16:05:00.000Z');
  custom.writeState(slug, { artifacts: { 'phase-a': '01-phase-a.md' } }, { projectDir: dir, now: now3 });
  const now4 = new Date('2026-05-24T16:10:00.000Z');
  const merged = custom.writeState(slug, { artifacts: { 'phase-b': '02-phase-b.md' } }, { projectDir: dir, now: now4 });
  ok('writeState preserves existing artifact entry after merge',
    merged.artifacts['phase-a'] === '01-phase-a.md', JSON.stringify(merged.artifacts));
  ok('writeState adds new artifact entry',
    merged.artifacts['phase-b'] === '02-phase-b.md', JSON.stringify(merged.artifacts));

  // writeState is atomic: YAML is parseable after write
  const raw = fs.readFileSync(path.join(dir, '.planning', 'quick', slug, 'STATE.yaml'), 'utf8');
  let parseable = false;
  try { yaml.parse(raw); parseable = true; } catch (_) {}
  ok('STATE.yaml parseable after writeState', parseable);

  // writeState returns merged object
  ok('writeState returns an object', typeof merged === 'object' && merged !== null);
}

// ---------- 5. writePhaseSummary ----------

section('writePhaseSummary');

{
  const dir = freshProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  const slug = custom.createRun('debug', 'phase test', { projectDir: dir, now });

  const p1 = custom.writePhaseSummary(slug, 'collect-symptoms', '# Symptoms\nFoo', { projectDir: dir, now });
  const fname1 = path.basename(p1);
  ok('first summary is 01-<phaseId>.md', fname1 === '01-collect-symptoms.md', fname1);

  const p2 = custom.writePhaseSummary(slug, 'reproduce', '# Repro\nBar', { projectDir: dir, now });
  const fname2 = path.basename(p2);
  ok('second summary is 02-<phaseId>.md', fname2 === '02-reproduce.md', fname2);

  // phaseId slugification
  const p3 = custom.writePhaseSummary(slug, 'Analyze Root/Cause', '# Analysis', { projectDir: dir, now });
  const fname3 = path.basename(p3);
  ok('phaseId slugified in filename', fname3 === '03-analyze-root-cause.md', fname3);

  // completed array appended without dup
  custom.writePhaseSummary(slug, 'collect-symptoms', '# Redo', { projectDir: dir, now });
  const state = custom.readState(slug, { projectDir: dir });
  const dedupCount = state.completed.filter((c) => c === 'collect-symptoms').length;
  ok('completed array has no dup for re-run phase', dedupCount === 1, String(dedupCount));

  // artifacts map set correctly
  ok('artifacts maps phaseId to filename',
    state.artifacts['collect-symptoms'] !== undefined, JSON.stringify(state.artifacts));

  // content written verbatim
  const content = fs.readFileSync(p1, 'utf8');
  ok('content written verbatim', content === '# Symptoms\nFoo', JSON.stringify(content));
}

// ---------- 6. listRuns ----------

section('listRuns');

{
  // Empty custom dir
  const dir = freshProject();
  const runs = custom.listRuns({ projectDir: dir });
  ok('empty custom dir returns []', Array.isArray(runs) && runs.length === 0);
}

{
  // Missing quick + custom dirs
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-quick-nodir-'));
  // Don't create either .planning/quick or .planning/custom
  let result;
  try { result = custom.listRuns({ projectDir: dir }); } catch (_) { result = null; }
  ok('missing quick + custom dirs returns [] without throwing',
    Array.isArray(result) && result.length === 0);
}

{
  // Shape check
  const dir = freshProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  custom.createRun('debug', 'shape test', { projectDir: dir, now });
  const runs = custom.listRuns({ projectDir: dir });
  const r = runs[0];
  ok('run entry has camelCase lastActivity key', 'lastActivity' in r);
  ok('run entry has camelCase currentPhase key', 'currentPhase' in r);
  ok('run entry has slug, workflow, status, started',
    'slug' in r && 'workflow' in r && 'status' in r && 'started' in r);
}

{
  // Sorted by lastActivity descending
  const dir = freshProject();
  const n1 = new Date('2026-05-24T10:00:00.000Z');
  const n2 = new Date('2026-05-24T12:00:00.000Z');
  const n3 = new Date('2026-05-24T08:00:00.000Z');

  const s1 = custom.createRun('debug', 'run one', { projectDir: dir, now: n1 });
  const s2 = custom.createRun('debug', 'run two', { projectDir: dir, now: n2 });
  const s3 = custom.createRun('debug', 'run three', { projectDir: dir, now: n3 });

  // Push last_activity so they differ properly
  custom.writeState(s1, {}, { projectDir: dir, now: n1 });
  custom.writeState(s2, {}, { projectDir: dir, now: n2 });
  custom.writeState(s3, {}, { projectDir: dir, now: n3 });

  const runs = custom.listRuns({ projectDir: dir });
  ok('listRuns sorted descending: newest first', runs[0].slug === s2, runs.map((r) => r.slug).join(', '));
  ok('listRuns sorted descending: oldest last', runs[runs.length - 1].slug === s3, runs.map((r) => r.slug).join(', '));
}

{
  // Skips unparseable STATE.yaml
  const dir = freshProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  const s1 = custom.createRun('debug', 'good run', { projectDir: dir, now });
  // Create a directory with garbage STATE.yaml
  const badDir = path.join(dir, '.planning', 'quick', 'bad-run');
  fs.mkdirSync(badDir, { recursive: true });
  fs.writeFileSync(path.join(badDir, 'STATE.yaml'), '{ this is: [not valid yaml: {{{{');
  const runs = custom.listRuns({ projectDir: dir });
  ok('listRuns skips unparseable STATE.yaml and returns others',
    runs.length === 1 && runs[0].slug === s1, runs.map((r) => r.slug).join(','));
}

// ---------- 7. pruneAbandoned ----------

section('pruneAbandoned');

{
  // Default is dry-run
  const dir = freshProject();
  const old = new Date('2020-01-01T00:00:00.000Z');
  const slug = custom.createRun('debug', 'old run', { projectDir: dir, now: old });
  custom.writeState(slug, { status: 'abandoned' }, { projectDir: dir, now: old });

  const result = custom.pruneAbandoned(30, { projectDir: dir });
  ok('default prune is dry-run', result.dryRun === true);
  ok('dry-run removed is []', result.removed.length === 0);
}

{
  // Lists abandoned runs older than daysOld
  const dir = freshProject();
  const old = new Date('2020-01-01T00:00:00.000Z');
  const slug = custom.createRun('debug', 'old abandoned', { projectDir: dir, now: old });
  custom.writeState(slug, { status: 'abandoned' }, { projectDir: dir, now: old });

  const now = new Date();
  const result = custom.pruneAbandoned(30, { projectDir: dir, now });
  ok('old abandoned run is a candidate', result.candidates.includes(slug), JSON.stringify(result.candidates));
}

{
  // Does NOT list in-progress or done runs
  const dir = freshProject();
  const old = new Date('2020-01-01T00:00:00.000Z');
  const s1 = custom.createRun('debug', 'active', { projectDir: dir, now: old });
  const s2 = custom.createRun('debug', 'finished', { projectDir: dir, now: old });
  custom.writeState(s2, { status: 'done' }, { projectDir: dir, now: old });

  const now = new Date();
  const result = custom.pruneAbandoned(30, { projectDir: dir, now });
  ok('in-progress run not a candidate', !result.candidates.includes(s1));
  ok('done run not a candidate', !result.candidates.includes(s2));
}

{
  // apply: true actually removes
  const dir = freshProject();
  const old = new Date('2020-01-01T00:00:00.000Z');
  const slug = custom.createRun('debug', 'remove me', { projectDir: dir, now: old });
  custom.writeState(slug, { status: 'abandoned' }, { projectDir: dir, now: old });

  const now = new Date();
  const result = custom.pruneAbandoned(30, { projectDir: dir, now, apply: true });
  ok('apply:true sets dryRun:false', result.dryRun === false);
  ok('apply:true populates removed', result.removed.includes(slug), JSON.stringify(result.removed));
  ok('apply:true actually deletes dir',
    !fs.existsSync(path.join(dir, '.planning', 'quick', slug)));
}

{
  // daysOld filter: recent abandoned not pruned
  const dir = freshProject();
  const recent = new Date(Date.now() - 1 * 86400000); // 1 day ago
  const slug = custom.createRun('debug', 'recent abandoned', { projectDir: dir, now: recent });
  custom.writeState(slug, { status: 'abandoned' }, { projectDir: dir, now: recent });

  const now = new Date();
  const result = custom.pruneAbandoned(30, { projectDir: dir, now });
  ok('1-day-old abandoned not pruned with daysOld:30', !result.candidates.includes(slug), JSON.stringify(result.candidates));
}

// ---------- 8. runDir ----------

section('runDir');

{
  const dir = freshProject();
  const p = custom.runDir('my-slug', { projectDir: dir });
  ok('runDir returns path ending in slug', p.endsWith('my-slug'), p);
  ok('runDir is absolute', path.isAbsolute(p), p);
}

{
  const dir = freshProject();
  const nonExistentSlug = 'does-not-exist-' + Date.now();
  custom.runDir(nonExistentSlug, { projectDir: dir });
  ok('runDir is pure: does not create dir',
    !fs.existsSync(path.join(dir, '.planning', 'quick', nonExistentSlug)));
}

// ---------- 9. Legacy .planning/custom/ back-compat ----------

section('legacy .planning/custom/ back-compat (51-03)');

{
  // listRuns aggregates legacy custom entries.
  const dir = freshLegacyProject();
  const now = new Date('2026-05-24T15:30:00.000Z');
  // Write a state file directly into legacy custom/<slug>/.
  const slug = '2026-05-24-legacy-bug';
  const legacyDir = path.join(dir, '.planning', 'custom', slug);
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(path.join(legacyDir, 'STATE.yaml'), yaml.stringify({
    workflow: 'debug', slug, status: 'in-progress', binding: 'custom',
    started: now.toISOString(), last_activity: now.toISOString(),
    current_phase: null, completed: [], artifacts: {},
  }));

  const runs = custom.listRuns({ projectDir: dir });
  ok('listRuns surfaces legacy custom run',
    runs.length === 1 && runs[0].slug === slug, JSON.stringify(runs));
}

{
  // readState transparently reads from legacy custom/.
  const dir = freshLegacyProject();
  const slug = '2026-05-24-legacy-read';
  const legacyDir = path.join(dir, '.planning', 'custom', slug);
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(path.join(legacyDir, 'STATE.yaml'), yaml.stringify({
    workflow: 'debug', slug, status: 'in-progress', binding: 'custom',
    started: '2026-05-24T15:30:00.000Z', last_activity: '2026-05-24T15:30:00.000Z',
    current_phase: null, completed: [], artifacts: {},
  }));

  const state = custom.readState(slug, { projectDir: dir });
  ok('readState returns legacy custom run',
    state.slug === slug && state.workflow === 'debug', JSON.stringify(state));
}

{
  // writeState on a legacy slug keeps it in legacy custom/ (does not migrate).
  const dir = freshLegacyProject();
  const slug = '2026-05-24-legacy-write';
  const legacyDir = path.join(dir, '.planning', 'custom', slug);
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(path.join(legacyDir, 'STATE.yaml'), yaml.stringify({
    workflow: 'debug', slug, status: 'in-progress', binding: 'custom',
    started: '2026-05-24T15:30:00.000Z', last_activity: '2026-05-24T15:30:00.000Z',
    completed: [], artifacts: {},
  }));

  custom.writeState(slug, { status: 'done' }, {
    projectDir: dir, now: new Date('2026-05-25T10:00:00.000Z'),
  });

  ok('legacy run updated in place (custom/) not migrated to quick/',
    fs.existsSync(path.join(legacyDir, 'STATE.yaml')) &&
    !fs.existsSync(path.join(dir, '.planning', 'quick', slug)));
  const updated = yaml.parse(fs.readFileSync(path.join(legacyDir, 'STATE.yaml'), 'utf8'));
  ok('legacy run STATE persists the patch', updated.status === 'done');
}

{
  // createRun ALWAYS writes to quick/, never to legacy custom/.
  const dir = freshLegacyProject();
  fs.mkdirSync(path.join(dir, '.planning', 'quick'), { recursive: true });
  const slug = custom.createRun('debug', 'new run', {
    projectDir: dir, now: new Date('2026-05-25T10:00:00.000Z'),
  });
  ok('createRun writes to quick/',
    fs.existsSync(path.join(dir, '.planning', 'quick', slug, 'STATE.yaml')));
  ok('createRun does NOT write to legacy custom/',
    !fs.existsSync(path.join(dir, '.planning', 'custom', slug)));
}

{
  // listRuns aggregates BOTH roots, quick wins on slug collision.
  const dir = freshProject();
  fs.mkdirSync(path.join(dir, '.planning', 'custom'), { recursive: true });
  // Create a legacy entry.
  const legacySlug = '2026-05-24-only-legacy';
  fs.mkdirSync(path.join(dir, '.planning', 'custom', legacySlug), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'custom', legacySlug, 'STATE.yaml'),
    yaml.stringify({ workflow: 'debug', slug: legacySlug, status: 'in-progress',
      started: '2026-05-24T15:30:00.000Z', last_activity: '2026-05-24T15:30:00.000Z' }));
  // Create a quick entry.
  const newSlug = custom.createRun('debug', 'fresh', {
    projectDir: dir, now: new Date('2026-05-25T10:00:00.000Z'),
  });

  const runs = custom.listRuns({ projectDir: dir });
  const slugs = runs.map((r) => r.slug).sort();
  ok('listRuns aggregates both roots (legacy + quick)',
    slugs.includes(legacySlug) && slugs.includes(newSlug),
    JSON.stringify(slugs));
}

// ---------- Results ----------

console.log('\n----------------------------------------');
console.log('Passed: ' + pass + '   Failed: ' + fail);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
