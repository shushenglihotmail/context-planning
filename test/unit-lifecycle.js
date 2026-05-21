'use strict';

/**
 * Tests for lib/lifecycle.js — the v0.2 high-level CLI wrappers.
 *
 * Verifies that:
 *   - tickPlan updates BOTH ROADMAP and phase PLAN.md
 *   - tickPlan is idempotent
 *   - tickPlan --undo un-ticks
 *   - writeSummary writes the correct filename (no slug)
 *   - writeSummary normalises snake_case -> kebab-case aliases
 *   - writeSummary refuses to overwrite without overwrite:true
 *   - writeSummary fills phase/plan/completed defaults
 *   - parsePlanId validates and normalises leading zeros
 *   - statusReport finds the in-progress milestone and next pending plan
 *   - completeMilestone fails with structured reason if incomplete
 *   - completeMilestone produces correct actions list
 *   - completeMilestone dry-run doesn't touch disk
 *   - completeMilestone real run writes, collapses, clears, commits
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const lifecycle = require('../lib/lifecycle');
const fm = require('../lib/frontmatter');
const roadmap = require('../lib/roadmap');
const milestone = require('../lib/milestone');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(title) { console.log(`\n=== ${title} ===`); }

// ---------- fixture: build a complete demo project in a temp dir ----------

function freshProject(suffix = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-lifecycle-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), `---
project: demo
---
# demo

## Phases

### 🚧 v0.1 Hi (In Progress)

Goal: test.

### Phase 1: Greet

- [ ] 01-01: hello
- [ ] 01-02: bye

`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'), `---
phase: 1
name: Greet
plans: [01-01, 01-02]
---
# Phase 1

## Plans
- [ ] 01-01: hello
- [ ] 01-02: bye
`);
  // Minimal STATE.md (only the sections updatePosition touches).
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'), `# State

## Current Position

Phase: 1 of 1
Plan: 1 of 2
Status: in-progress
Last activity: 2026-01-01 — start

Progress: [██░░░░░░░░] 20%

## Session Continuity

Last session: 2026-01-01
Stopped at: start
Resume file: None
`);
  fs.writeFileSync(path.join(dir, '.planning', 'MILESTONE-CONTEXT.md'), '# v0.1 Hi context\n');
  execSync('git add -A && git commit -q -m scaffold', { cwd: dir });
  return dir;
}

// ---------- parsePlanId ----------

section('parsePlanId');
ok('parses "01-02"', JSON.stringify(lifecycle.parsePlanId('01-02')) === JSON.stringify({ phaseNum: '1', planSeq: '02', id: '01-02' }));
ok('parses "10-03"', lifecycle.parsePlanId('10-03').phaseNum === '10');
ok('parses decimal "2.1-04"', lifecycle.parsePlanId('2.1-04').phaseNum === '2.1');
let threw = false;
try { lifecycle.parsePlanId('garbage'); } catch { threw = true; }
ok('throws on garbage', threw);

// ---------- tickPlan ----------

section('tickPlan');
{
  const root = freshProject('tick');
  const r1 = lifecycle.tickPlan(root, '01-01');
  ok('returns 2 actions (ROADMAP + phase PLAN)', r1.actions.length === 2);
  ok('ROADMAP changed', r1.roadmapChanged);
  ok('phase PLAN changed', r1.planChanged);
  const roadmapContent = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP has [x] for 01-01', /-\s+\[x\]\s+01-01:/.test(roadmapContent));

  const r2 = lifecycle.tickPlan(root, '01-01');
  ok('idempotent (no actions on repeat)', r2.actions.length === 0);

  const r3 = lifecycle.tickPlan(root, '01-01', { undo: false, done: false });
  ok('--undo (done:false) reverts', r3.actions.length === 2);
  const after = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP has [ ] after un-tick', /-\s+\[ \]\s+01-01:/.test(after));

  let err = null;
  try { lifecycle.tickPlan(root, '99-99'); } catch (e) { err = e; }
  ok('errors on unknown phase', err && /not found/i.test(err.message));

  const dry = lifecycle.tickPlan(root, '01-02', { dryRun: true });
  ok('dry-run returns actions without writing', dry.actions.length === 2);
  const stillClean = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('dry-run did not write ROADMAP', !/-\s+\[x\]\s+01-02:/.test(stillClean));
}

// ---------- writeSummary ----------

section('writeSummary');
{
  const root = freshProject('summary');
  // v0.8 P3: create the files this test references so existence check passes.
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), '// stub\n');
  fs.writeFileSync(path.join(root, 'src', 'b.js'), '// stub\n');

  // Write with kebab-case keys.
  const r1 = lifecycle.writeSummary(root, '01-01', {
    subsystem: 'greet',
    tags: ['cli'],
    'requirements-completed': ['say hello'],
    'key-files': { created: ['src/a.js'], modified: [] },
    duration: '2min',
  });
  ok('writes 01-01-SUMMARY.md (no slug)', /01-01-SUMMARY\.md$/.test(r1.path));
  const s1 = fm.parse(fs.readFileSync(r1.path, 'utf8'));
  ok('preserves subsystem (singular)', s1.frontmatter.subsystem === 'greet');
  ok('preserves key-files.created', s1.frontmatter['key-files'].created[0] === 'src/a.js');
  ok('backfills phase=1', s1.frontmatter.phase === 1);
  ok('backfills plan="01-01"', s1.frontmatter.plan === '01-01');
  ok('backfills completed (today)', typeof s1.frontmatter.completed === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s1.frontmatter.completed));

  // Write with snake_case keys → should normalise.
  const r2 = lifecycle.writeSummary(root, '01-02', {
    subsystems: ['greet'],            // singular alias
    tags: ['cli'],
    files_created: ['src/b.js'],      // -> key-files.created
    files_modified: ['src/a.js'],     // -> key-files.modified
    requirements_completed: ['say bye'],
    key_decisions: ['use console.log'],
    patterns_established: ['one file per cmd'],
    tech_stack: { added: ['node'] },
    duration: '1min',
  });
  const s2 = fm.parse(fs.readFileSync(r2.path, 'utf8'));
  ok('subsystems:[greet] -> subsystem:"greet"', s2.frontmatter.subsystem === 'greet');
  ok('files_created -> key-files.created', s2.frontmatter['key-files'].created[0] === 'src/b.js');
  ok('files_modified -> key-files.modified', s2.frontmatter['key-files'].modified[0] === 'src/a.js');
  ok('requirements_completed -> kebab', s2.frontmatter['requirements-completed'][0] === 'say bye');
  ok('key_decisions -> kebab', Array.isArray(s2.frontmatter['key-decisions']));
  ok('patterns_established -> kebab', Array.isArray(s2.frontmatter['patterns-established']));
  ok('tech_stack -> kebab', s2.frontmatter['tech-stack'].added[0] === 'node');

  // Refuses overwrite by default.
  let err = null;
  try { lifecycle.writeSummary(root, '01-01', { subsystem: 'x' }); } catch (e) { err = e; }
  ok('refuses overwrite without flag', err && /already exists/.test(err.message));

  // Overwrite works.
  const r3 = lifecycle.writeSummary(root, '01-01', { subsystem: 'updated' }, { overwrite: true });
  const s3 = fm.parse(fs.readFileSync(r3.path, 'utf8'));
  ok('overwrite:true rewrites', s3.frontmatter.subsystem === 'updated');

  // Dry-run.
  const root2 = freshProject('summary-dry');
  const dry = lifecycle.writeSummary(root2, '01-01', { subsystem: 'x' }, { dryRun: true });
  ok('dry-run returns path without writing', dry.action === 'dryrun' && !fs.existsSync(dry.path));

  // Body override.
  const r4 = lifecycle.writeSummary(root2, '01-01', { subsystem: 'y' }, { body: '# Custom body\n' });
  const s4Raw = fs.readFileSync(r4.path, 'utf8');
  ok('custom body honoured', /# Custom body/.test(s4Raw));
}

section('writeSummary stamps end-commit on SUMMARY.md (v0.8 P1)');
{
  const root = freshProject('summary-end-commit');
  const r = lifecycle.writeSummary(root, '01-01', {
    subsystem: 'foo',
    'key-decisions': ['decided x'],
  });
  const parsed = fm.parse(fs.readFileSync(r.path, 'utf8')).frontmatter;
  ok('end-commit field present', typeof parsed['end-commit'] === 'string',
    `frontmatter: ${JSON.stringify(parsed).slice(0, 200)}`);
  ok('end-commit is a 40-char hex SHA',
    typeof parsed['end-commit'] === 'string' && /^[0-9a-f]{40}$/i.test(parsed['end-commit']));
  const head = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  ok('end-commit matches `git rev-parse HEAD`', parsed['end-commit'] === head);

  // Caller-supplied end-commit is respected (not overwritten).
  const r2 = lifecycle.writeSummary(root, '01-02', {
    subsystem: 'foo',
    'end-commit': 'feedfeedfeedfeedfeedfeedfeedfeedfeedfeed',
  });
  const parsed2 = fm.parse(fs.readFileSync(r2.path, 'utf8')).frontmatter;
  ok('caller-supplied end-commit is preserved',
    parsed2['end-commit'] === 'feedfeedfeedfeedfeedfeedfeedfeedfeedfeed');
}

section('writeSummary omits end-commit cleanly in a non-git directory');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ws-no-git-'));
  fs.mkdirSync(path.join(root, '.planning', 'phases', '01-only'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'phases', '01-only', 'PLAN.md'),
    '---\nphase: "1"\nname: Only\n---\n# Phase 1\n');
  const r = lifecycle.writeSummary(root, '01-01', { subsystem: 'x' });
  const parsed = fm.parse(fs.readFileSync(r.path, 'utf8')).frontmatter;
  ok('end-commit field absent in non-git dir', !('end-commit' in parsed));
  // Existing v0.7 SUMMARY without end-commit parses cleanly via fm.parse.
  ok('SUMMARY still parses (forward-compat)', parsed.phase === 1 && parsed.plan === '01-01');
}

// ---------- v0.8 P2: auto key-files at write-time ----------

/**
 * Build a fixture where PLAN.md carries a base-commit and the working
 * tree has new commits modifying both source files and .planning/ files.
 * Returns the project root.
 */
