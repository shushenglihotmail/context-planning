'use strict';

/**
 * Unit tests for lib/runtime-fanout.js — v1.2 runtime fan-out contract helpers.
 */

const assert = require('node:assert/strict');

const { buildParentPrompt, parseParentOutput, enforceChildCount, resolveItemOrder } = require('../lib/runtime-fanout');
const { formatInstruction } = require('../lib/runtime');

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

function phase(overrides) {
  return Object.assign({ id: 'parent', depends_on: [], status: 'pending' }, overrides || {});
}

function responseFor(obj) {
  return 'Agent notes before the contract.\n```json\n' + JSON.stringify(obj, null, 2) + '\n```\n';
}

function items(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `item-${index + 1}`, title: `Item ${index + 1}` }));
}

console.log('unit-runtime-fanout');

// buildParentPrompt (6)
check('buildParentPrompt includes basePrompt verbatim at the start', () => {
  const basePrompt = 'Do the parent work.\nKeep this exact.';
  assert.ok(buildParentPrompt(phase({ min_children: 2, max_children: 4 }), basePrompt).startsWith(basePrompt));
});

check('buildParentPrompt includes min and max values from the phase', () => {
  const prompt = buildParentPrompt(phase({ min_children: 2, max_children: 5 }), 'Base');
  assert.ok(prompt.includes('Produce between 2 and 5 items.'));
  assert.ok(prompt.includes('between 2 and 5'));
});

check('buildParentPrompt defaults min=1 when phase.min_children is missing', () => {
  const prompt = buildParentPrompt(phase({ max_children: 7 }), 'Base');
  assert.ok(prompt.includes('Produce between 1 and 7 items.'));
});

check('buildParentPrompt defaults max=10 when phase.max_children is missing', () => {
  const prompt = buildParentPrompt(phase({ min_children: 3 }), 'Base');
  assert.ok(prompt.includes('Produce between 3 and 10 items.'));
});

check('buildParentPrompt includes the fenced json template literal', () => {
  const prompt = buildParentPrompt(phase({ min_children: 1, max_children: 2 }), 'Base');
  assert.ok(prompt.includes('```json\n{\n  "optimizable"'));
  assert.ok(prompt.includes('"items"'));
});

check('buildParentPrompt output is a string', () => {
  assert.strictEqual(typeof buildParentPrompt(phase(), 'Base'), 'string');
});

check('buildParentPrompt explains array-order default and depends_on rule', () => {
  const prompt = buildParentPrompt(phase({ min_children: 1, max_children: 5 }), 'Base');
  assert.ok(prompt.includes('safe default is sequential execution'));
  assert.ok(prompt.includes('optimizable'));
  assert.ok(prompt.includes('depends_on'));
  assert.ok(prompt.includes('Cycles, self-references'));
});

// parseParentOutput (12)
check('parseParentOutput parses a clean response with one fenced JSON block', () => {
  assert.deepStrictEqual(
    parseParentOutput(responseFor({ items: [{ id: 'one', title: 'One' }] })),
    { optimizable: false, items: [{ id: 'one', title: 'One' }] },
  );
});

check('parseParentOutput picks the LAST JSON block when multiple are present', () => {
  const response = responseFor({ items: [{ id: 'first', title: 'First' }] }) + '\nLater answer:\n' + responseFor({ items: [{ id: 'last', title: 'Last' }] });
  assert.deepStrictEqual(
    parseParentOutput(response),
    { optimizable: false, items: [{ id: 'last', title: 'Last' }] },
  );
});

check('parseParentOutput throws when no fenced block found', () => {
  assert.throws(() => parseParentOutput('{ "items": [] }'), /no fenced JSON block/);
});

check('parseParentOutput throws on invalid JSON', () => {
  assert.throws(() => parseParentOutput('```json\n{ not-json }\n```'), /failed to parse JSON/);
});

check("parseParentOutput throws when 'items' is missing", () => {
  assert.throws(() => parseParentOutput(responseFor({ itemz: [] })), /parsed JSON missing 'items' array/);
});

check("parseParentOutput throws when 'items' is not an array", () => {
  assert.throws(() => parseParentOutput(responseFor({ items: { id: 'one' } })), /parsed JSON missing 'items' array/);
});

check('parseParentOutput throws when item is missing id', () => {
  assert.throws(() => parseParentOutput(responseFor({ items: [{ title: 'No id' }] })), /item at index 0 has invalid id 'undefined'/);
});

