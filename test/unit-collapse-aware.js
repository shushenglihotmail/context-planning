'use strict';

/**
 * Regression tests for v0.10.1 — collapse-aware milestone close.
 *
 * Bug: `cp complete-milestone` returned `milestone-not-found` when
 * ROADMAP.md had already been collapsed into
 * `<details><summary>✅ ... SHIPPED ...</summary>...</details>` (e.g.
 * by the Superpowers writing-plans skill on the final phase's C2 commit,
 * or by a prior complete-milestone run).
 *
 * Fix: findMilestoneInRoadmap now detects <summary> lines; statusReport
 * falls back to STATE.md's `milestone:` field; completeMilestone treats
 * status:'shipped' as a clean already-shipped path (idempotent).
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execSync } = require('node:child_process');

const milestone = require('../lib/milestone');
const lifecycle = require('../lib/lifecycle');

let passed = 0;
function t(name, fn) {
  fn();
  console.log('  ✓', name);
  passed++;
}

console.log('unit-collapse-aware');

const COLLAPSED_ROADMAP = `# Roadmap

## Milestones
- ✅ **v0.16 Bug Repro** — Phases 1-1 (shipped 2026-05-21)

## Phases

<details>
<summary>✅ v0.16 Bug Repro (Phases 1-1) — SHIPPED 2026-05-21</summary>

### Phase 1: Foo

Plans:
- [x] 01-01: do thing

</details>

## Progress

`;

// ---------- findMilestoneInRoadmap collapse path ----------

t('findMilestoneInRoadmap detects collapsed <summary> milestone', () => {
  const info = milestone.findMilestoneInRoadmap(COLLAPSED_ROADMAP, 'v0.16 Bug Repro');
  assert.ok(info, 'should not be null');
  assert.equal(info.status, 'shipped');
  assert.equal(info.collapsed, true);
  assert.deepEqual(info.phases, ['1']);
});

t('findMilestoneInRoadmap still works for in-progress (### heading) path', () => {
  const r = `# r\n\n## Phases\n\n### 🚧 v0.1 X (In Progress)\n\n### Phase 1: A\n`;
  const info = milestone.findMilestoneInRoadmap(r, 'v0.1 X');
  assert.ok(info);
  assert.equal(info.status, 'in-progress');
  assert.equal(info.collapsed, false);
  assert.deepEqual(info.phases, ['1']);
});

t('findMilestoneInRoadmap tolerates em-dash variant in <summary>', () => {
  const r = COLLAPSED_ROADMAP.replace('—', '-'); // ASCII hyphen variant
  const info = milestone.findMilestoneInRoadmap(r, 'v0.16 Bug Repro');
  assert.ok(info, 'ASCII-dash variant should still match');
  assert.equal(info.status, 'shipped');
});

t('findMilestoneInRoadmap collapse path returns multi-phase range', () => {
  const r = `# r

## Phases

<details>
<summary>✅ v0.5 Multi (Phases 3-5) — SHIPPED 2026-04-01</summary>

### Phase 3: A
### Phase 4: B
### Phase 5: C

</details>
`;
  const info = milestone.findMilestoneInRoadmap(r, 'v0.5 Multi');
  assert.ok(info);
  assert.deepEqual(info.phases, ['3', '4', '5']);
});

// ---------- statusReport STATE.md fallback ----------

function mkFixture(roadmap, state) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-collapse-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email t@t', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), roadmap);
  if (state) fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'), state);
  return dir;
}
function rm(d) { fs.rmSync(d, { recursive: true, force: true }); }

t('statusReport falls back to STATE.md milestone field when no In-Progress heading', () => {
  const dir = mkFixture(COLLAPSED_ROADMAP, '# State\nmilestone: v0.16 Bug Repro\nphase: -\nplan: -\nstatus: Idle\n');
  try {
    const s = lifecycle.statusReport(dir);
    assert.equal(s.ok, true);
    assert.equal(s.milestone, 'v0.16 Bug Repro');
    assert.equal(s.milestoneStatus, 'shipped');
  } finally { rm(dir); }
});

t('statusReport ignores STATE.md milestone "-" / "Idle" placeholders', () => {
  const r = `# r\n\n## Phases\n\n`;
  const dir = mkFixture(r, '# State\nmilestone: -\nstatus: Idle\n');
  try {
    const s = lifecycle.statusReport(dir);
    assert.equal(s.milestone, null);
  } finally { rm(dir); }
});

// ---------- completeMilestone already-shipped path ----------

function mkFullFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-collapse-full-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email t@t', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-foo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), COLLAPSED_ROADMAP);
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    '# State\nmilestone: v0.16 Bug Repro\nphase: -\nplan: -\nstatus: Idle\n');
  fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), '# Project\n');
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-foo', 'PLAN.md'),
    '---\nphase: "1"\nname: Foo\nstatus: done\n---\n# Phase 1\n');
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-foo', '01-01-SUMMARY.md'),
    '---\nplan: "01-01"\nphase: "1"\ngoal: do thing\noutcome: done\nkey-decisions: ["test"]\n---\n');
  execSync('git add -A && git commit -q -m init', { cwd: dir, shell: true });
  return dir;
}

t('completeMilestone resolves collapsed milestone (no more milestone-not-found)', () => {
  const dir = mkFullFixture();
  try {
    const r = lifecycle.completeMilestone(dir, { name: 'v0.16 Bug Repro', noAudit: true });
    assert.equal(r.ok, true, `expected ok:true, got ${JSON.stringify(r)}`);
    assert.notEqual(r.reason, 'milestone-not-found');
    assert.equal(r.milestone, 'v0.16 Bug Repro');
  } finally { rm(dir); }
});

t('completeMilestone is idempotent on second call (alreadyShipped:true)', () => {
  const dir = mkFullFixture();
  try {
    const r1 = lifecycle.completeMilestone(dir, { name: 'v0.16 Bug Repro', noAudit: true });
    assert.equal(r1.ok, true);
    const r2 = lifecycle.completeMilestone(dir, { name: 'v0.16 Bug Repro', noAudit: true });
    assert.equal(r2.ok, true);
    assert.equal(r2.alreadyShipped, true);
    assert.deepEqual(r2.actions, []);
  } finally { rm(dir); }
});

t('completeMilestone STATE.md fallback resolves milestone without explicit name', () => {
  const dir = mkFullFixture();
  try {
    // No milestone name passed; should resolve via statusReport → STATE.md
    const r = lifecycle.completeMilestone(dir, { noAudit: true });
    assert.equal(r.ok, true);
    assert.equal(r.milestone, 'v0.16 Bug Repro');
  } finally { rm(dir); }
});

// ---------- v0.10.2 hotfix: defensive verify + --force ----------

// Fixture where the collapsed <summary> declares phases that DO NOT exist
// as `### Phase N` headings inside (i.e. writing-plans collapsed it but
// dropped the inner blocks, or hand-collapsed in a non-standard form).
// Pre-v0.10.2 this would hit verify, return `incomplete` with a malformed
// report missing `summariesMissing`, and the CLI would crash with
// `TypeError: Cannot read properties of undefined (reading 'join')`.
const COLLAPSED_NO_INNER_PHASES = `# Roadmap

## Phases

<details>
<summary>✅ v1.5 Same-Origin (Phases 9-12) — SHIPPED 2026-05-21</summary>

(content omitted — writing-plans variant)

</details>

## Progress
`;

t('verifyMilestoneComplete always populates summariesMissing on missing phase', () => {
  const rep = milestone.verifyMilestoneComplete(COLLAPSED_NO_INNER_PHASES, ['9', '10'], '/tmp/nonexistent');
  assert.equal(rep.ok, false);
  for (const r of rep.reports) {
    assert.ok(Array.isArray(r.summariesMissing), `summariesMissing must be array on report ${JSON.stringify(r)}`);
    assert.equal(typeof r.plansDone, 'number');
    assert.equal(typeof r.plansTotal, 'number');
  }
});

t('completeMilestone skips verify for shipped (collapsed) milestone even with no inner phases', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-v0-10-2-'));
  try {
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email t@t', { cwd: dir });
    execSync('git config user.name t', { cwd: dir });
    execSync('git config commit.gpgsign false', { cwd: dir });
    fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), COLLAPSED_NO_INNER_PHASES);
    fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
      '# State\nmilestone: v1.5 Same-Origin\nphase: -\nplan: -\nstatus: Idle\n');
    fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), '# Project\n');
    execSync('git add -A && git commit -q -m init', { cwd: dir, shell: true });

    const r = lifecycle.completeMilestone(dir, { name: 'v1.5 Same-Origin', noAudit: true });
    // Pre-v0.10.2: r.reason === 'incomplete' (and CLI would crash)
    // v0.10.2: should succeed because collapsed status is trusted
    assert.equal(r.ok, true, `expected ok:true, got ${JSON.stringify(r)}`);
    assert.notEqual(r.reason, 'incomplete');
  } finally { rm(dir); }
});

t('completeMilestone --force bypasses verify for in-progress milestone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-v0-10-2-force-'));
  try {
    fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-foo'), { recursive: true });
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email t@t', { cwd: dir });
    execSync('git config user.name t', { cwd: dir });
    execSync('git config commit.gpgsign false', { cwd: dir });
    // In-progress milestone with UNTICKED plan and NO summary
    const INPROGRESS = `# r\n\n## Phases\n\n### 🚧 v0.9 X (In Progress)\n\n### Phase 1: Foo\n\nPlans:\n- [ ] 01-01: untouched\n`;
    fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), INPROGRESS);
    fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
      '# State\nmilestone: v0.9 X\nphase: 1\nplan: 01-01\nstatus: in-progress\n');
    fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), '# Project\n');
    fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-foo', 'PLAN.md'),
      '---\nphase: "1"\nname: Foo\n---\n# P\n');
    execSync('git add -A && git commit -q -m init', { cwd: dir, shell: true });

    // Without --force: blocks with incomplete
    const r1 = lifecycle.completeMilestone(dir, { name: 'v0.9 X', noAudit: true, dryRun: true });
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, 'incomplete');

    // With --force: bypasses verify
    const r2 = lifecycle.completeMilestone(dir, { name: 'v0.9 X', noAudit: true, force: true, dryRun: true });
    assert.equal(r2.ok, true, `expected --force to bypass verify, got ${JSON.stringify(r2)}`);
  } finally { rm(dir); }
});

// ---------- v0.10.3 hotfix: collapse-aware audit + shipped status renderer ----------

const roadmap = require('../lib/roadmap');

t('findMilestoneInRoadmap expands integer Phase X-Y range fully', () => {
  const r = `# r\n\n## Phases\n\n<details>\n<summary>✅ v1.5 Same-Origin (Phases 14-16) — SHIPPED 2026-05-21</summary>\n\n(flattened)\n\n</details>\n`;
  const info = milestone.findMilestoneInRoadmap(r, 'v1.5 Same-Origin');
  assert.ok(info, 'should find collapsed milestone');
  assert.deepEqual(info.phases, ['14', '15', '16'], 'should expand 14-16 not just endpoints');
});

t('roadmap.listCollapsedPhaseNums returns all integer phases in collapsed range', () => {
  const r = `# r\n\n<details>\n<summary>✅ v1 (Phases 1-3) — SHIPPED 2026-01-01</summary>\n</details>\n\n<details>\n<summary>✅ v2 (Phases 5-7) — SHIPPED 2026-02-01</summary>\n</details>\n`;
  const got = roadmap.listCollapsedPhaseNums(r).sort();
  assert.deepEqual(got, ['1', '2', '3', '5', '6', '7']);
});

t('roadmap.listCollapsedPhaseNums returns [] when no collapsed milestones', () => {
  const r = `# r\n\n### 🚧 v0.1 X (In Progress)\n\n### Phase 1: Foo\n`;
  assert.deepEqual(roadmap.listCollapsedPhaseNums(r), []);
});

t('audit.phase-no-roadmap respects collapsed milestone ranges', () => {
  const audit = require('../lib/audit');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-v0-10-3-audit-'));
  try {
    fs.mkdirSync(path.join(dir, '.planning', 'phases', '14-foo'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.planning', 'phases', '15-bar'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.planning', 'phases', '16-baz'), { recursive: true });
    // ROADMAP: v1.5 is collapsed with NO inner ### Phase headings (writing-plans flat form)
    const COLLAPSED = `# r\n\n## Phases\n\n<details>\n<summary>✅ v1.5 (Phases 14-16) — SHIPPED 2026-05-21</summary>\n\n(flattened)\n\n</details>\n`;
    fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), COLLAPSED);
    fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), '# Project\n');
    // Each phase needs a PLAN.md to count as a phase dir
    for (const p of ['14-foo', '15-bar', '16-baz']) {
      const n = p.split('-')[0];
      fs.writeFileSync(path.join(dir, '.planning', 'phases', p, 'PLAN.md'),
        `---\nphase: "${Number(n)}"\nname: ${p}\n---\n# Plan\n`);
    }

    const result = audit.runAudit(dir);
    const orphans = result.findings.filter(f => f.id === 'phase-no-roadmap');
    assert.equal(orphans.length, 0,
      `expected no phase-no-roadmap findings for collapsed range; got: ${orphans.map(f => f.message).join('; ')}`);
  } finally { rm(dir); }
});

t('status renderer: shipped milestone suggests new-milestone not complete-milestone', () => {
  // Spawn cp status against a fixture with a shipped milestone in STATE.md
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-v0-10-3-status-'));
  try {
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
      `# r\n\n## Phases\n\n<details>\n<summary>✅ v1.5 (Phases 1-1) — SHIPPED 2026-05-21</summary>\n\n### Phase 1: A\n\nPlans:\n- [x] 01-01: done\n\n</details>\n`);
    fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
      '# State\nmilestone: v1.5\nphase: -\nplan: -\nstatus: Idle\n');
    fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), '# Project\n');

    const cpBin = path.resolve(__dirname, '..', 'bin', 'cp.js');
    const out = execSync(`node "${cpBin}" status`, { cwd: dir, encoding: 'utf8' });
    assert.match(out, /\[shipped\]/, 'should mark milestone as shipped');
    assert.doesNotMatch(out, /Run.*cp complete-milestone/i,
      `should NOT suggest complete-milestone for shipped; got:\n${out}`);
    assert.match(out, /new-milestone/, 'should suggest new-milestone');
  } finally { rm(dir); }
});

// ---------- v1.5 hotfix: verify accepts phase-level SUMMARY.md (no plan checkboxes) ----------

const V15_ROADMAP = `# Roadmap

## Phases

### 🚧 v1.5 X (In Progress)

### Phase 70: Atomic phase one

### Phase 71: Atomic phase two
`;

t('verifyMilestoneComplete: v1.5 shape (0 plans) passes with phase-level SUMMARY.md', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-v15-verify-ok-'));
  try {
    fs.mkdirSync(path.join(dir, '.planning', 'phases', '70-atomic-phase-one'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.planning', 'phases', '71-atomic-phase-two'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.planning', 'phases', '70-atomic-phase-one', 'SUMMARY.md'),
      '---\nphase: 70\ntype: summary\n---\n# Phase 70 SUMMARY\n');
    fs.writeFileSync(path.join(dir, '.planning', 'phases', '71-atomic-phase-two', 'SUMMARY.md'),
      '---\nphase: 71\ntype: summary\n---\n# Phase 71 SUMMARY\n');
    const rep = milestone.verifyMilestoneComplete(V15_ROADMAP, ['70', '71'], dir);
    assert.equal(rep.ok, true, `expected ok=true, got ${JSON.stringify(rep)}`);
    for (const r of rep.reports) {
      assert.equal(r.plansTotal, 0);
      assert.equal(r.plansDone, 0);
      assert.equal(r.phaseSummaryPresent, true);
      assert.equal(r.ok, true);
    }
  } finally { rm(dir); }
});

t('verifyMilestoneComplete: v1.5 shape (0 plans) fails when phase-level SUMMARY.md is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-v15-verify-fail-'));
  try {
    fs.mkdirSync(path.join(dir, '.planning', 'phases', '70-atomic-phase-one'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.planning', 'phases', '71-atomic-phase-two'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.planning', 'phases', '70-atomic-phase-one', 'SUMMARY.md'),
      '---\nphase: 70\ntype: summary\n---\n# Phase 70 SUMMARY\n');
    const rep = milestone.verifyMilestoneComplete(V15_ROADMAP, ['70', '71'], dir);
    assert.equal(rep.ok, false);
    const r70 = rep.reports.find(r => r.phaseNum === '70');
    const r71 = rep.reports.find(r => r.phaseNum === '71');
    assert.equal(r70.ok, true);
    assert.equal(r70.phaseSummaryPresent, true);
    assert.equal(r71.ok, false);
    assert.equal(r71.phaseSummaryPresent, false);
  } finally { rm(dir); }
});

console.log(`unit-collapse-aware: ${passed} passed`);
process.exit(0);