function projectWithBaseCommit(suffix) {
  const root = freshProject(`autofill-${suffix}`);
  // Seed a tracked README.md so we can test the modify path below.
  fs.writeFileSync(path.join(root, 'README.md'), '# initial\n');
  execSync('git add -A && git commit -q -m "seed readme"', { cwd: root });
  const baseSha = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  // Stamp base-commit into PLAN.md.
  const planPath = path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md');
  const orig = fs.readFileSync(planPath, 'utf8');
  fs.writeFileSync(
    planPath,
    orig.replace(/^---\n/, `---\nbase-commit: ${baseSha}\n`)
  );
  execSync('git add -A && git commit -q -m "stamp base"', { cwd: root });
  // Now produce real source-file changes between baseSha and HEAD.
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib', 'new.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# touched\n');
  fs.appendFileSync(path.join(root, '.planning', 'STATE.md'), '\n# touched\n');
  execSync('git add -A && git commit -q -m "phase work"', { cwd: root });
  return { root, baseSha };
}

function captureStderr(fn) {
  const origWrite = process.stderr.write.bind(process.stderr);
  const captured = [];
  process.stderr.write = (chunk, ...rest) => {
    captured.push(String(chunk));
    return true;
  };
  try { fn(); } finally { process.stderr.write = origWrite; }
  return captured.join('');
}