check('parseParentOutput throws when item id has uppercase, spaces, or invalid chars', () => {
  for (const id of ['Upper', 'has space', 'bad_id']) {
    assert.throws(() => parseParentOutput(responseFor({ items: [{ id, title: 'Bad id' }] })), /item at index 0 has invalid id/);
  }
});

check('parseParentOutput throws when item is missing title', () => {
  assert.throws(() => parseParentOutput(responseFor({ items: [{ id: 'no-title' }] })), /item at index 0 missing 'title'/);
});

check('parseParentOutput throws on duplicate ids', () => {
  assert.throws(() => parseParentOutput(responseFor({ items: [{ id: 'same', title: 'One' }, { id: 'same', title: 'Two' }] })), /duplicate item id 'same'/);
});

check('parseParentOutput accepts an empty items array', () => {
  assert.deepStrictEqual(parseParentOutput(responseFor({ items: [] })), { optimizable: false, items: [] });
});

check('parseParentOutput preserves extra fields on items verbatim', () => {
  const extraItem = { id: 'with-extra', title: 'Extra', summary: 'S', priority: 3, nested: { keep: true } };
  assert.deepStrictEqual(
    parseParentOutput(responseFor({ items: [extraItem] })),
    { optimizable: false, items: [extraItem] },
  );
});

check('parseParentOutput accepts depends_on as empty array', () => {
  const parsed = parseParentOutput(responseFor({ items: [{ id: 'a', title: 'A', depends_on: [] }] }));
  assert.deepStrictEqual(parsed.items[0].depends_on, []);
});

check('parseParentOutput accepts depends_on with sibling ids', () => {
  const parsed = parseParentOutput(responseFor({
    items: [
      { id: 'a', title: 'A', depends_on: [] },
      { id: 'b', title: 'B', depends_on: ['a'] },
    ],
  }));
  assert.deepStrictEqual(parsed.items[1].depends_on, ['a']);
});

check('parseParentOutput throws when depends_on is not an array', () => {
  assert.throws(
    () => parseParentOutput(responseFor({ items: [{ id: 'a', title: 'A', depends_on: 'b' }] })),
    /item at index 0 \('a'\) depends_on must be an array/,
  );
});

check('parseParentOutput throws when depends_on contains a non-string entry', () => {
  assert.throws(
    () => parseParentOutput(responseFor({ items: [{ id: 'a', title: 'A', depends_on: ['b', 2] }] })),
    /item at index 0 \('a'\) depends_on\[1\] must be a string/,
  );
});

// enforceChildCount (5)
check('enforceChildCount passes when items.length is between min and max (bare items)', () => {
  const parsedItems = items(2);
  assert.strictEqual(enforceChildCount(phase({ min_children: 1, max_children: 3 }), parsedItems), parsedItems);
});

check('enforceChildCount throws when below min with phase id, count, and min', () => {
  assert.throws(() => enforceChildCount(phase({ id: 'parent-a', min_children: 2, max_children: 5 }), items(1)), /phase 'parent-a' produced 1 items, below min_children \(2\)/);
});

check('enforceChildCount throws when above max with phase id, count, and max', () => {
  assert.throws(() => enforceChildCount(phase({ id: 'parent-b', min_children: 1, max_children: 2 }), items(3)), /phase 'parent-b' produced 3 items, above max_children \(2\)/);
});

check('enforceChildCount defaults min=1 when missing', () => {
  assert.throws(() => enforceChildCount(phase({ max_children: 2 }), []), /below min_children \(1\)/);
});

check('enforceChildCount defaults max=10 when missing', () => {
  assert.throws(() => enforceChildCount(phase({ min_children: 1 }), items(11)), /above max_children \(10\)/);
});

check('enforceChildCount accepts the {optimizable, items} object shape too', () => {
  const obj = { optimizable: true, items: items(2) };
  assert.strictEqual(enforceChildCount(phase({ min_children: 1, max_children: 3 }), obj), obj);
  assert.throws(
    () => enforceChildCount(phase({ id: 'p', min_children: 3, max_children: 5 }), { optimizable: true, items: items(2) }),
    /phase 'p' produced 2 items, below min_children \(3\)/,
  );
});

