#!/usr/bin/env node
/**
 * Unit tests for the cp lib/ modules.
 *
 * The integration tests (round-trip, dry-runs) exercise these modules in
 * realistic scenarios. This file targets edge cases the integration tests
 * don't naturally hit: empty inputs, boundary values, missing files,
 * malformed sections, idempotency, etc.
 *
 * Modules covered: paths, roadmap, state, gsd-compat, frontmatter,
 * provider, milestone (small), import (small).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const paths = require(path.join(REPO, 'lib', 'paths'));
const roadmap = require(path.join(REPO, 'lib', 'roadmap'));
const state = require(path.join(REPO, 'lib', 'state'));
const compat = require(path.join(REPO, 'lib', 'gsd-compat'));
const fm = require(path.join(REPO, 'lib', 'frontmatter'));
const provider = require(path.join(REPO, 'lib', 'provider'));
const milestone = require(path.join(REPO, 'lib', 'milestone'));
const importer = require(path.join(REPO, 'lib', 'import'));

// ---------- tiny test runner ----------
let passed = 0;
let failed = 0;
const failures = [];
function ok(label, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ' :: ' + detail : ''}`);
    console.log(`  \u2717 ${label}${detail ? ' :: ' + detail : ''}`);
  }
}
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(label + ` (=${e})`, a === e, `got ${a}`);
}
function section(name) { console.log(`\n=== ${name} ===`); }
function mktmp(n) { return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-unit-' + n + '-')); }
function writeFile(p, c) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); }
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

const created = [];
function track(d) { created.push(d); return d; }

try {

// ============================================================
section('lib/paths: padPhaseNum');
eq('"1" -> "01"',      paths.padPhaseNum('1'),  '01');
eq('1 -> "01"',        paths.padPhaseNum(1),    '01');
eq('"9" -> "09"',      paths.padPhaseNum('9'),  '09');
eq('"10" -> "10"',     paths.padPhaseNum('10'), '10');
eq('"100" -> "100"',   paths.padPhaseNum('100'),'100');
eq('"2.1" -> "2.1"',   paths.padPhaseNum('2.1'),'2.1');
eq('"02" -> "02"',     paths.padPhaseNum('02'), '02');

section('lib/paths: slugifyPhase');
eq('"Foundation" -> "foundation"',          paths.slugifyPhase('Foundation'),         'foundation');
eq('"Sign-up & Auth" -> "sign-up-auth"',    paths.slugifyPhase('Sign-up & Auth'),     'sign-up-auth');
eq('leading/trailing dashes stripped',      paths.slugifyPhase('  -hi-  '),           'hi');
eq('long name truncated to 40 chars',       paths.slugifyPhase('a'.repeat(80)).length, 40);
eq('empty -> "phase" sentinel',             paths.slugifyPhase(''),                   'phase');
eq('all-punct -> "phase" sentinel',         paths.slugifyPhase('!!!'),                'phase');
eq('unicode collapsed to dashes',           paths.slugifyPhase('hello 世界 world'),   'hello-world');

section('lib/paths: phaseDirName / phasePlanPrefix');
eq('phase 1 "Foundation"',     paths.phaseDirName(1, 'Foundation'),     '01-foundation');
eq('phase 2.1 "Hotfix"',       paths.phaseDirName('2.1', 'Hotfix'),     '2.1-hotfix');
eq('phasePlanPrefix(1, 2)',    paths.phasePlanPrefix(1, 2),             '01-02');
eq('phasePlanPrefix(10, 11)',  paths.phasePlanPrefix(10, 11),           '10-11');
eq('phasePlanPrefix(2.1, 3)',  paths.phasePlanPrefix('2.1', 3),         '2.1-03');

section('lib/paths: findPhaseDir');
{
  const root = track(mktmp('paths'));
  fs.mkdirSync(path.join(root, '.planning', 'phases', '01-foundation'), { recursive: true });
  fs.mkdirSync(path.join(root, '.planning', 'phases', '2.1-hotfix'),    { recursive: true });
  fs.mkdirSync(path.join(root, '.planning', 'phases', '10-platform'),   { recursive: true });

  ok('finds by integer phase num',      paths.findPhaseDir(1, root).endsWith('01-foundation'));
  ok('finds by string phase num',       paths.findPhaseDir('1', root).endsWith('01-foundation'));
  ok('finds by zero-padded phase num',  paths.findPhaseDir('01', root).endsWith('01-foundation'));
  ok('finds by decimal phase num',      paths.findPhaseDir('2.1', root).endsWith('2.1-hotfix'));
  ok('finds two-digit phase num',       paths.findPhaseDir(10, root).endsWith('10-platform'));
  ok('finds by exact slug',             paths.findPhaseDir('01-foundation', root).endsWith('01-foundation'));
  ok('returns null for unknown num',    paths.findPhaseDir(99, root) === null);
  ok('returns null for unknown slug',   paths.findPhaseDir('99-nope', root) === null);
}
{
  const root = track(mktmp('paths-empty'));
  ok('no phases dir -> null', paths.findPhaseDir(1, root) === null);
}

// ============================================================
section('lib/roadmap: listPhases edge cases');
{
  const empty = '# Roadmap\n\nno phases here\n';
  eq('empty roadmap -> []', roadmap.listPhases(empty), []);

  const noPlans = `# Roadmap\n\n### Phase 1: Foo\n\n(no plans yet)\n\n### Phase 2: Bar\n`;
  const got = roadmap.listPhases(noPlans);
  eq('two phases with no plans -> length 2', got.length, 2);
  eq('phase 1 has 0 plans',                  got[0].plans.length, 0);
  eq('phase 2 has 0 plans',                  got[1].plans.length, 0);

  const decimal = `### Phase 3: Sharing
Plans:
- [x] 03-01: a
- [ ] 03-02: b

### Phase 3.1: Hotfix (INSERTED)
Plans:
- [ ] 3.1-01: c
`;
  const p = roadmap.listPhases(decimal);
  eq('decimal phase parsed',          p.length, 2);
  eq('phase 3 num',                   p[0].num, '3');
  eq('phase 3.1 num',                 p[1].num, '3.1');
  eq('decimal plan id',               p[1].plans[0].id, '3.1-01');
  eq('strips (INSERTED) from name',   p[1].name, 'Hotfix');
}

section('lib/roadmap: setPlanDone');
{
  const before = '- [ ] 01-02: thing\n- [x] 01-03: other\n';
  const after = roadmap.setPlanDone(before, '01-02', true);
  ok('toggles unchecked -> checked', /- \[x\] 01-02:/.test(after));
  const back = roadmap.setPlanDone(after, '01-02', false);
  ok('toggles checked -> unchecked', /- \[ \] 01-02:/.test(back));
  // idempotent
  eq('setting done=true on already-done is no-op', roadmap.setPlanDone(after, '01-02', true), after);
  // unknown plan id leaves content untouched
  eq('unknown plan id is no-op',     roadmap.setPlanDone(before, '99-99', true), before);
  // decimal plan id
  const dec = '- [ ] 3.1-01: cron\n';
  ok('toggles decimal plan id', /- \[x\] 3\.1-01:/.test(roadmap.setPlanDone(dec, '3.1-01', true)));
}

section('lib/roadmap: appendPhaseBlock');
{
  const base = '# Roadmap\n\n### Phase 1: Foo\nPlans:\n- [ ] 01-01: x\n\n## Progress\n\n(table)\n';
  const block = '### Phase 2: Bar\nPlans:\n- [ ] 02-01: y\n';
  const out = roadmap.appendPhaseBlock(base, block);
  ok('Phase 2 appears before Progress', out.indexOf('### Phase 2:') < out.indexOf('## Progress'));
  ok('Progress section preserved', out.includes('## Progress'));
  ok('original Phase 1 preserved',  out.includes('### Phase 1: Foo'));

  const noProgress = '# Roadmap\n\n### Phase 1: Foo\n';
  const out2 = roadmap.appendPhaseBlock(noProgress, block);
  ok('appends at end when no Progress section', out2.endsWith('- [ ] 02-01: y\n'));
}

// ============================================================
section('lib/state: progressBar');
eq('0%',   state.progressBar(0),   '[░░░░░░░░░░] 0%');
eq('50%',  state.progressBar(50),  '[█████░░░░░] 50%');
eq('100%', state.progressBar(100), '[██████████] 100%');
eq('clamps negative -> 0%', state.progressBar(-50), '[░░░░░░░░░░] 0%');
eq('clamps >100 -> 100%',   state.progressBar(250), '[██████████] 100%');
eq('rounds 73 -> 7 bars',   state.progressBar(73),  '[███████░░░] 73%');

section('lib/state: updatePosition');
{
  const before = `# State

## Current Position
Phase: 1
Plan: 01-01
Status: Not started
Last activity: 2026-01-01 — init

## Session Continuity
Last session: 2026-01-01
Stopped at: (none)
Resume file: (none)
`;
  const after = state.updatePosition(before, { phase: '2', plan: '02-01', status: 'In progress', lastActivity: 'wrote code', date: '2026-02-02' });
  ok('Phase updated',         /Phase: 2/.test(after));
  ok('Plan updated',          /Plan: 02-01/.test(after));
  ok('Status updated',        /Status: In progress/.test(after));
  ok('Last activity updated', /Last activity: 2026-02-02 — wrote code/.test(after));
  ok('Session Continuity untouched', after.includes('Last session: 2026-01-01'));
}

section('lib/state: updateSessionContinuity idempotency');
{
  const before = `## Current Position
Phase: 1

## Session Continuity
Last session: 2026-01-01
Stopped at: x
Resume file: (none)
`;
  const after = state.updateSessionContinuity(before, { date: '2026-01-01', stoppedAt: 'x', resumeFile: '(none)' });
  eq('writing same values is a no-op', after, before);
}

section('lib/state: appendRecentDecision');
{
  const hasSection = `## Decisions

### Recent Decisions

- old decision
`;
  const got = state.appendRecentDecision(hasSection, 'new decision');
  ok('new decision appears first', got.indexOf('- new decision') < got.indexOf('- old decision'));
  ok('old decision preserved',     got.includes('- old decision'));

  const noSection = '# State\n\n(no decisions section)\n';
  eq('no section -> unchanged', state.appendRecentDecision(noSection, 'x'), noSection);
}

// ============================================================
section('lib/gsd-compat: detection matrix');
{
  const root = track(mktmp('compat'));
  ok('hasPlanning=false when no .planning/', compat.hasPlanning(root) === false);
  ok('isGsdProject=false when no sentinels',  compat.isGsdProject(root) === false);
  ok('isCpAware=false when no config',         compat.isCpAware(root) === false);

  // Add an empty .planning/
  fs.mkdirSync(path.join(root, '.planning'));
  ok('hasPlanning=true after mkdir',           compat.hasPlanning(root) === true);
  ok('isGsdProject=false (empty .planning)',   compat.isGsdProject(root) === false);
  ok('isCpAware=false (no config)',            compat.isCpAware(root) === false);

  // Add a GSD sentinel
  fs.mkdirSync(path.join(root, '.planning', 'research'));
  ok('isGsdProject=true after research/',      compat.isGsdProject(root) === true);

  // Add a malformed config.json
  writeFile(path.join(root, '.planning', 'config.json'), '{ bad json');
  ok('isCpAware=false with corrupt json',      compat.isCpAware(root) === false);

  // Add a valid config without cp block
  writeFile(path.join(root, '.planning', 'config.json'), JSON.stringify({ mode: 'x' }));
  ok('isCpAware=false with no cp block',       compat.isCpAware(root) === false);

  // Add cp block
  writeFile(path.join(root, '.planning', 'config.json'), JSON.stringify({ mode: 'x', cp: { workflow_provider: 'sp' } }));
  ok('isCpAware=true with cp block',           compat.isCpAware(root) === true);
}

section('lib/gsd-compat: scanPhases short-form detection');
{
  const root = track(mktmp('compat-phases'));
  fs.mkdirSync(path.join(root, '.planning', 'phases', '01-foundation'), { recursive: true });
  writeFile(path.join(root, '.planning', 'phases', '01-foundation', '01-01-PLAN.md'), '---\nphase: x\n---\n');
  writeFile(path.join(root, '.planning', 'phases', '01-foundation', 'PLAN.md'),       '# short-form plan\n');
  const ps = compat.scanPhases(root);
  eq('1 phase',                   ps.length, 1);
  eq('1 long-form plan',          ps[0].planFiles.length, 1);
  ok('short-form detected',       ps[0].hasShortPlan === true);
  ok('short-form summary absent', ps[0].hasShortSummary === false);
}

section('lib/gsd-compat: report warnings');
{
  const root = track(mktmp('compat-report'));
  fs.mkdirSync(path.join(root, '.planning'));
  const r1 = compat.report(root);
  ok('warns when .planning/ but no cp block', r1.warnings.some((w) => /no `cp` block/.test(w)));

  // Add cp block + GSD sentinel -> friendly coexist warning
  writeFile(path.join(root, '.planning', 'config.json'), JSON.stringify({ cp: {} }));
  fs.mkdirSync(path.join(root, '.planning', 'research'));
  const r2 = compat.report(root);
  ok('reports cpAware', r2.cpAware === true);
  ok('reports gsdProject', r2.gsdProject === true);
  ok('warns about GSD coexistence', r2.warnings.some((w) => /GSD sentinels detected/.test(w)));
}

// ============================================================
section('lib/frontmatter: round-trip + edge cases');
{
  // no frontmatter at all
  const noFm = '# just a body\n';
  const r1 = fm.parse(noFm);
  eq('no frontmatter -> {} fm',  r1.frontmatter, {});
  eq('body preserved as-is',     r1.body, noFm);
  eq('no parseError',            r1.parseError, null);

  // empty frontmatter
  const empty = '---\n\n---\n\n# body\n';
  const r2 = fm.parse(empty);
  eq('empty frontmatter -> {}',  r2.frontmatter, {});

  // nested + list-of-maps round-trip
  const nested = {
    phase: '01-foundation',
    plan: '01',
    must_haves: {
      truths: ['a', 'b'],
      artifacts: [{ path: 'src/a.js', provides: 'A' }, { path: 'src/b.js', provides: 'B' }],
    },
    depends_on: [],
  };
  const text = fm.stringify(nested, '# body\n');
  const parsed = fm.parse(text).frontmatter;
  eq('nested truths preserved',                parsed.must_haves.truths, ['a', 'b']);
  eq('list-of-maps preserved',                 parsed.must_haves.artifacts.length, 2);
  eq('list-of-maps first item',                parsed.must_haves.artifacts[0], { path: 'src/a.js', provides: 'A' });
  eq('empty array preserved',                  parsed.depends_on, []);

  // get / set
  ok('get works',     fm.get(text, 'phase') === '01-foundation');
  const updated = fm.set(text, 'phase', '02-sharing');
  ok('set works',     fm.get(updated, 'phase') === '02-sharing');
  ok('body preserved through set', updated.endsWith('# body\n'));

  // parseError surfacing
  const bad = `---\nfoo: "unterminated\n---\n\n# body\n`;
  const r3 = fm.parse(bad);
  ok('parseError populated for bad YAML', typeof r3.parseError === 'string' && r3.parseError.length > 5);
  ok('frontmatter falls back to {}',      JSON.stringify(r3.frontmatter) === '{}');
}

// ============================================================
section('lib/provider: cpGet / cpSet');
{
  const cfg = { cp: { workflow_provider: 'sp', behavior: { atomic_commits: true } } };
  eq('cpGet top-level',          provider.cpGet(cfg, 'workflow_provider'), 'sp');
  eq('cpGet nested',             provider.cpGet(cfg, 'behavior.atomic_commits'), true);
  eq('cpGet missing with default', provider.cpGet(cfg, 'nonexistent', 'fallback'), 'fallback');
  eq('cpGet deeply missing',     provider.cpGet(cfg, 'a.b.c.d.e'), undefined);

  provider.cpSet(cfg, 'behavior.new_flag', true);
  eq('cpSet creates leaf',       cfg.cp.behavior.new_flag, true);

  provider.cpSet(cfg, 'deeply.nested.path.value', 42);
  eq('cpSet creates intermediate maps', cfg.cp.deeply.nested.path.value, 42);
}

section('lib/provider: detectProvider with always:true');
{
  const cfg = { cp: { providers: { manual: { detect: { always: true }, skills: {} } } } };
  const d = provider.detectProvider(cfg, 'manual');
  ok('always:true -> installed', d.installed === true);

  const d2 = provider.detectProvider(cfg, 'unknown-provider');
  ok('unknown provider -> not installed', d2.installed === false);
  ok('unknown provider has reason',       d2.reason === 'unknown provider');
}

// ============================================================
section('lib/milestone: aggregateSummaries (union/dedupe)');
{
  const summaries = [
    { phaseNum: '1', fm: { subsystem: 'auth', tags: ['security'], requires: ['db'], provides: ['login'], 'tech-stack': { added: ['bcrypt'] } } },
    { phaseNum: '2', fm: { subsystem: 'auth', tags: ['security', 'ux'], requires: ['db', 'cache'], provides: ['session'], 'tech-stack': { added: ['redis', 'bcrypt'] } } },
  ];
  const agg = milestone.aggregateSummaries(summaries);
  eq('subsystems deduped',     agg.subsystems.sort(),     ['auth']);
  eq('tags unioned',           agg.tags.sort(),           ['security', 'ux']);
  eq('requires unioned',       agg.requires.sort(),       ['cache', 'db']);
  eq('provides unioned',       agg.provides.sort(),       ['login', 'session']);
  eq('tech.added deduped',     agg.techAdded.sort(),      ['bcrypt', 'redis']);
}

section('lib/milestone: findMilestoneInRoadmap');
{
  const rm = `# Roadmap

## Phases

### 🚧 v1.1 Sharing (In Progress)

### Phase 3: Sharing
Plans:
- [ ] 03-01: a

### Phase 4: Export
Plans:
- [ ] 04-01: b
`;
  const m = milestone.findMilestoneInRoadmap(rm, 'v1.1');
  ok('finds milestone by partial name', m && m.name === 'v1.1 Sharing');
  eq('milestone status is in-progress', m.status, 'in-progress');
  eq('milestone phases',                m.phases, ['3', '4']);
  ok('returns null for unknown',        milestone.findMilestoneInRoadmap(rm, 'v9.9') === null);
}

// ============================================================
section('lib/import: exitCode logic');
{
  ok('clean report -> 0',
    importer.exitCode({ issues: [], plan: { wouldCreate: [], wouldModify: [] } }) === 0);
  ok('errors -> 1',
    importer.exitCode({ issues: [{ severity: 'error' }], plan: { wouldCreate: [], wouldModify: [] } }) === 1);
  ok('only warnings + changes pending -> 2',
    importer.exitCode({ issues: [{ severity: 'warn' }], plan: { wouldCreate: ['x'], wouldModify: [] } }) === 2);
  ok('errors trump pending changes -> 1',
    importer.exitCode({ issues: [{ severity: 'error' }], plan: { wouldCreate: ['x'], wouldModify: [] } }) === 1);
}

  console.log(`\nPassed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log('  - ' + f);
    process.exitCode = 1;
  } else {
    console.log('All unit-lib checks passed.');
  }
} finally {
  for (const d of created) {
    try { rmrf(d); } catch { /* best effort */ }
  }
}