section('writeSummary auto-fills key-files from git diff (v0.8 P2)');
{
  const { root } = projectWithBaseCommit('happy');
  let result;
  const stderr = captureStderr(() => {
    result = lifecycle.writeSummary(root, '01-01', {
      subsystem: 'greet',
      'key-decisions': ['decided x'],
    });
  });
  const parsed = fm.parse(fs.readFileSync(result.path, 'utf8')).frontmatter;
  const kf = parsed['key-files'] || {};
  ok('key-files.created includes lib/new.js',
    Array.isArray(kf.created) && kf.created.includes('lib/new.js'),
    `created=${JSON.stringify(kf.created)}`);
  ok('key-files.modified includes README.md',
    Array.isArray(kf.modified) && kf.modified.includes('README.md'),
    `modified=${JSON.stringify(kf.modified)}`);
  ok('.planning/ files filtered out',
    !(kf.created || []).some((p) => p.startsWith('.planning/')) &&
    !(kf.modified || []).some((p) => p.startsWith('.planning/')),
    `kf=${JSON.stringify(kf)}`);
  ok('stderr notice emitted',
    /cp: key-files auto-filled \(\d+ files/.test(stderr),
    `stderr=${JSON.stringify(stderr)}`);
  ok('writeSummary result includes autoFill summary',
    result.autoFill && typeof result.autoFill.added === 'number' && result.autoFill.added > 0);
}

section('writeSummary auto-fill unions with caller-supplied key-files');
{
  const { root } = projectWithBaseCommit('union');
  // v0.8 P3 would block lib/caller.js + docs/preset.md (caller phantoms);
  // this test cares about union semantics, not existence — opt out.
  const result = lifecycle.writeSummary(root, '01-01', {
    subsystem: 'greet',
    'key-decisions': ['x'],
    'key-files': {
      created: ['lib/caller.js', 'lib/new.js'], // overlap with diff
      modified: ['docs/preset.md'],
    },
  }, { checkFileExistence: false });
  const kf = fm.parse(fs.readFileSync(result.path, 'utf8')).frontmatter['key-files'];
  // Caller arrays preserved; diff entries appended without duplicates.
  ok('caller created entries preserved', kf.created.includes('lib/caller.js'));
  ok('lib/new.js de-duped (single occurrence)',
    kf.created.filter((p) => p === 'lib/new.js').length === 1);
  ok('caller modified preserved', kf.modified.includes('docs/preset.md'));
  ok('diff modified merged in', kf.modified.includes('README.md'));
}

section('writeSummary { autoKeyFiles: false } opts out (v0.8 P2)');
{
  const { root } = projectWithBaseCommit('opt-out');
  let stderr;
  const result = (() => {
    let r;
    stderr = captureStderr(() => {
      r = lifecycle.writeSummary(root, '01-01', {
        subsystem: 'greet',
        'key-decisions': ['x'],
      }, { autoKeyFiles: false });
    });
    return r;
  })();
  const parsed = fm.parse(fs.readFileSync(result.path, 'utf8')).frontmatter;
  ok('no key-files written when caller did not supply any',
    !parsed['key-files'] || (
      (!parsed['key-files'].created || parsed['key-files'].created.length === 0) &&
      (!parsed['key-files'].modified || parsed['key-files'].modified.length === 0)
    ),
    `kf=${JSON.stringify(parsed['key-files'])}`);
  ok('no auto-fill stderr notice on opt-out',
    !/auto-filled/.test(stderr), `stderr=${JSON.stringify(stderr)}`);
  ok('result.autoFill.added === 0', result.autoFill && result.autoFill.added === 0);
}

section('writeSummary silently skips auto-fill when PLAN.md has no base-commit');
{
  // freshProject's PLAN.md has no base-commit by default.
  const root = freshProject('autofill-no-base');
  let stderr;
  const r = (() => {
    let res;
    stderr = captureStderr(() => {
      res = lifecycle.writeSummary(root, '01-01', {
        subsystem: 'greet',
        'key-decisions': ['x'],
      });
    });
    return res;
  })();
  ok('no stderr notice when base-commit absent',
    !/auto-filled/.test(stderr), `stderr=${JSON.stringify(stderr)}`);
  ok('result.autoFill.added === 0', r.autoFill && r.autoFill.added === 0);
}

// ---------- v0.8 P3 (Phase 19): file-existence hard-block ----------

section('writeSummary blocks phantom path in key-files.created (v0.8 P3)');
{
  const root = freshProject('p3-phantom-created');
  let err = null;
  try {
    lifecycle.writeSummary(root, '01-01', {
      subsystem: 'x',
      'key-decisions': ['x'],
      'key-files': { created: ['lib/phantom.js'], modified: [] },
    });
  } catch (e) { err = e; }
  ok('throws ValidationError', err && err.name === 'ValidationError',
    `err=${err && err.message}`);
  ok('error message mentions missing on disk',
    err && /missing on disk/.test(err.message));
  ok('error message names lib/phantom.js',
    err && /lib\/phantom\.js \(created\)/.test(err.message),
    `msg=${err && err.message}`);
  ok('error message suggests --no-file-check',
    err && /--no-file-check/.test(err.message));
}

section('writeSummary blocks phantom path in key-files.modified (v0.8 P3)');
{
  const root = freshProject('p3-phantom-modified');
  let err = null;
  try {
    lifecycle.writeSummary(root, '01-01', {
      subsystem: 'x',
      'key-decisions': ['x'],
      'key-files': { created: [], modified: ['docs/missing.md'] },
    });
  } catch (e) { err = e; }
  ok('throws ValidationError on modified phantom', err && err.name === 'ValidationError');
  ok('names docs/missing.md (modified)',
    err && /docs\/missing\.md \(modified\)/.test(err.message));
}

section('writeSummary error message lists ALL missing paths (v0.8 P3)');
{
  const root = freshProject('p3-multi');
  let err = null;
  try {
    lifecycle.writeSummary(root, '01-01', {
      subsystem: 'x',
      'key-decisions': ['x'],
      'key-files': {
        created: ['lib/a.js', 'lib/b.js'],
        modified: ['c.md'],
      },
    });
  } catch (e) { err = e; }
  ok('all three phantoms named', err &&
    /lib\/a\.js/.test(err.message) &&
    /lib\/b\.js/.test(err.message) &&
    /c\.md/.test(err.message),
    `msg=${err && err.message}`);
}

section('writeSummary { checkFileExistence: false } opts out (v0.8 P3)');
{
  const root = freshProject('p3-opt-out');
  const r = lifecycle.writeSummary(root, '01-01', {
    subsystem: 'x',
    'key-decisions': ['x'],
    'key-files': { created: ['lib/phantom.js'], modified: [] },
  }, { checkFileExistence: false });
  const parsed = fm.parse(fs.readFileSync(r.path, 'utf8')).frontmatter;
  ok('summary written despite phantom path', r.action === 'written');
  ok('phantom path preserved in frontmatter',
    parsed['key-files'] && parsed['key-files'].created.includes('lib/phantom.js'));
}

section('writeSummary passes when all key-files exist (v0.8 P3)');
{
  const root = freshProject('p3-happy');
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib', 'real.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# r\n');
  let err = null;
  let r;
  try {
    r = lifecycle.writeSummary(root, '01-01', {
      subsystem: 'x',
      'key-decisions': ['x'],
      'key-files': { created: ['lib/real.js'], modified: ['README.md'] },
    });
  } catch (e) { err = e; }
  ok('no error when paths exist', !err, err && err.message);
  ok('summary written', r && r.action === 'written');
}

section('writeSummary auto-fill entries never trigger P3 block');
{
  const { root } = projectWithBaseCommit('p3-autofill');
  // No caller-supplied key-files; auto-fill should pick up real diff entries.
  let err = null;
  let r;
  try {
    r = lifecycle.writeSummary(root, '01-01', {
      subsystem: 'x',
      'key-decisions': ['x'],
    });
  } catch (e) { err = e; }
  ok('no error — auto-fill entries are diff-derived', !err, err && err.message);
  const parsed = fm.parse(fs.readFileSync(r.path, 'utf8')).frontmatter;
  ok('summary has key-files',
    parsed['key-files'] && (parsed['key-files'].created.length + parsed['key-files'].modified.length) > 0);
}

section('writeSummary blocks caller phantom even alongside valid auto-fill');
{
  const { root } = projectWithBaseCommit('p3-mixed');
  let err = null;
  try {
    lifecycle.writeSummary(root, '01-01', {
      subsystem: 'x',
      'key-decisions': ['x'],
      'key-files': { created: ['lib/phantom-mixed.js'], modified: [] },
    });
  } catch (e) { err = e; }
  ok('throws on caller phantom despite valid auto-fill entries',
    err && err.name === 'ValidationError');
  ok('error names the phantom only (auto-fill entries are real)',
    err && /lib\/phantom-mixed\.js/.test(err.message) &&
    !/lib\/new\.js/.test(err.message),
    `msg=${err && err.message}`);
}

section('_checkKeyFilesExist helper is pure (no mutation)');
{
  const root = freshProject('p3-helper-pure');
  const input = {
    'key-files': { created: ['lib/phantom.js'], modified: [] },
  };
  const before = JSON.stringify(input);
  const result = milestone._checkKeyFilesExist(input, root);
  ok('helper returns { missing: [...] }', Array.isArray(result.missing));
  ok('1 missing entry', result.missing.length === 1);
  ok('missing entry has path + kind',
    result.missing[0].path === 'lib/phantom.js' && result.missing[0].kind === 'created');
  ok('input not mutated', JSON.stringify(input) === before);
}

section('_checkKeyFilesExist opts out cleanly');
{
  const root = freshProject('p3-helper-opt-out');
  const result = milestone._checkKeyFilesExist(
    { 'key-files': { created: ['lib/phantom.js'], modified: [] } },
    root,
    { checkFileExistence: false }
  );
  ok('opt-out returns empty missing', result.missing.length === 0);
}

// ---------- v0.8 P5: plan-time expected-key-files (Phase 21) ----------

section('_extractExpectedKeyFiles helper');
{
  const root = freshProject('p5-extract');
  const phaseDir = path.join(root, '.planning', 'phases', '01-greet');
  // Default fixture PLAN.md has no expected-key-files → null.
  ok('no field → null', milestone._extractExpectedKeyFiles(phaseDir, '01-01') === null);

  // Flat array shape.
  const planPath = path.join(phaseDir, 'PLAN.md');
  fs.writeFileSync(planPath, `---\nphase: 1\nname: Greet\nplans: [01-01]\nexpected-key-files:\n  - lib/foo.js\n  - test/foo.js\n  - lib/foo.js\n---\n# Phase 1\n`);
  const flat = milestone._extractExpectedKeyFiles(phaseDir, '01-01');
  ok('flat array returned', Array.isArray(flat) && flat.length === 2, `got ${JSON.stringify(flat)}`);
  ok('flat array deduped', flat.includes('lib/foo.js') && flat.includes('test/foo.js'));

  // Object shape — own plan only (no other SUMMARYs).
  fs.writeFileSync(planPath, `---\nphase: 1\nname: Greet\nexpected-key-files:\n  01-01:\n    - lib/a.js\n  01-02:\n    - lib/b.js\n---\n# Phase 1\n`);
  const objMine = milestone._extractExpectedKeyFiles(phaseDir, '01-01');
  ok('object: only own plan when no other SUMMARYs', objMine.length === 1 && objMine[0] === 'lib/a.js',
    `got ${JSON.stringify(objMine)}`);

  // Object shape — sibling plan's SUMMARY exists → union.
  fs.writeFileSync(path.join(phaseDir, '01-02-SUMMARY.md'), '---\nphase: 1\n---\n# sib\n');
  const objUnion = milestone._extractExpectedKeyFiles(phaseDir, '01-01');
  ok('object: unions sibling plan with existing SUMMARY', objUnion.length === 2 && objUnion.includes('lib/a.js') && objUnion.includes('lib/b.js'));

  // Malformed (not array/object) → null.
  fs.writeFileSync(planPath, `---\nphase: 1\nexpected-key-files: "not an array"\n---\n`);
  ok('string scalar → null (malformed)', milestone._extractExpectedKeyFiles(phaseDir, '01-01') === null);

  // Missing PLAN.md → null.
  ok('missing PLAN.md → null', milestone._extractExpectedKeyFiles(path.join(root, 'no-such'), '01-01') === null);
}

section('_diffExpectedVsActual helper');
{
  // Match.
  const a = milestone._diffExpectedVsActual(['lib/a.js', 'lib/b.js'], {
    'key-files': { created: ['lib/a.js'], modified: ['lib/b.js'] },
  });
  ok('match: no unexpected', a.unexpected.length === 0);
  ok('match: no missing', a.missingExpected.length === 0);

  // Unexpected.
  const b = milestone._diffExpectedVsActual(['lib/a.js'], {
    'key-files': { created: ['lib/a.js', 'lib/b.js'], modified: [] },
  });
  ok('unexpected: lib/b.js flagged', b.unexpected.length === 1 && b.unexpected[0] === 'lib/b.js');
  ok('unexpected: no missing', b.missingExpected.length === 0);

  // Missing expected.
  const c = milestone._diffExpectedVsActual(['lib/a.js', 'lib/b.js'], {
    'key-files': { created: ['lib/a.js'], modified: [] },
  });
  ok('missing: lib/b.js flagged', c.missingExpected.length === 1 && c.missingExpected[0] === 'lib/b.js');

  // Both.
  const d = milestone._diffExpectedVsActual(['lib/a.js', 'lib/c.js'], {
    'key-files': { created: ['lib/a.js'], modified: ['lib/d.js'] },
  });
  ok('both: 1 unexpected, 1 missing', d.unexpected.length === 1 && d.missingExpected.length === 1);

  // .planning/ paths filtered from actual side.
  const e = milestone._diffExpectedVsActual(['lib/a.js'], {
    'key-files': { created: ['lib/a.js'], modified: ['.planning/STATE.md'] },
  });
  ok('.planning/ paths ignored', e.unexpected.length === 0);

  // null expected → both empty (disabled).
  const f = milestone._diffExpectedVsActual(null, { 'key-files': { created: ['lib/a.js'], modified: [] } });
  ok('null expected → diff empty', f.unexpected.length === 0 && f.missingExpected.length === 0);
}

section('writeSummary records expected-vs-actual drift (v0.8 P5)');
{
  const { root } = projectWithBaseCommit('p5-drift');
  // Add expected-key-files mismatch: claim only lib/x.js but actual has lib/new.js + README.md.
  const planPath = path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md');
  const orig = fs.readFileSync(planPath, 'utf8');
  fs.writeFileSync(planPath, orig.replace(/^---\n/, '---\nexpected-key-files:\n  - lib/x.js\n'));
  execSync('git add -A && git commit -q -m "add expected-key-files"', { cwd: root });

  let result;
  const stderr = captureStderr(() => {
    result = lifecycle.writeSummary(root, '01-01', { 'key-decisions': ['x'] });
  });
  ok('writeSummary returns expectedDrift object', result.expectedDrift && typeof result.expectedDrift === 'object');
  ok('unexpected includes lib/new.js', result.expectedDrift.unexpected.includes('lib/new.js'));
  ok('missingExpected includes lib/x.js', result.expectedDrift.missingExpected.includes('lib/x.js'));
  ok('stderr has drift notice', /expected-vs-actual drift/.test(stderr), `stderr=${JSON.stringify(stderr)}`);
  // key-decisions should now include the drift sentence appended.
  const written = fm.parse(fs.readFileSync(result.path, 'utf8')).frontmatter;
  ok('key-decisions includes drift sentence',
    Array.isArray(written['key-decisions']) &&
    written['key-decisions'].some((d) => /expected-vs-actual drift/.test(d)),
    `got ${JSON.stringify(written['key-decisions'])}`);
}

section('writeSummary silent when no expected-key-files');
{
  const { root } = projectWithBaseCommit('p5-silent');
  let result;
  const stderr = captureStderr(() => {
    result = lifecycle.writeSummary(root, '01-01', { 'key-decisions': ['x'] });
  });
  ok('expectedDrift is null', result.expectedDrift === null);
  ok('no drift notice', !/expected-vs-actual drift/.test(stderr));
}

section('writeSummary silent when expected matches actual');
{
  const { root } = projectWithBaseCommit('p5-match');
  // Set expected to exactly the files the fixture changes: lib/new.js + README.md.
  const planPath = path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md');
  const orig = fs.readFileSync(planPath, 'utf8');
  fs.writeFileSync(planPath, orig.replace(/^---\n/,
    '---\nexpected-key-files:\n  - lib/new.js\n  - README.md\n'));
  execSync('git add -A && git commit -q -m "expected matches"', { cwd: root });
  let result;
  const stderr = captureStderr(() => {
    result = lifecycle.writeSummary(root, '01-01', { 'key-decisions': ['x'] });
  });
  ok('expectedDrift is null', result.expectedDrift === null);
  ok('no drift notice in stderr', !/expected-vs-actual drift/.test(stderr));
}

section('writeSummary --strict-expected throws on drift');
{
  const { root } = projectWithBaseCommit('p5-strict');
  const planPath = path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md');
  const orig = fs.readFileSync(planPath, 'utf8');
  fs.writeFileSync(planPath, orig.replace(/^---\n/, '---\nexpected-key-files:\n  - lib/x.js\n'));
  execSync('git add -A && git commit -q -m "drift"', { cwd: root });
  let thrown = null;
  try {
    captureStderr(() => {
      lifecycle.writeSummary(root, '01-01', { 'key-decisions': ['x'] }, { strictExpected: true });
    });
  } catch (e) { thrown = e; }
  ok('throws when --strict-expected and drift present', thrown !== null);
  ok('error is ValidationError', thrown && thrown instanceof milestone.ValidationError);
  ok('error message mentions drift', thrown && /expected-vs-actual drift/.test(thrown.message));
}

section('writeSummary { expectedCheck: false } opts out');
{
  const { root } = projectWithBaseCommit('p5-opt-out');
  const planPath = path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md');
  const orig = fs.readFileSync(planPath, 'utf8');
  fs.writeFileSync(planPath, orig.replace(/^---\n/, '---\nexpected-key-files:\n  - lib/x.js\n'));
  execSync('git add -A && git commit -q -m "drift"', { cwd: root });
  let result;
  const stderr = captureStderr(() => {
    result = lifecycle.writeSummary(root, '01-01', { 'key-decisions': ['x'] }, { expectedCheck: false });
  });
  ok('opt-out: expectedDrift is null', result.expectedDrift === null);
  ok('opt-out: no stderr notice', !/expected-vs-actual drift/.test(stderr));
  const written = fm.parse(fs.readFileSync(result.path, 'utf8')).frontmatter;
  ok('opt-out: key-decisions not appended', !written['key-decisions'].some((d) => /expected-vs-actual drift/.test(d)));
}

// ---------- statusReport ----------

section('statusReport');
{
  const root = freshProject('status');
  const s = lifecycle.statusReport(root);
  ok('ok=true', s.ok);
  ok('finds in-progress milestone "v0.1 Hi"', s.milestone === 'v0.1 Hi');
  ok('milestoneStatus=in-progress', s.milestoneStatus === 'in-progress');
  ok('one phase listed', s.phases.length === 1);
  ok('phase 1 has 0/2 plans done initially', s.phases[0].done === 0 && s.phases[0].total === 2);
  ok('nextPlan = 01-01', s.nextPlan && s.nextPlan.planId === '01-01');

  lifecycle.tickPlan(root, '01-01', { dryRun: false });
  const s2 = lifecycle.statusReport(root);
  ok('after tick 01-01: nextPlan = 01-02', s2.nextPlan.planId === '01-02');
  ok('after tick 01-01: 1/2 done', s2.phases[0].done === 1);

  lifecycle.tickPlan(root, '01-02');
  const s3 = lifecycle.statusReport(root);
  ok('after both ticked: nextPlan=null', s3.nextPlan === null);
}

{
  // Missing roadmap
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-empty-'));
  const r = lifecycle.statusReport(root);
  ok('missing roadmap → ok:false', !r.ok && /missing/i.test(r.error));
}

// ---------- completeMilestone ----------

section('completeMilestone');
{
  // Incomplete → fails with structured reason
  const root = freshProject('incomplete');
  const r = lifecycle.completeMilestone(root, { noCommit: true });
  ok('incomplete returns ok:false reason:incomplete', !r.ok && r.reason === 'incomplete');
  ok('verify.reports has 1 phase', r.verify.reports.length === 1);
  ok('reports plansDone=0/2', r.verify.reports[0].plansDone === 0);
  ok('reports summariesMissing 01-01, 01-02', r.verify.reports[0].summariesMissing.length === 2);
}

{
  // Complete flow.
  const root = freshProject('complete');
  // v0.8 P3: pre-create src/a.js + src/b.js so the existence check passes.
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), '// stub\n');
  fs.writeFileSync(path.join(root, 'src', 'b.js'), '// stub\n');
  lifecycle.tickPlan(root, '01-01');
  lifecycle.tickPlan(root, '01-02');
  lifecycle.writeSummary(root, '01-01', { subsystem: 'g', tags: ['cli'], requires: [], provides: ['hello'], 'key-files': { created: ['src/a.js'], modified: [] }, 'requirements-completed': ['hello'], 'key-decisions': ['x'], 'patterns-established': [], duration: '2min' });
  lifecycle.writeSummary(root, '01-02', { subsystem: 'g', tags: ['cli'], requires: ['hello'], provides: ['bye'], 'key-files': { created: ['src/b.js'], modified: [] }, 'requirements-completed': ['bye'], 'key-decisions': [], 'patterns-established': ['p1'], duration: '1min' });

  // Dry-run first.
  const dry = lifecycle.completeMilestone(root, { dryRun: true, noCommit: true });
  ok('dry-run ok=true', dry.ok);
  ok('dry-run dryRun=true', dry.dryRun === true);
  ok('dry-run did NOT write MILESTONES.md', !fs.existsSync(path.join(root, '.planning', 'MILESTONES.md')));
  ok('dry-run did NOT delete MILESTONE-CONTEXT.md', fs.existsSync(path.join(root, '.planning', 'MILESTONE-CONTEXT.md')));
  ok('dry-run actions length 5 (MILESTONES write + ROADMAP write + DESIGN write + STATE write + MC delete)', dry.actions.length === 5);
  ok('dry-run includes milestone DESIGN.md write',
    dry.actions.some((a) => a.kind === 'write' && /[\\/]milestones[\\/]v0-1-hi[\\/]DESIGN\.md$/.test(a.path)));

  // Real run.
  const real = lifecycle.completeMilestone(root, { noCommit: true });
  ok('real run ok=true', real.ok);
  ok('milestone="v0.1 Hi"', real.milestone === 'v0.1 Hi');
  ok('aggregated subsystem=greet (singular -> array)', real.agg.subsystems.includes('g'));
  ok('aggregated 2 files created', real.agg.filesCreated.length === 2);
  ok('MILESTONES.md created', fs.existsSync(path.join(root, '.planning', 'MILESTONES.md')));
  const milestonesContent = fs.readFileSync(path.join(root, '.planning', 'MILESTONES.md'), 'utf8');
  ok('MILESTONES.md contains "v0.1 Hi  — shipped"', /v0\.1 Hi\s+—\s+shipped/.test(milestonesContent));
  ok('MILESTONE-CONTEXT.md deleted', !fs.existsSync(path.join(root, '.planning', 'MILESTONE-CONTEXT.md')));
  const roadmapAfter = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP wrapped in <details>', /<details>[\s\S]*v0\.1 Hi[\s\S]*<\/details>/.test(roadmapAfter));
  const stateAfter = fs.readFileSync(path.join(root, '.planning', 'STATE.md'), 'utf8');
  ok('STATE Status -> Idle', /Status:\s+Idle/.test(stateAfter));
  ok('STATE Last activity references milestone', /Last activity:\s+\d{4}-\d{2}-\d{2}\s+—\s+shipped v0\.1 Hi/.test(stateAfter));

  // Idempotency on already-shipped: findMilestoneInRoadmap should still find it
  // (status reports as shipped); but verifyMilestoneComplete still ok=true →
  // completeMilestone will create a SECOND digest. That's user error and the
  // current behavior; just make sure we don't crash.
  const replay = lifecycle.completeMilestone(root, { name: 'v0.1 Hi', noCommit: true });
  ok('replay does not crash (idempotent for caller)', replay.ok === true || replay.ok === false);
}