// End-to-end (2)
check('parseParentOutput + enforceChildCount chain works on a happy-path response', () => {
  const parsed = enforceChildCount(phase({ min_children: 1, max_children: 2 }), parseParentOutput(responseFor({ items: [{ id: 'one', title: 'One' }] })));
  assert.deepStrictEqual(parsed, { optimizable: false, items: [{ id: 'one', title: 'One' }] });
});

check('response with 21 items and max=20 fails at enforceChildCount, not parse', () => {
  const parsed = parseParentOutput(responseFor({ items: items(21) }));
  assert.strictEqual(parsed.items.length, 21);
  assert.throws(() => enforceChildCount(phase({ max_children: 20 }), parsed), /above max_children \(20\)/);
});

// resolveItemOrder (optimizable contract)
check('resolveItemOrder returns array mode on empty items', () => {
  assert.deepStrictEqual(resolveItemOrder([]), { mode: 'array' });
  assert.deepStrictEqual(resolveItemOrder({ optimizable: true, items: [] }), { mode: 'array' });
});

check('resolveItemOrder bare items array → array mode regardless of deps', () => {
  assert.deepStrictEqual(
    resolveItemOrder([{ id: 'a', title: 'A', depends_on: [] }, { id: 'b', title: 'B', depends_on: ['a'] }]),
    { mode: 'array' },
  );
});

check('resolveItemOrder {optimizable: false} → array mode (deps ignored)', () => {
  assert.deepStrictEqual(
    resolveItemOrder({
      optimizable: false,
      items: [
        { id: 'a', title: 'A', depends_on: [] },
        { id: 'b', title: 'B', depends_on: ['a'] },
      ],
    }),
    { mode: 'array' },
  );
});

check('resolveItemOrder missing optimizable defaults to array mode', () => {
  assert.deepStrictEqual(
    resolveItemOrder({
      items: [
        { id: 'a', title: 'A', depends_on: [] },
        { id: 'b', title: 'B', depends_on: ['a'] },
      ],
    }),
    { mode: 'array' },
  );
});

check('resolveItemOrder {optimizable: true} → dag mode when every item declares deps', () => {
  const result = resolveItemOrder({
    optimizable: true,
    items: [
      { id: 'a', title: 'A', depends_on: [] },
      { id: 'b', title: 'B', depends_on: ['a'] },
    ],
  });
  assert.strictEqual(result.mode, 'dag');
  assert.deepStrictEqual(result.order, ['a', 'b']);
});

check('resolveItemOrder {optimizable: true} treats missing depends_on as []', () => {
  const result = resolveItemOrder({
    optimizable: true,
    items: [
      { id: 'a', title: 'A' },                            // no depends_on → []
      { id: 'b', title: 'B', depends_on: ['a'] },
      { id: 'c', title: 'C' },                            // no depends_on → []
    ],
  });
  assert.strictEqual(result.mode, 'dag');
  assert.strictEqual(result.order[0], 'a');
  assert.ok(result.order.indexOf('a') < result.order.indexOf('b'));
  assert.ok(result.order.includes('c'));
});

check('resolveItemOrder {optimizable: true} all-empty deps → all parallel (dag, input order)', () => {
  const result = resolveItemOrder({
    optimizable: true,
    items: [
      { id: 'a', title: 'A', depends_on: [] },
      { id: 'b', title: 'B', depends_on: [] },
      { id: 'c', title: 'C', depends_on: [] },
    ],
  });
  assert.strictEqual(result.mode, 'dag');
  assert.deepStrictEqual(result.order, ['a', 'b', 'c']);
});

check('resolveItemOrder {optimizable: true} topo-sorts a diamond', () => {
  const result = resolveItemOrder({
    optimizable: true,
    items: [
      { id: 'a', title: 'A', depends_on: [] },
      { id: 'b', title: 'B', depends_on: ['a'] },
      { id: 'c', title: 'C', depends_on: ['a'] },
      { id: 'd', title: 'D', depends_on: ['b', 'c'] },
    ],
  });
  assert.strictEqual(result.mode, 'dag');
  assert.strictEqual(result.order[0], 'a');
  assert.strictEqual(result.order[3], 'd');
});

check('resolveItemOrder {optimizable: true} self-loop throws', () => {
  assert.throws(
    () => resolveItemOrder({ optimizable: true, items: [{ id: 'a', title: 'A', depends_on: ['a'] }] }),
    /item 'a' depends on itself/,
  );
});

