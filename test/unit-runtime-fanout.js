'use strict';

/**
 * Unit tests for lib/runtime-fanout.js — v1.2 runtime fan-out contract helpers.
 */

const assert = require('node:assert/strict');

const { buildParentPrompt, parseParentOutput, enforceChildCount } = require('../lib/runtime-fanout');

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

check('buildParentPrompt defaults max=20 when phase.max_children is missing', () => {
  const prompt = buildParentPrompt(phase({ min_children: 3 }), 'Base');
  assert.ok(prompt.includes('Produce between 3 and 20 items.'));
});

check('buildParentPrompt includes the fenced json template literal', () => {
  const prompt = buildParentPrompt(phase({ min_children: 1, max_children: 2 }), 'Base');
  assert.ok(prompt.includes('```json\n{\n  "items"'));
});

check('buildParentPrompt output is a string', () => {
  assert.strictEqual(typeof buildParentPrompt(phase(), 'Base'), 'string');
});

// parseParentOutput (12)
check('parseParentOutput parses a clean response with one fenced JSON block', () => {
  assert.deepStrictEqual(parseParentOutput(responseFor({ items: [{ id: 'one', title: 'One' }] })), [{ id: 'one', title: 'One' }]);
});

check('parseParentOutput picks the LAST JSON block when multiple are present', () => {
  const response = responseFor({ items: [{ id: 'first', title: 'First' }] }) + '\nLater answer:\n' + responseFor({ items: [{ id: 'last', title: 'Last' }] });
  assert.deepStrictEqual(parseParentOutput(response), [{ id: 'last', title: 'Last' }]);
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
  assert.deepStrictEqual(parseParentOutput(responseFor({ items: [] })), []);
});

check('parseParentOutput preserves extra fields on items verbatim', () => {
  const extraItem = { id: 'with-extra', title: 'Extra', summary: 'S', priority: 3, nested: { keep: true } };
  assert.deepStrictEqual(parseParentOutput(responseFor({ items: [extraItem] })), [extraItem]);
});

// enforceChildCount (5)
check('enforceChildCount passes when items.length is between min and max', () => {
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

check('enforceChildCount defaults max=20 when missing', () => {
  assert.throws(() => enforceChildCount(phase({ min_children: 1 }), items(21)), /above max_children \(20\)/);
});

// End-to-end (2)
check('parseParentOutput + enforceChildCount chain works on a happy-path response', () => {
  const parsedItems = enforceChildCount(phase({ min_children: 1, max_children: 2 }), parseParentOutput(responseFor({ items: [{ id: 'one', title: 'One' }] })));
  assert.deepStrictEqual(parsedItems, [{ id: 'one', title: 'One' }]);
});

check('response with 21 items and max=20 fails at enforceChildCount, not parse', () => {
  const parsedItems = parseParentOutput(responseFor({ items: items(21) }));
  assert.strictEqual(parsedItems.length, 21);
  assert.throws(() => enforceChildCount(phase({ max_children: 20 }), parsedItems), /above max_children \(20\)/);
});

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exitCode = 1;
}