{
  // No current milestone case
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-noms-'));
  execSync('git init -q -b main', { cwd: root });
  execSync('git config user.email t@l && git config user.name t', { cwd: root });
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), `# x\n\n## Phases\n\nno milestones here.\n`);
  const r = lifecycle.completeMilestone(root, { noCommit: true });
  ok('no current milestone → reason:no-current-milestone', !r.ok && r.reason === 'no-current-milestone');
  ok('hint present', typeof r.hint === 'string');
}

{
  // Explicit --name for unknown milestone
  const root = freshProject('badname');
  const r = lifecycle.completeMilestone(root, { name: 'v99 Nope', noCommit: true });
  ok('unknown name → reason:milestone-not-found', !r.ok && r.reason === 'milestone-not-found');
}

// ---------- commit integration ----------

section('completeMilestone w/ git commit');
{
  const root = freshProject('commit');
  lifecycle.tickPlan(root, '01-01');
  lifecycle.tickPlan(root, '01-02');
  lifecycle.writeSummary(root, '01-01', { subsystem: 'g' });
  lifecycle.writeSummary(root, '01-02', { subsystem: 'g' });
  const r = lifecycle.completeMilestone(root);
  ok('commit hash returned', typeof r.commit === 'string' && /^[0-9a-f]{6,}$/.test(r.commit));
  const log = execSync('git log -1 --format=%s', { cwd: root }).toString().trim();
  ok('commit message starts with "cp: /cp-complete-milestone"', log.startsWith('cp: /cp-complete-milestone'));
}