check('resolveItemOrder {optimizable: true} unknown id throws', () => {
  assert.throws(
    () => resolveItemOrder({
      optimizable: true,
      items: [
        { id: 'a', title: 'A', depends_on: [] },
        { id: 'b', title: 'B', depends_on: ['missing'] },
      ],
    }),
    /item 'b' depends_on references unknown id 'missing'/,
  );
});

check('resolveItemOrder {optimizable: true} 2-node cycle throws', () => {
  assert.throws(
    () => resolveItemOrder({
      optimizable: true,
      items: [
        { id: 'a', title: 'A', depends_on: ['b'] },
        { id: 'b', title: 'B', depends_on: ['a'] },
      ],
    }),
    /cycle detected among items/,
  );
});

check('resolveItemOrder {optimizable: false} silently ignores invalid deps (no throw)', () => {
  assert.deepStrictEqual(
    resolveItemOrder({
      optimizable: false,
      items: [
        { id: 'a', title: 'A', depends_on: ['nonexistent'] },
        { id: 'b', title: 'B', depends_on: ['b'] },          // self-ref ignored
      ],
    }),
    { mode: 'array' },
  );
});

check('resolveItemOrder dag mode is stable: input order wins ties', () => {
  const result = resolveItemOrder({
    optimizable: true,
    items: [
      { id: 'first', title: '1', depends_on: [] },
      { id: 'second', title: '2', depends_on: [] },
      { id: 'third', title: '3', depends_on: [] },
    ],
  });
  assert.deepStrictEqual(result.order, ['first', 'second', 'third']);
});

// parseParentOutput optimizable field
check('parseParentOutput accepts optimizable: true', () => {
  const parsed = parseParentOutput(responseFor({ optimizable: true, items: [{ id: 'a', title: 'A' }] }));
  assert.strictEqual(parsed.optimizable, true);
});

check('parseParentOutput accepts optimizable: false', () => {
  const parsed = parseParentOutput(responseFor({ optimizable: false, items: [{ id: 'a', title: 'A' }] }));
  assert.strictEqual(parsed.optimizable, false);
});

check('parseParentOutput defaults optimizable to false when missing', () => {
  const parsed = parseParentOutput(responseFor({ items: [{ id: 'a', title: 'A' }] }));
  assert.strictEqual(parsed.optimizable, false);
});

check('parseParentOutput rejects non-boolean optimizable', () => {
  assert.throws(
    () => parseParentOutput(responseFor({ optimizable: 'yes', items: [{ id: 'a', title: 'A' }] })),
    /'optimizable' must be a boolean/,
  );
  assert.throws(
    () => parseParentOutput(responseFor({ optimizable: 1, items: [{ id: 'a', title: 'A' }] })),
    /'optimizable' must be a boolean/,
  );
});

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exitCode = 1;
}

// formatInstruction materialize:roadmap-phases augmentation (2)
console.log('\nformatInstruction fan-out contract augmentation');

function minimalTemplate() {
  return { meta: { workflow: 'test', version: 1, binds_to: 'custom' }, principles: [], defaults: {}, phases: [] };
}

check('formatInstruction augments materialize:roadmap-phases parent with fan-out contract', () => {
  const tpl = minimalTemplate();
  const parentPhase = { id: 'decompose', prompt: 'Decompose into items.', materialize: 'roadmap-phases', parent: null };
  const wave = [parentPhase];
  const result = formatInstruction(tpl, wave, 0, { slug: 'test-run', totalWaves: 1, silenceWarnings: true });
  assert.ok(result.includes('Decompose into items.'), 'base prompt should be present');
  assert.ok(result.includes('## Output format (structured list)'), 'contract header should be present');
  assert.ok(result.includes('"optimizable": false'), 'contract JSON shape should be present');
});

check('formatInstruction does NOT augment a phase with no materialize field', () => {
  const tpl = minimalTemplate();
  const plainPhase = { id: 'plain', prompt: 'Just do the work.', parent: null };
  const wave = [plainPhase];
  const result = formatInstruction(tpl, wave, 0, { slug: 'test-run', totalWaves: 1, silenceWarnings: true });
  assert.ok(result.includes('Just do the work.'), 'base prompt should be present');
  assert.ok(!result.includes('## Output format (structured list)'), 'contract should NOT be present');
});

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  process.exitCode = 1;
}

