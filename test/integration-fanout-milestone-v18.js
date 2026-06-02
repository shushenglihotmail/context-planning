'use strict';

/**
 * Integration test for v1.8.2 Bug G — end-to-end milestone fan-out via
 * materialize:roadmap-phases.
 *
 * Exercises:
 *   startRun (milestone binding) → markPhaseComplete(setup) →
 *   markPhaseComplete(propose, structured-list JSON) →
 *   ROADMAP child scaffolding → child-wave dispatch → finalize → done.
 *
 * Scenarios:
 *   1. End-to-end happy path with 2 items.
 *   2. enforceChildCount rejects empty items array.
 *   3. Idempotency — second propose mark cannot double-scaffold.
 *   4. resumeRun after fanout returns the same child-wave instruction.
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('yaml');

const runtime = require('../lib/runtime');
const paths = require('../lib/paths');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
    passed++;
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err && err.message ? err.message : String(err)}`);
    console.log('  ✗', name);
  }
}

/**
 * Spin up an isolated git project directory with the minimal .planning
 * scaffolding that runtime.js and lifecycle.js expect.
 */
function freshProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-fanout-ms-v18-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@local'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  spawnSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });

  fs.writeFileSync(
    path.join(dir, '.planning', 'PROJECT.md'),
    '# Test Project\n\n## Constraints\n\n- Constraint A\n- Constraint B\n',
  );
  fs.writeFileSync(
    path.join(dir, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Validated Requirements\n\n## Active Requirements\n\n## Phases\n',
  );
  fs.writeFileSync(
    path.join(dir, '.planning', 'STATE.md'),
    '# State\n\n## Current Position\n\nPhase: -\nPlan: -\nStatus: Idle\n' +
    'Current focus: -\nLast activity: -\n\nProgress: [░░░░░░░░░░] 0%\n',
  );

  spawnSync('git', ['add', '.'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

/**
 * Mini milestone fixture for v1.8.2 fan-out tests:
 *   setup (kind:scaffold) → propose (materialize:roadmap-phases)
 *     ↳ write-child (parent:propose)
 *     ↳ review-child (parent:propose, after:[write-child])
 *   finalize (kind:scaffold, depends_on:[propose])
 *
 * All phases are workflow-meta so startRun scaffolds ZERO ROADMAP entries.
 * The fanout from propose creates the real ROADMAP entries at mark-complete time.
 */
const FIXTURE_YAML = [
  'workflow: mini-milestone-v18',
  'version: 1',
  'binds_to: milestone',
  'phases:',
  '  - phase:',
  '      id: setup',
  '      description: Setup the milestone.',
  '      kind: scaffold',
  '      command: "echo setup"',
  '  - phase:',
  '      id: propose',
  '      description: Decompose milestone into items.',
  '      materialize: roadmap-phases',
  '      min_children: 1',
  '      max_children: 3',
  '      depends_on: [setup]',
  '      prompt: |',
  '        Decompose the milestone into items.',
  '  - phase:',
  '      id: write-child',
  '      description: Implement child item.',
  '      parent: propose',
  '      prompt: |',
  '        Implement the child item.',
  '  - phase:',
  '      id: review-child',
  '      description: Review child item.',
  '      parent: propose',
  '      after: [write-child]',
  '      prompt: |',
  '        Review the child item.',
  '  - phase:',
  '      id: finalize',
  '      description: Finalize the milestone.',
  '      kind: scaffold',
  '      depends_on: [propose]',
  '      command: "echo finalize"',
].join('\n') + '\n';

/**
 * Write the fixture YAML into dir and return its absolute path.
 * loadTemplate accepts an absolute path directly.
 */
function writeFixture(dir) {
  const fixturePath = path.join(dir, 'mini-milestone-v18.yaml');
  fs.writeFileSync(fixturePath, FIXTURE_YAML);
  return fixturePath;
}

/**
 * Build a structured-list summary string containing a fenced JSON block,
 * as the supervisor agent would emit after the propose phase.
 */
function fanoutSummary(items) {
  return (
    'Decomposition complete.\n\n```json\n' +
    JSON.stringify({ optimizable: false, items }, null, 2) +
    '\n```\n'
  );
}

const TWO_ITEMS = [
  { id: 'feat-a', title: 'Feature A', summary: 'Build A.' },
  { id: 'feat-b', title: 'Feature B', summary: 'Build B.' },
];

console.log('integration-fanout-milestone-v18');

// ============================================================
// Scenario 1: End-to-end happy path with 2 items
// ============================================================
console.log('\n=== Scenario 1: end-to-end happy path ===');

{
  const dir = freshProject();
  const fixturePath = writeFixture(dir);
  const slug = paths.milestoneSlug('Test Mini Milestone');

  let startResult;
  check('startRun: returns milestone binding', () => {
    startResult = runtime.startRun(fixturePath, {
      projectDir: dir,
      name: 'Test Mini Milestone',
    });
    assert.strictEqual(startResult.binding, 'milestone', startResult.binding);
  });

  check('startRun: firstInstruction mentions setup', () => {
    assert.ok(
      startResult.firstInstruction && /setup/.test(startResult.firstInstruction),
      `firstInstruction: ${startResult.firstInstruction && startResult.firstInstruction.slice(0, 200)}`,
    );
  });

  check('startRun: NO phase dirs scaffolded (all phases are meta-phases)', () => {
    const phasesDir = path.join(dir, '.planning', 'phases');
    const entries = fs.existsSync(phasesDir) ? fs.readdirSync(phasesDir) : [];
    assert.strictEqual(entries.length, 0, `expected 0 phase dirs, found: ${entries.join(', ')}`);
  });

  check('startRun: RUN.yaml phaseNumByPhaseId has no entries (all meta)', () => {
    const runYamlPath = path.join(dir, '.planning', 'milestones', slug, 'RUN.yaml');
    const runState = yaml.parse(fs.readFileSync(runYamlPath, 'utf8'));
    const ids = Object.keys(runState.phaseNumByPhaseId || {});
    assert.strictEqual(ids.length, 0, `unexpected ids: ${ids.join(', ')}`);
  });

  let setupResult;
  check('markPhaseComplete(setup): nextInstruction mentions propose', () => {
    setupResult = runtime.markPhaseComplete(slug, 'setup', 'Setup done.', {
      projectDir: dir,
    });
    assert.ok(
      setupResult.nextInstruction && /propose/.test(setupResult.nextInstruction),
      `nextInstruction: ${setupResult.nextInstruction && setupResult.nextInstruction.slice(0, 200)}`,
    );
  });

  check('markPhaseComplete(setup): propose instruction has structured-list contract header', () => {
    assert.ok(
      setupResult.nextInstruction &&
        /Output format \(structured list\)/.test(setupResult.nextInstruction),
      'Missing "## Output format (structured list)" in propose instruction',
    );
  });

  check('markPhaseComplete(setup): propose instruction contains "optimizable"', () => {
    assert.ok(
      setupResult.nextInstruction && /optimizable/.test(setupResult.nextInstruction),
      'Missing "optimizable" in propose instruction',
    );
  });

  let proposeResult;
  const FANOUT_SUMMARY = fanoutSummary(TWO_ITEMS);

  check('markPhaseComplete(propose): fanout scaffolds exactly 2 phase dirs', () => {
    proposeResult = runtime.markPhaseComplete(slug, 'propose', FANOUT_SUMMARY, {
      projectDir: dir,
    });
    const phasesDir = path.join(dir, '.planning', 'phases');
    const entries = fs.existsSync(phasesDir) ? fs.readdirSync(phasesDir) : [];
    assert.strictEqual(entries.length, 2, `expected 2 phase dirs, found: ${entries.join(', ')}`);
  });

  check('markPhaseComplete(propose): feat-a phase dir has PLAN.md with title and summary', () => {
    // feat-a is first; nextPhaseNum starts at 1 (no existing dirs)
    const phaseDirA = paths.findPhaseDir('1', dir);
    assert.ok(phaseDirA, 'phase dir for feat-a (num=1) not found');
    const planContent = fs.readFileSync(path.join(phaseDirA, 'PLAN.md'), 'utf8');
    assert.ok(/Feature A/.test(planContent), `PLAN.md missing title: ${planContent}`);
    assert.ok(/Build A/.test(planContent), `PLAN.md missing summary: ${planContent}`);
  });

  check('markPhaseComplete(propose): feat-b phase dir has PLAN.md with title and summary', () => {
    const phaseDirB = paths.findPhaseDir('2', dir);
    assert.ok(phaseDirB, 'phase dir for feat-b (num=2) not found');
    const planContent = fs.readFileSync(path.join(phaseDirB, 'PLAN.md'), 'utf8');
    assert.ok(/Feature B/.test(planContent), `PLAN.md missing title: ${planContent}`);
    assert.ok(/Build B/.test(planContent), `PLAN.md missing summary: ${planContent}`);
  });

  check('markPhaseComplete(propose): RUN.yaml has phaseNumByPhaseId for feat-a and feat-b', () => {
    const runYamlPath = path.join(dir, '.planning', 'milestones', slug, 'RUN.yaml');
    const runState = yaml.parse(fs.readFileSync(runYamlPath, 'utf8'));
    assert.ok(runState.phaseNumByPhaseId, 'phaseNumByPhaseId missing from RUN.yaml');
    assert.strictEqual(
      typeof runState.phaseNumByPhaseId['feat-a'], 'number',
      `feat-a missing: ${JSON.stringify(runState.phaseNumByPhaseId)}`,
    );
    assert.strictEqual(
      typeof runState.phaseNumByPhaseId['feat-b'], 'number',
      `feat-b missing: ${JSON.stringify(runState.phaseNumByPhaseId)}`,
    );
  });

  check('markPhaseComplete(propose): nextInstruction dispatches write-child::feat-a wave', () => {
    assert.ok(
      proposeResult.nextInstruction &&
        /write-child::feat-a/.test(proposeResult.nextInstruction),
      `nextInstruction: ${proposeResult.nextInstruction && proposeResult.nextInstruction.slice(0, 300)}`,
    );
  });

  check('full run: child waves + finalize complete with doneAfter: true', () => {
    // Array-mode, 2 items: write-child→review-child for each item in sequence,
    // then finalize (subtree-wait on all propose children).
    runtime.markPhaseComplete(slug, 'write-child::feat-a', 'Write A done.', { projectDir: dir });
    runtime.markPhaseComplete(slug, 'review-child::feat-a', 'Review A done.', { projectDir: dir });
    runtime.markPhaseComplete(slug, 'write-child::feat-b', 'Write B done.', { projectDir: dir });
    runtime.markPhaseComplete(slug, 'review-child::feat-b', 'Review B done.', { projectDir: dir });
    const finalizeResult = runtime.markPhaseComplete(slug, 'finalize', 'Finalize done.', {
      projectDir: dir,
    });
    assert.strictEqual(finalizeResult.doneAfter, true, 'expected doneAfter: true after finalize');
    assert.strictEqual(finalizeResult.nextInstruction, null);
  });
}

// ============================================================
// Scenario 2: enforceChildCount — empty items array is rejected
// ============================================================
console.log('\n=== Scenario 2: enforceChildCount bounds ===');

{
  const dir = freshProject();
  const fixturePath = writeFixture(dir);
  const slug = paths.milestoneSlug('Empty Items Test');

  runtime.startRun(fixturePath, { projectDir: dir, name: 'Empty Items Test' });
  runtime.markPhaseComplete(slug, 'setup', 'Setup done.', { projectDir: dir });

  check('enforceChildCount: empty items array throws below min_children', () => {
    const emptySummary = fanoutSummary([]);
    assert.throws(
      () => runtime.markPhaseComplete(slug, 'propose', emptySummary, { projectDir: dir }),
      /below min_children/,
    );
  });
}

// ============================================================
// Scenario 3: Idempotency — second markPhaseComplete(propose) cannot double-scaffold
// ============================================================
console.log('\n=== Scenario 3: idempotency ===');

{
  const dir = freshProject();
  const fixturePath = writeFixture(dir);
  const slug = paths.milestoneSlug('Idempotent Test');

  runtime.startRun(fixturePath, { projectDir: dir, name: 'Idempotent Test' });
  runtime.markPhaseComplete(slug, 'setup', 'Setup done.', { projectDir: dir });

  const SUMMARY = fanoutSummary(TWO_ITEMS);
  runtime.markPhaseComplete(slug, 'propose', SUMMARY, { projectDir: dir });

  check('idempotency: second propose call throws (wave already advanced)', () => {
    const phasesDir = path.join(dir, '.planning', 'phases');
    const dirsBefore = fs.readdirSync(phasesDir).length;
    assert.strictEqual(dirsBefore, 2, 'expected 2 phase dirs from first fanout');

    let threw = false;
    try {
      runtime.markPhaseComplete(slug, 'propose', SUMMARY, { projectDir: dir });
    } catch (_e) {
      threw = true;
    }
    assert.ok(threw, 'second markPhaseComplete(propose) should throw (not in current wave)');

    const dirsAfter = fs.readdirSync(phasesDir).length;
    assert.strictEqual(
      dirsAfter,
      dirsBefore,
      'dir count must not increase on second (rejected) propose mark',
    );
  });
}

// ============================================================
// Scenario 4: resumeRun preserves fanout state and returns child-wave instruction
// ============================================================
console.log('\n=== Scenario 4: resumeRun preserves fanout ===');

{
  const dir = freshProject();
  const fixturePath = writeFixture(dir);
  const slug = paths.milestoneSlug('Resume Fanout Test');

  runtime.startRun(fixturePath, { projectDir: dir, name: 'Resume Fanout Test' });
  runtime.markPhaseComplete(slug, 'setup', 'Setup done.', { projectDir: dir });
  const proposeResult = runtime.markPhaseComplete(
    slug, 'propose', fanoutSummary(TWO_ITEMS), { projectDir: dir },
  );

  check('resumeRun: after fanout, instruction mentions write-child::feat-a', () => {
    const resumed = runtime.resumeRun(slug, { projectDir: dir });
    assert.ok(
      resumed.instruction && /write-child::feat-a/.test(resumed.instruction),
      `resumed instruction: ${resumed.instruction && resumed.instruction.slice(0, 300)}`,
    );
  });

  check('resumeRun: instruction matches proposeResult.nextInstruction exactly', () => {
    const resumed = runtime.resumeRun(slug, { projectDir: dir });
    assert.strictEqual(resumed.instruction, proposeResult.nextInstruction);
  });
}

// ============================================================
// Results
// ============================================================
console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exitCode = 1;
}