// ---------- scaffoldMilestone ----------

section('scaffoldMilestone');
{
  const root = freshProject('sm-base');
  // Clear out the seeded milestone so we can scaffold a fresh one.
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# demo\n\n## Phases\n\n## Progress\n\n');
  const r = lifecycle.scaffoldMilestone(root, 'v0.2 Greet v2');
  ok('ok=true on first add', r.ok);
  ok('milestone name preserved', r.milestone === 'v0.2 Greet v2');
  ok('status defaults to in-progress', r.status === 'in-progress');
  ok('two actions emitted', r.actions.length === 2);
  const content = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('heading injected with 🚧 emoji + (In Progress) suffix',
    content.includes('### 🚧 v0.2 Greet v2 (In Progress)'));
  // Round-trip: lib/milestone parser sees it.
  const found = milestone.findMilestoneInRoadmap(content, 'v0.2 Greet v2');
  ok('round-trip via findMilestoneInRoadmap', found && found.status === 'in-progress');
}

section('scaffoldMilestone refuses duplicate');
{
  const root = freshProject('sm-dup');
  // freshProject already has "v0.1 Hi" in-progress.
  const r = lifecycle.scaffoldMilestone(root, 'v0.1 Hi');
  ok('ok=false with reason:milestone-exists', !r.ok && r.reason === 'milestone-exists');
  ok('returns existing milestone meta', r.milestone === 'v0.1 Hi' && r.status === 'in-progress');
}