// ============================================================
// markPhaseComplete end-to-end fan-out (P2 — Bug G)
// ============================================================
console.log('\nmarkPhaseComplete materialize:roadmap-phases consumption');

const fs = require('node:fs');
const os = require('node:os');
const fpath = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('yaml');

const runtime = require('../lib/runtime');
const workflow = require('../lib/workflow');
const paths = require('../lib/paths');

function freshProject() {
  const dir = fs.mkdtempSync(fpath.join(os.tmpdir(), 'cp-fanout-p2-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@local'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  spawnSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  fs.mkdirSync(fpath.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(fpath.join(dir, '.planning', 'PROJECT.md'),
    '# Test\n\n## Constraints\n\n- C1\n');
  fs.writeFileSync(fpath.join(dir, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Validated Requirements\n\n## Active Requirements\n\n## Phases\n');
  fs.writeFileSync(fpath.join(dir, '.planning', 'STATE.md'),
    '# State\n\n## Current Position\n\nPhase: -\nPlan: -\nStatus: Idle\n'
    + 'Current focus: -\nLast activity: -\n\nProgress: [░░░░░░░░░░] 0%\n');
  spawnSync('git', ['add', '.'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

function writeFanoutTemplate(dir) {
  const wfDir = fpath.join(dir, '.planning', 'workflows');
  fs.mkdirSync(wfDir, { recursive: true });
  const tplPath = fpath.join(wfDir, 'fanout-test.yaml');
  fs.writeFileSync(tplPath,
`workflow: fanout-test
version: 1
binds_to: milestone
principles:
  - Test fan-out end-to-end.
defaults:
  model: default
phases:
  - phase:
      id: propose
      description: |
        Decompose the milestone into items.
      role: developer
      materialize: roadmap-phases
      max_children: 5
      prompt: |
        Decompose into items.
  - phase:
      id: child-plan
      description: |
        Per-item planning.
      parent: propose
      role: developer
      prompt: |
        Plan one ROADMAP phase.
  - phase:
      id: review
      description: |
        Review the materialised phases.
      depends_on: [ propose ]
      role: reviewer
      prompt: |
        Review.
`);
  return tplPath;
}

check('markPhaseComplete: parent with materialize:roadmap-phases scaffolds per-item phases', () => {
  const dir = freshProject();
  const tplPath = writeFanoutTemplate(dir);
  const startResult = runtime.startRun(tplPath, { projectDir: dir, name: 'P2 Fanout Test' });
  const slug = startResult.slug;

  // Advance to the 'propose' wave by completing 'propose' directly. In the
  // fanout-test workflow, 'propose' has no upstream phases (it's wave 0).
  const summary = 'Decomposition plan:\n\n```json\n'
    + JSON.stringify({ optimizable: false, items: [
      { id: 'feature-a', title: 'Feature A', summary: 'Build A.' },
      { id: 'feature-b', title: 'Feature B' },
    ] }, null, 2)
    + '\n```\n';

  const result = runtime.markPhaseComplete(slug, 'propose', summary, { projectDir: dir });
  assert.ok(result.nextInstruction, 'next instruction emitted after parent completed');

  // RUN.yaml should have parent_outputs persisted and phaseNumByPhaseId entries.
  const runState = yaml.parse(fs.readFileSync(
    fpath.join(dir, '.planning', 'milestones', slug, 'RUN.yaml'), 'utf8'));
  assert.ok(runState.parent_outputs && runState.parent_outputs.propose, 'parent_outputs persisted');
  assert.strictEqual(runState.parent_outputs.propose.items.length, 2);
  assert.ok(runState.phaseNumByPhaseId['feature-a'] != null, 'item-id mapped to phase num');
  assert.ok(runState.phaseNumByPhaseId['feature-b'] != null, 'item-id mapped to phase num');
  assert.ok(runState.phaseNumByPhaseId['child-plan::feature-a'] != null,
    'expanded child id mapped to same phase num');
  assert.strictEqual(runState.phaseNumByPhaseId['child-plan::feature-a'],
    runState.phaseNumByPhaseId['feature-a']);

  // Per-item phase dirs should exist with PLAN.md content from the items.
  const planA = fpath.join(
    paths.findPhaseDir(String(runState.phaseNumByPhaseId['feature-a']), dir), 'PLAN.md');
  const planABody = fs.readFileSync(planA, 'utf8');
  assert.ok(planABody.includes('# Feature A'), 'item.title used as heading');
  assert.ok(planABody.includes('Build A.'), 'item.summary written to PLAN.md');

  const planB = fpath.join(
    paths.findPhaseDir(String(runState.phaseNumByPhaseId['feature-b']), dir), 'PLAN.md');
  assert.ok(fs.readFileSync(planB, 'utf8').includes('(no summary provided)'),
    'missing summary falls back to placeholder');

  // The next-wave instruction should dispatch the first expanded child
  // (array-mode chains item N+1 after item N, so they fall into separate
  // waves). The expanded id and the child template prompt must be present.
  assert.ok(result.nextInstruction.includes('Phase: child-plan::feature-a'),
    'next instruction dispatches expanded child for feature-a');
  assert.ok(result.nextInstruction.includes('Plan one ROADMAP phase.'),
    'expanded child carries the child template prompt');
  assert.ok(!result.nextInstruction.includes('Phase: child-plan\n'),
    'bare child template id must not appear');
});

check('markPhaseComplete: invalid parent output throws (no fenced JSON)', () => {
  const dir = freshProject();
  const tplPath = writeFanoutTemplate(dir);
  const { slug } = runtime.startRun(tplPath, { projectDir: dir, name: 'P2 Invalid' });
  assert.throws(
    () => runtime.markPhaseComplete(slug, 'propose', 'I forgot the JSON block.', { projectDir: dir }),
    /no fenced JSON block/,
  );
});

check('markPhaseComplete: over-max items rejected by enforceChildCount before scaffolding', () => {
  const dir = freshProject();
  const tplPath = writeFanoutTemplate(dir);
  const { slug } = runtime.startRun(tplPath, { projectDir: dir, name: 'P2 OverMax' });
  const tooMany = Array.from({ length: 6 }, (_, i) => ({ id: `item-${i}`, title: `T${i}` }));
  const summary = '```json\n' + JSON.stringify({ items: tooMany }) + '\n```';
  assert.throws(
    () => runtime.markPhaseComplete(slug, 'propose', summary, { projectDir: dir }),
    /above max_children \(5\)/,
  );
});

check('computeWavesWithFanout: empty parentOutputs == computeWaves', () => {
  const dir = freshProject();
  const tplPath = writeFanoutTemplate(dir);
  const tpl = workflow.loadTemplate(tplPath, { projectDir: dir });
  workflow.applyAutoInjectFinalize(tpl);
  const a = workflow.computeWaves(tpl);
  const b = workflow.computeWavesWithFanout(tpl, {});
  assert.deepStrictEqual(
    a.map((w) => w.map((p) => p.id)),
    b.map((w) => w.map((p) => p.id)),
  );
});

check('computeWavesWithFanout: review waits for all expanded child waves (subtree-wait)', () => {
  const dir = freshProject();
  const tplPath = writeFanoutTemplate(dir);
  const tpl = workflow.loadTemplate(tplPath, { projectDir: dir });
  workflow.applyAutoInjectFinalize(tpl);
  const parentOutputs = {
    propose: { optimizable: false, items: [
      { id: 'feat-1', title: 'F1' },
      { id: 'feat-2', title: 'F2' },
    ] },
  };
  const waves = workflow.computeWavesWithFanout(tpl, parentOutputs);
  const flatOrder = [];
  waves.forEach((w, i) => w.forEach((p) => flatOrder.push({ wave: i, id: p.id })));
  const idxOf = (id) => flatOrder.find((r) => r.id === id).wave;
  // review depends on propose; with fan-out it must wait for every child.
  assert.ok(idxOf('review') > idxOf('child-plan::feat-1'),
    'review waits for feat-1 child');
  assert.ok(idxOf('review') > idxOf('child-plan::feat-2'),
    'review waits for feat-2 child');
  // child-plan::feat-2 waits for child-plan::feat-1 (array-mode chaining).
  assert.ok(idxOf('child-plan::feat-2') > idxOf('child-plan::feat-1'),
    'array-mode chains item 2 after item 1');
  // Each expanded child carries item context.
  const c1 = waves[idxOf('child-plan::feat-1')].find((p) => p.id === 'child-plan::feat-1');
  assert.strictEqual(c1.templateId, 'child-plan');
  assert.strictEqual(c1.parent, 'propose');
  assert.strictEqual(c1.item.id, 'feat-1');
});

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exitCode = 1;
}
