'use strict';

/**
 * Unit tests for lib/audit.js (v0.8 Phase 24).
 *
 * Each check is exercised in isolation (happy path + drift path), then
 * runAudit is exercised on a synthetic project with multiple planted
 * drifts to verify the registry orchestration + sorting + summary.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const audit = require('../lib/audit');
const lifecycle = require('../lib/lifecycle');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function freshProject(suffix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-audit-${suffix}-`));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    `---\nproject: demo\n---\n# demo\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [ ] 01-01: hello\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\nbase-commit: 0000000000000000000000000000000000000000\n---\n# Phase 1\n\n## Plans\n- [ ] 01-01: hello\n- [ ] 01-02: bye\n`);
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    `# Project State\n\n## Current Position\n\nPhase: 1 (v0.1 Hi)\nPlan: 01-01\nStatus: Ready to execute\nCurrent focus: Greet\nLast activity: 1970-01-01 — seed\n\nProgress: [██████████] 0%\n\n## Decisions\n\n(none yet)\n`);
  execSync('git add -A && git commit -q -m "seed"', { cwd: dir });
  return dir;
}

// ---------- helpers ----------

section('_listPhaseDirs');
{
  const root = freshProject('list');
  const phases = audit._listPhaseDirs(root);
  ok('one phase', phases.length === 1);
  ok('num parsed', phases[0].num === '1');
  ok('slug parsed', phases[0].slug === 'greet');
}

section('_planTickedFromPlanMd');
{
  const root = freshProject('ticked');
  const planPath = path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md');
  // No ticks initially
  ok('no ticks', audit._planTickedFromPlanMd(planPath).length === 0);
  // Tick one
  const c = fs.readFileSync(planPath, 'utf8').replace('- [ ] 01-01', '- [x] 01-01');
  fs.writeFileSync(planPath, c);
  const t = audit._planTickedFromPlanMd(planPath);
  ok('detects 1 tick', t.length === 1 && t[0] === '01-01');
}

// ---------- ticked-without-summary ----------

section('checkTickedWithoutSummary: clean = no findings');
{
  const root = freshProject('cl');
  const f = audit.checkTickedWithoutSummary(root, { phases: audit._listPhaseDirs(root) });
  ok('no findings', f.length === 0);
}

section('checkTickedWithoutSummary: tick without SUMMARY -> HIGH');
{
  const root = freshProject('twos');
  lifecycle.tickPlan(root, '01-01', { noCommit: true });
  const f = audit.checkTickedWithoutSummary(root, { phases: audit._listPhaseDirs(root) });
  ok('one finding', f.length === 1, `got ${f.length}`);
  ok('id correct', f[0].id === 'ticked-without-summary');
  ok('severity HIGH', f[0].severity === 'HIGH');
  ok('planId set', f[0].planId === '01-01');
  ok('fix is actionable', /cp write-summary 01-01/.test(f[0].fix));
}

// ---------- summary-without-tick ----------

section('checkSummaryWithoutTick: SUMMARY without tick -> MEDIUM');
{
  const root = freshProject('swot');
  // Write SUMMARY manually without ticking
  fs.writeFileSync(
    path.join(root, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md'),
    `---\nplan: 01-01\nsubsystem: g\n---\n# s\n`);
  const f = audit.checkSummaryWithoutTick(root, { phases: audit._listPhaseDirs(root) });
  ok('one finding', f.length === 1, `got ${f.length}`);
  ok('id correct', f[0].id === 'summary-without-tick');
  ok('severity MEDIUM', f[0].severity === 'MEDIUM');
  ok('fix suggests tick', /cp tick 01-01/.test(f[0].fix));
}

// ---------- missing-base-commit ----------

section('checkMissingBaseCommit: PLAN without base-commit -> MEDIUM');
{
  const root = freshProject('mbc');
  // Strip base-commit
  const planPath = path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md');
  fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8').replace(/\nbase-commit:[^\n]*\n/, '\n'));
  const f = audit.checkMissingBaseCommit(root, { phases: audit._listPhaseDirs(root) });
  ok('one finding', f.length === 1);
  ok('id correct', f[0].id === 'missing-base-commit');
  ok('severity MEDIUM', f[0].severity === 'MEDIUM');
}

section('checkMissingBaseCommit: PLAN with base-commit -> no finding');
{
  const root = freshProject('mbc-clean');
  const f = audit.checkMissingBaseCommit(root, { phases: audit._listPhaseDirs(root) });
  ok('no findings', f.length === 0);
}

// ---------- invalid-base-commit ----------

section('checkInvalidBaseCommit: bogus SHA -> HIGH');
{
  const root = freshProject('ibc');
  const f = audit.checkInvalidBaseCommit(root, { phases: audit._listPhaseDirs(root) });
  ok('one finding', f.length === 1, `got ${f.length}: ${JSON.stringify(f)}`);
  ok('severity HIGH', f[0].severity === 'HIGH');
  ok('mentions phase', /Phase 1/.test(f[0].message));
}

section('checkInvalidBaseCommit: real SHA -> no finding');
{
  const root = freshProject('ibc-real');
  const sha = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  const planPath = path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md');
  fs.writeFileSync(planPath,
    fs.readFileSync(planPath, 'utf8').replace(/base-commit: \S+/, `base-commit: ${sha}`));
  const f = audit.checkInvalidBaseCommit(root, { phases: audit._listPhaseDirs(root) });
  ok('no findings', f.length === 0);
}

// ---------- missing-end-commit ----------

section('checkMissingEndCommit: SUMMARY without end-commit -> MEDIUM');
{
  const root = freshProject('mec');
  fs.writeFileSync(
    path.join(root, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md'),
    `---\nplan: 01-01\nsubsystem: g\n---\n# s\n`);
  const f = audit.checkMissingEndCommit(root, { phases: audit._listPhaseDirs(root) });
  ok('one finding', f.length === 1);
  ok('id correct', f[0].id === 'missing-end-commit');
  ok('severity MEDIUM', f[0].severity === 'MEDIUM');
}

// ---------- runAudit integration ----------

section('runAudit: clean project -> zero findings');
{
  const root = freshProject('runaudit-clean');
  // Use a real base-commit
  const sha = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  const planPath = path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md');
  fs.writeFileSync(planPath,
    fs.readFileSync(planPath, 'utf8').replace(/base-commit: \S+/, `base-commit: ${sha}`));
  // also regen STATE so state-stale doesn't fire
  try { require('../lib/state').regenerate(root); } catch (_) {}
  const r = audit.runAudit(root);
  // Roadmap-no-plan-md may fire for phase listings without PLAN; verify
  // summary HIGH = 0
  ok('zero HIGH findings', r.summary.high === 0,
    `got ${r.summary.high}: ${JSON.stringify(r.findings.filter(f => f.severity === 'HIGH'))}`);
}

section('runAudit: planted drift -> mixed findings, sorted HIGH first');
{
  const root = freshProject('runaudit-drift');
  // Plant: tick 01-01 without summary (HIGH); leave base-commit invalid (HIGH);
  // create SUMMARY for 01-02 without tick (MEDIUM)
  lifecycle.tickPlan(root, '01-01', { noCommit: true });
  fs.writeFileSync(
    path.join(root, '.planning', 'phases', '01-greet', '01-02-SUMMARY.md'),
    `---\nplan: 01-02\nsubsystem: g\n---\n# s\n`);
  const r = audit.runAudit(root);
  ok('at least 2 findings', r.findings.length >= 2,
    `findings=${JSON.stringify(r.findings.map(f => f.id))}`);
  ok('HIGH count >= 1', r.summary.high >= 1);
  ok('first finding is HIGH', r.findings[0].severity === 'HIGH');
  // ensure ids present
  const ids = new Set(r.findings.map((f) => f.id));
  ok('ticked-without-summary present', ids.has('ticked-without-summary'));
  ok('summary-without-tick present', ids.has('summary-without-tick'));
  ok('invalid-base-commit present', ids.has('invalid-base-commit'));
}

section('runAudit: --phase filter scopes the sweep');
{
  const root = freshProject('runaudit-phase');
  lifecycle.tickPlan(root, '01-01', { noCommit: true });
  const r1 = audit.runAudit(root, { phase: '1' });
  ok('phase 1 finds ticked-without-summary',
    r1.findings.some((f) => f.id === 'ticked-without-summary' && f.phaseNum === '1'));
  const r99 = audit.runAudit(root, { phase: '99' });
  ok('phase 99 yields no per-phase findings',
    !r99.findings.some((f) => f.id === 'ticked-without-summary'));
}

section('runAudit: check-error path');
{
  const root = freshProject('runaudit-err');
  const r = audit.runAudit(root, { checks: [{ id: 'boom', fn: () => { throw new Error('boom!'); } }] });
  ok('one finding', r.findings.length === 1);
  ok('id check-error', r.findings[0].id === 'check-error');
  ok('severity LOW', r.findings[0].severity === 'LOW');
  ok('message includes original', /boom!/.test(r.findings[0].message));
}

// ---------- sham-review-log helpers ----------

section('_isReviewerBearingSkill');
{
  ok('subagent-driven-development is reviewer-bearing',
    audit._isReviewerBearingSkill('subagent-driven-development'));
  ok('superpowers/subagent-driven-development is reviewer-bearing',
    audit._isReviewerBearingSkill('superpowers/subagent-driven-development'));
  ok('executing-plans is reviewer-bearing',
    audit._isReviewerBearingSkill('executing-plans'));
  ok('requesting-code-review is reviewer-bearing',
    audit._isReviewerBearingSkill('requesting-code-review'));
  ok('cp:manual/execute is NOT reviewer-bearing',
    !audit._isReviewerBearingSkill('cp:manual/execute'));
  ok('null is NOT reviewer-bearing',
    !audit._isReviewerBearingSkill(null));
}

section('_parseShamReviewLogEntries: parses reviewer roles from headings');
{
  const root = freshProject('parse-rl');
  const rlPath = path.join(root, '.planning', 'phases', '01-greet', 'REVIEW-LOG.md');
  fs.writeFileSync(rlPath,
    `---\nphase: "1"\n---\n\n## Entries\n\n<!-- REVIEW-LOG-ENTRIES-BELOW -->\n` +
    `## 2026-01-01 12:00 \u2014 Plan 01-01 Task 1 \u2014 orchestrator (inline)\n\n` +
    `**Verdict:** approved\n\n---\n` +
    `## 2026-01-02 09:00 \u2014 Plan 01-01 Task 2 \u2014 alice@example.com\n\n` +
    `**Verdict:** approved\n\n---\n`);
  const { entries, error } = audit._parseShamReviewLogEntries(rlPath);
  ok('no parse error', error === null);
  ok('two entries found', entries.length === 2, `got ${entries.length}`);
  ok('first reviewer is orchestrator (inline)', entries[0].reviewer === 'orchestrator (inline)');
  ok('second reviewer is alice@example.com', entries[1].reviewer === 'alice@example.com');
}

section('_parseShamReviewLogEntries: missing file returns error');
{
  const { entries, error } = audit._parseShamReviewLogEntries('/nonexistent/path/REVIEW-LOG.md');
  ok('entries empty', entries.length === 0);
  ok('error is file not found', error === 'file not found');
}

// ---------- checkShamReviewLog ----------

// Helper: create a test project with a config.json that makes the execute skill reviewer-bearing
function mkShamProject(suffix, opts) {
  const root = freshProject(suffix);
  const phaseDir = path.join(root, '.planning', 'phases', '01-greet');
  if (opts.reviewLog !== undefined) {
    fs.writeFileSync(path.join(phaseDir, 'REVIEW-LOG.md'), opts.reviewLog);
  }
  // Configure execute skill via config.json (manual provider always installed)
  const executeSkill = opts.executeSkill !== undefined ? opts.executeSkill : 'subagent-driven-development';
  const cfg = {
    cp: {
      workflow_provider: 'manual',
      providers: {
        manual: {
          description: 'test manual',
          detect: { always: true },
          skills: { execute: executeSkill },
          prompts: {},
        },
      },
    },
  };
  fs.writeFileSync(
    path.join(root, '.planning', 'config.json'),
    JSON.stringify(cfg, null, 2) + '\n',
  );
  return root;
}

const SHAM_LOG_WITH_SHAM_REVIEWER =
  `---\nphase: "1"\n---\n\n## Entries\n\n<!-- REVIEW-LOG-ENTRIES-BELOW -->\n` +
  `## 2026-01-01 12:00 \u2014 Plan 01-01 Task 1 \u2014 orchestrator (inline)\n\n` +
  `**Verdict:** approved on first pass\n\n---\n`;

const SHAM_LOG_WITH_REAL_REVIEWER =
  `---\nphase: "1"\n---\n\n## Entries\n\n<!-- REVIEW-LOG-ENTRIES-BELOW -->\n` +
  `## 2026-01-01 12:00 \u2014 Plan 01-01 Task 1 \u2014 alice@example.com\n\n` +
  `**Verdict:** approved on first pass\n\n---\n`;

section('checkShamReviewLog: sham phrase + reviewer-bearing skill + no real reviewer -> MEDIUM finding');
{
  const root = mkShamProject('sham-fires', { reviewLog: SHAM_LOG_WITH_SHAM_REVIEWER });
  const f = audit.checkShamReviewLog(root, { phases: audit._listPhaseDirs(root) });
  ok('one finding', f.length === 1, `got ${f.length}: ${JSON.stringify(f)}`);
  ok('id is sham-review-log', f[0].id === 'sham-review-log');
  ok('severity MEDIUM', f[0].severity === 'MEDIUM');
  ok('phaseNum is 1', f[0].phaseNum === '1');
  ok('message names phase', /Phase 1/.test(f[0].message));
}

section('checkShamReviewLog: sham phrase but run-state has real reviewer -> no finding');
{
  const root = mkShamProject('sham-real', { reviewLog: SHAM_LOG_WITH_REAL_REVIEWER });
  const f = audit.checkShamReviewLog(root, { phases: audit._listPhaseDirs(root) });
  ok('no findings (real reviewer present)', f.length === 0, `got ${f.length}: ${JSON.stringify(f)}`);
}

section('checkShamReviewLog: REVIEW-LOG absent -> no finding');
{
  const root = mkShamProject('sham-absent', { /* no reviewLog */ });
  const f = audit.checkShamReviewLog(root, { phases: audit._listPhaseDirs(root) });
  ok('no findings (no REVIEW-LOG)', f.length === 0, `got ${f.length}`);
}