section('scaffoldMilestone --planned');
{
  const root = freshProject('sm-planned');
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# demo\n\n## Phases\n\n');
  const r = lifecycle.scaffoldMilestone(root, 'v0.5 Future', { status: 'planned' });
  ok('planned status accepted', r.ok && r.status === 'planned');
  const content = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('emoji is 📋 with (Planned) suffix',
    content.includes('### 📋 v0.5 Future (Planned)'));
}

section('scaffoldMilestone --dry-run');
{
  const root = freshProject('sm-dry');
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# demo\n\n## Phases\n\n');
  const r = lifecycle.scaffoldMilestone(root, 'v0.3', { dryRun: true });
  ok('dryRun ok=true', r.ok && r.dryRun);
  const content = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('disk unchanged in dry-run', !content.includes('v0.3'));
}

section('scaffoldMilestone errors on missing ## Phases');
{
  const root = freshProject('sm-no-phases');
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), '# demo\n\nno phases section\n');
  let threw = false;
  try { lifecycle.scaffoldMilestone(root, 'v1'); } catch (e) { threw = /no\s+`## Phases`/.test(e.message); }
  ok('throws with clear message when ## Phases missing', threw);
}

// ---------- scaffoldPhase ----------

section('scaffoldPhase happy path');
{
  const root = freshProject('sp-base');
  // Remove the seeded phase 1 dir so we can scaffold a phase 2.
  const r = lifecycle.scaffoldPhase(root, '2', { name: 'Ship It', plans: 3 });
  ok('ok=true', r.ok);
  ok('phaseNum echoed', r.phaseNum === '2');
  ok('milestone resolved to active', r.milestone === 'v0.1 Hi');
  ok('plans list returned', JSON.stringify(r.plans) === '["02-01","02-02","02-03"]');
  ok('four actions emitted (ROADMAP + PLAN + DESIGN + REVIEW-LOG)', r.actions.length === 4);
  ok('phase dir created', fs.existsSync(r.phaseDir) && r.phaseDir.endsWith('02-ship-it'));
  ok('PLAN.md created', fs.existsSync(path.join(r.phaseDir, 'PLAN.md')));
  const planContent = fs.readFileSync(path.join(r.phaseDir, 'PLAN.md'), 'utf8');
  ok('PLAN.md frontmatter has phase + milestone',
    planContent.includes('phase: "2"') && planContent.includes('milestone: v0.1 Hi'));
  ok('PLAN.md lists generated plans',
    planContent.includes('- [ ] 02-01:') && planContent.includes('- [ ] 02-03:'));
  // ROADMAP got the phase heading + checkboxes.
  const rmap = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP has new ### Phase 2: heading', rmap.includes('### Phase 2: Ship It'));
  ok('ROADMAP has 02-01..02-03 checkboxes',
    rmap.includes('- [ ] 02-01: TBD') && rmap.includes('- [ ] 02-03: TBD'));
}

section('scaffoldPhase stamps base-commit on PLAN.md (v0.8 P1)');
{
  const root = freshProject('sp-base-commit');
  const r = lifecycle.scaffoldPhase(root, '3', { name: 'Pinned', plans: 1 });
  ok('scaffold ok', r.ok);
  const planContent = fs.readFileSync(path.join(r.phaseDir, 'PLAN.md'), 'utf8');
  const m = planContent.match(/^base-commit:\s*([0-9a-f]{40})\s*$/m);
  ok('PLAN.md frontmatter has base-commit field', m !== null,
    `frontmatter:\n${planContent.split('---')[1] || planContent.slice(0, 200)}`);
  if (m) {
    const head = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
    ok('base-commit matches `git rev-parse HEAD` of repo', m[1] === head);
  }
  ok('template comment line stripped after stamping',
    !planContent.includes('# base-commit stamped by'));
  ok('other frontmatter keys preserved',
    planContent.includes('phase: "3"') && planContent.includes('milestone: v0.1 Hi') && planContent.includes('status: in-progress'));
}

section('scaffoldPhase omits base-commit cleanly when git unavailable');
{
  // Simulate "no git" by pointing scaffold at a non-git tmp dir that has
  // a complete cp .planning skeleton but no git history.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-no-git-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# demo\n\n## Phases\n\n### \uD83D\uDEA7 v0.1 Hi (In Progress)\n\nGoal: t.\n\n');
  const r = lifecycle.scaffoldPhase(root, '1', { name: 'Solo', plans: 1 });
  ok('scaffold ok in non-git dir', r.ok);
  const planContent = fs.readFileSync(path.join(r.phaseDir, 'PLAN.md'), 'utf8');
  ok('PLAN.md has no base-commit field', !/^base-commit:/m.test(planContent));
  ok('template comment retained (signals git was unavailable)',
    planContent.includes('# base-commit stamped by'));
}