section('checkShamReviewLog: non-reviewer-bearing skill -> no finding (allowlist guard)');
{
  const root = mkShamProject('sham-nonbearing',
    { reviewLog: SHAM_LOG_WITH_SHAM_REVIEWER, executeSkill: 'cp:manual/execute' });
  const f = audit.checkShamReviewLog(root, { phases: audit._listPhaseDirs(root) });
  ok('no findings (non-reviewer-bearing skill)', f.length === 0, `got ${f.length}`);
}

section('checkShamReviewLog: REVIEW-LOG present but no sham phrase -> no finding');
{
  const root = mkShamProject('sham-nophrase', {
    reviewLog: `---\nphase: "1"\n---\n\n<!-- REVIEW-LOG-ENTRIES-BELOW -->\n` +
      `## 2026-01-01 \u2014 Plan 01-01 \u2014 orchestrator (inline)\n\n**Verdict:** approved\n\n---\n`,
  });
  const f = audit.checkShamReviewLog(root, { phases: audit._listPhaseDirs(root) });
  ok('no findings (no sham phrase)', f.length === 0, `got ${f.length}`);
}

section('checkShamReviewLog: self reviewer is sham -> MEDIUM finding');
{
  const root = mkShamProject('sham-self', {
    reviewLog:
      `---\nphase: "1"\n---\n\n<!-- REVIEW-LOG-ENTRIES-BELOW -->\n` +
      `## 2026-01-01 \u2014 Plan 01-01 \u2014 self\n\n**Verdict:** approved on first pass\n\n---\n`,
  });
  const f = audit.checkShamReviewLog(root, { phases: audit._listPhaseDirs(root) });
  ok('one finding for self reviewer', f.length === 1, `got ${f.length}`);
  ok('id sham-review-log', f[0].id === 'sham-review-log');
}

section('checkShamReviewLog: zero entries (empty REVIEW-LOG) + sham phrase -> MEDIUM finding');
{
  const root = mkShamProject('sham-empty', {
    reviewLog: `---\nphase: "1"\n---\n\n<!-- REVIEW-LOG-ENTRIES-BELOW -->\n\napproved on first pass\n`,
  });
  const f = audit.checkShamReviewLog(root, { phases: audit._listPhaseDirs(root) });
  ok('one finding for empty log', f.length === 1, `got ${f.length}`);
  ok('id sham-review-log', f[0].id === 'sham-review-log');
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