section('scaffoldPhase decimal phase number');
{
  const root = freshProject('sp-decimal');
  const r = lifecycle.scaffoldPhase(root, '1.5', { name: 'Hotfix', plans: 1 });
  ok('ok=true for decimal', r.ok);
  ok('plan id uses decimal phase', r.plans[0] === '1.5-01');
  ok('dir name preserves decimal', path.basename(r.phaseDir) === '1.5-hotfix');
}

section('scaffoldPhase refuses duplicate phase number');
{
  const root = freshProject('sp-dup');
  // Phase 1 dir already exists in fixture.
  const r = lifecycle.scaffoldPhase(root, '1', { name: 'Greet again' });
  ok('ok=false with reason:phase-exists', !r.ok && r.reason === 'phase-exists');
}

section('scaffoldPhase fails when no active milestone');
{
  const root = freshProject('sp-no-ms');
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# demo\n\n## Phases\n\n## Progress\n\n');
  // Use a fresh phase number (the seeded 01-greet would trigger phase-exists first).
  const r = lifecycle.scaffoldPhase(root, '9', { name: 'X' });
  ok('reason:no-active-milestone', !r.ok && r.reason === 'no-active-milestone');
}

section('scaffoldPhase --milestone selects by name');
{
  const root = freshProject('sp-target');
  // Add a second planned milestone.
  lifecycle.scaffoldMilestone(root, 'v0.2 Later', { status: 'planned' });
  const r = lifecycle.scaffoldPhase(root, '5', { name: 'Future', milestone: 'v0.2', plans: 1 });
  ok('targets the named milestone, not the active one',
    r.ok && r.milestone === 'v0.2 Later');
}

section('scaffoldPhase --dry-run');
{
  const root = freshProject('sp-dry');
  const r = lifecycle.scaffoldPhase(root, '7', { name: 'D', plans: 1, dryRun: true });
  ok('dryRun ok=true', r.ok && r.dryRun);
  ok('phase dir NOT created in dry-run', !fs.existsSync(r.phaseDir));
  const rmap = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP unchanged in dry-run', !rmap.includes('### Phase 7:'));
}

section('scaffold + tick + complete round-trip');
{
  const root = freshProject('sp-roundtrip');
  // Replace seeded ROADMAP with an empty Phases shape, then scaffold from scratch.
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# demo\n\n## Phases\n\n## Progress\n\n');
  // Remove seeded phase dir
  fs.rmSync(path.join(root, '.planning', 'phases', '01-greet'), { recursive: true, force: true });
  // Scaffold
  let r = lifecycle.scaffoldMilestone(root, 'v0.1 Round');
  ok('scaffold milestone ok', r.ok);
  r = lifecycle.scaffoldPhase(root, '1', { name: 'Only', plans: 1 });
  ok('scaffold phase ok', r.ok);
  // Tick the only plan
  lifecycle.tickPlan(root, '01-01', { noCommit: true });
  // Write a SUMMARY so complete-milestone passes verification
  lifecycle.writeSummary(root, '01-01', { subsystem: 'only' });
  // Complete
  const cm = lifecycle.completeMilestone(root, { noCommit: true });
  ok('complete-milestone succeeds on scaffolded shape', cm.ok);
}

// ---------- end scaffolding tests ----------


if (failed > 0) process.exit(1);
console.log('All lifecycle checks passed.');
