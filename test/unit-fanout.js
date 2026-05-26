'use strict';

/**
 * Unit tests for lib/fanout.js — v1.2 parent/child fan-out expansion.
 */

const assert = require('node:assert/strict');

const { expandPhases, pairwiseChildDeps } = require('../lib/fanout');

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
  return Object.assign({ id: 'phase', depends_on: [], status: 'pending', persist: false }, overrides || {});
}

function ids(rows) {
  return rows.map((row) => row.id);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

console.log('unit-fanout');

check('empty phases returns empty array', () => {
  assert.deepStrictEqual(expandPhases([], {}), []);
});

check('single top-level phase emits as top-level output', () => {
  const result = expandPhases([phase({ id: 'solo', after: ['setup'], persist: true })], {});
  assert.deepStrictEqual(result, [{
    id: 'solo',
    templateId: 'solo',
    after: ['setup'],
    persist: true,
    source: 'top-level',
  }]);
});

check('parent with no outputs map emits parent and skips children', () => {
  const phases = [
    phase({ id: 'parent', min_children: 1, max_children: 20 }),
    phase({ id: 'childA', parent: 'parent' }),
  ];
  assert.deepStrictEqual(ids(expandPhases(phases, {})), ['parent']);
});

check('parent with three outputs and two children expands in item-major declaration order', () => {
  const phases = [
    phase({ id: 'parent', min_children: 1 }),
    phase({ id: 'childA', parent: 'parent' }),
    phase({ id: 'childB', parent: 'parent' }),
  ];
  const result = expandPhases(phases, { parent: [{ id: 'one' }, { id: 'two' }, { id: 'three' }] });
  assert.strictEqual(result.length, 7);
  assert.deepStrictEqual(ids(result), [
    'parent',
    'childA::one', 'childB::one',
    'childA::two', 'childB::two',
    'childA::three', 'childB::three',
  ]);
});

check('child sibling after-deps are paired per item id (array-mode also chains prev subtree)', () => {
  const phases = [
    phase({ id: 'parent' }),
    phase({ id: 'childA', parent: 'parent' }),
    phase({ id: 'childB', parent: 'parent', after: ['childA'] }),
  ];
  const result = expandPhases(phases, { parent: [{ id: 'x' }, { id: 'y' }] });
  assert.deepStrictEqual(result.find((row) => row.id === 'childB::x').after, ['childA::x']);
  assert.deepStrictEqual(
    result.find((row) => row.id === 'childB::y').after,
    ['childA::y', 'childA::x', 'childB::x'],
  );
  assert.deepStrictEqual(
    result.find((row) => row.id === 'childA::y').after,
    ['childA::x', 'childB::x'],
  );
});

check('items without id use the item index in expanded ids', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' })];
  assert.deepStrictEqual(ids(expandPhases(phases, { parent: [{ title: 'A' }, { title: 'B' }] })), [
    'parent', 'childA::0', 'childA::1',
  ]);
});

check('mixed items with and without id expand with id-or-index keys', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' })];
  assert.deepStrictEqual(ids(expandPhases(phases, { parent: [{ id: 'named' }, { title: 'unnamed' }, { id: 'last' }] })), [
    'parent', 'childA::named', 'childA::1', 'childA::last',
  ]);
});

check('parent min_children zero allows empty outputs with no children emitted', () => {
  const phases = [phase({ id: 'parent', min_children: 0 }), phase({ id: 'childA', parent: 'parent' })];
  assert.deepStrictEqual(ids(expandPhases(phases, { parent: [] })), ['parent']);
});

check('child after-dep referencing non-sibling throws sibling error', () => {
  const phases = [
    phase({ id: 'parent' }),
    phase({ id: 'childA', parent: 'parent', after: ['missing'] }),
  ];
  assert.throws(
    () => expandPhases(phases, { parent: [{ id: 'x' }] }),
    /fanout: child 'childA' after-dep 'missing' is not a sibling under parent 'parent'/,
  );
});

check('child after-dep referencing self throws self-loop error', () => {
  const phases = [
    phase({ id: 'parent' }),
    phase({ id: 'childA', parent: 'parent', after: ['childA'] }),
  ];
  assert.throws(
    () => expandPhases(phases, { parent: [{ id: 'x' }] }),
    /fanout: child 'childA' depends on itself/,
  );
});

check('two parents expand independently with their own outputs', () => {
  const phases = [
    phase({ id: 'parentA' }),
    phase({ id: 'childA', parent: 'parentA' }),
    phase({ id: 'parentB' }),
    phase({ id: 'childB', parent: 'parentB' }),
  ];
  assert.deepStrictEqual(ids(expandPhases(phases, {
    parentA: [{ id: 'a1' }, { id: 'a2' }],
    parentB: [{ id: 'b1' }],
  })), ['parentA', 'childA::a1', 'childA::a2', 'parentB', 'childB::b1']);
});

check('top-level after reference to parent is preserved verbatim', () => {
  const phases = [
    phase({ id: 'parent' }),
    phase({ id: 'childA', parent: 'parent' }),
    phase({ id: 'afterParent', after: ['parent'] }),
  ];
  const result = expandPhases(phases, { parent: [{ id: 'x' }] });
  assert.deepStrictEqual(result.find((row) => row.id === 'afterParent').after, ['parent']);
});

check('persist flag survives expansion', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent', persist: true })];
  const result = expandPhases(phases, { parent: [{ id: 'x' }, { id: 'y' }] });
  assert.strictEqual(result.find((row) => row.id === 'childA::x').persist, true);
  assert.strictEqual(result.find((row) => row.id === 'childA::y').persist, true);
});

check('templateId equals original phase id for top-level and expanded outputs', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' })];
  const result = expandPhases(phases, { parent: [{ id: 'x' }] });
  assert.strictEqual(result[0].templateId, 'parent');
  assert.strictEqual(result[1].templateId, 'childA');
});

check('source marks top-level and expanded outputs', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' }), phase({ id: 'leaf' })];
  const result = expandPhases(phases, { parent: [{ id: 'x' }] });
  assert.strictEqual(result.find((row) => row.id === 'parent').source, 'top-level');
  assert.strictEqual(result.find((row) => row.id === 'childA::x').source, 'expanded');
  assert.strictEqual(result.find((row) => row.id === 'leaf').source, 'top-level');
});

check('itemIndex is the correct zero-based number', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' })];
  const result = expandPhases(phases, { parent: [{ id: 'x' }, { id: 'y' }, { id: 'z' }] });
  assert.deepStrictEqual(result.filter((row) => row.source === 'expanded').map((row) => row.itemIndex), [0, 1, 2]);
});

check('item field exposes the original item object reference', () => {
  const item = { id: 'x', title: 'Item X' };
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' })];
  const result = expandPhases(phases, { parent: [item] });
  assert.strictEqual(result[1].item, item);
});

check('order is stable across repeated calls', () => {
  const phases = [
    phase({ id: 'parent' }),
    phase({ id: 'childA', parent: 'parent' }),
    phase({ id: 'childB', parent: 'parent', after: ['childA'] }),
  ];
  const outputs = { parent: [{ id: 'x' }, { id: 'y' }] };
  assert.deepStrictEqual(ids(expandPhases(phases, outputs)), ids(expandPhases(phases, outputs)));
});

check('pairwiseChildDeps maps template ids to this item expanded ids', () => {
  const deps = pairwiseChildDeps([phase({ id: 'childA' }), phase({ id: 'childB' })], 2, 'item');
  assert.ok(deps instanceof Map);
  assert.deepStrictEqual(Array.from(deps.entries()), [
    ['childA', 'childA::item'],
    ['childB', 'childB::item'],
  ]);
});

check('parentOutputs entry with no child templates is harmless', () => {
  const phases = [phase({ id: 'parent' })];
  assert.deepStrictEqual(ids(expandPhases(phases, { parent: [{ id: 'unused' }] })), ['parent']);
});

check('top-level non-parent after to another top-level passes through unchanged', () => {
  const phases = [phase({ id: 'setup' }), phase({ id: 'deploy', after: ['setup'] })];
  assert.deepStrictEqual(expandPhases(phases, {}).find((row) => row.id === 'deploy').after, ['setup']);
});

check('three-plus items preserve item-major ordering', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' }), phase({ id: 'childB', parent: 'parent' })];
  const result = expandPhases(phases, { parent: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] });
  assert.deepStrictEqual(ids(result), [
    'parent',
    'childA::a', 'childB::a',
    'childA::b', 'childB::b',
    'childA::c', 'childB::c',
    'childA::d', 'childB::d',
  ]);
});

check('expandPhases is idempotent for equal inputs', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent', persist: true })];
  const outputs = { parent: [{ id: 'x', title: 'X' }] };
  assert.deepStrictEqual(expandPhases(phases, outputs), expandPhases(clone(phases), clone(outputs)));
});

check('expandPhases does not mutate phases or parentOutputs inputs', () => {
  const phases = [phase({ id: 'parent', after: ['setup'] }), phase({ id: 'childA', parent: 'parent', after: [] })];
  const outputs = { parent: [{ id: 'x', payload: { n: 1 } }] };
  const beforePhases = clone(phases);
  const beforeOutputs = clone(outputs);
  expandPhases(phases, outputs);
  assert.deepStrictEqual(phases, beforePhases);
  assert.deepStrictEqual(outputs, beforeOutputs);
});

check('returned objects are fresh and do not reuse input Phase objects', () => {
  const parent = phase({ id: 'parent', after: ['setup'] });
  const child = phase({ id: 'childA', parent: 'parent', after: [] });
  const result = expandPhases([parent, child], { parent: [{ id: 'x' }] });
  assert.notStrictEqual(result[0], parent);
  assert.notStrictEqual(result[1], child);
  assert.notStrictEqual(result[0].after, parent.after);
  assert.notStrictEqual(result[1].after, child.after);
});

// Cross-item subtree-wait — array mode (default, no depends_on)
check('array mode: single-child parent chains item N to item N-1', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' })];
  const result = expandPhases(phases, { parent: [{ id: 'one' }, { id: 'two' }, { id: 'three' }] });
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::one').after, []);
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::two').after, ['childA::one']);
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::three').after, ['childA::two']);
});

check('array mode: multi-child parent makes every item-N child wait on every item-N-1 child', () => {
  const phases = [
    phase({ id: 'parent' }),
    phase({ id: 'childA', parent: 'parent' }),
    phase({ id: 'childB', parent: 'parent' }),
  ];
  const result = expandPhases(phases, { parent: [{ id: 'one' }, { id: 'two' }] });
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::two').after, ['childA::one', 'childB::one']);
  assert.deepStrictEqual(result.find((row) => row.id === 'childB::two').after, ['childA::one', 'childB::one']);
});

check('array mode: first item has empty after (no predecessor)', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' })];
  const result = expandPhases(phases, { parent: [{ id: 'first' }, { id: 'second' }] });
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::first').after, []);
});

check('array mode: single item produces no cross-item edges', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' })];
  const result = expandPhases(phases, { parent: [{ id: 'only' }] });
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::only').after, []);
});

// Cross-item subtree-wait — DAG mode (every item has depends_on)
check('dag mode: depends_on chain wires every child to deps subtree', () => {
  const phases = [
    phase({ id: 'parent' }),
    phase({ id: 'childA', parent: 'parent' }),
    phase({ id: 'childB', parent: 'parent', after: ['childA'] }),
  ];
  const result = expandPhases(phases, {
    parent: [
      { id: 'a', depends_on: [] },
      { id: 'b', depends_on: ['a'] },
    ],
  });
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::a').after, []);
  assert.deepStrictEqual(result.find((row) => row.id === 'childB::a').after, ['childA::a']);
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::b').after, ['childA::a', 'childB::a']);
  assert.deepStrictEqual(result.find((row) => row.id === 'childB::b').after, ['childA::b', 'childA::a', 'childB::a']);
});

check('dag mode: items with empty depends_on are parallel (no cross-item edges)', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' })];
  const result = expandPhases(phases, {
    parent: [
      { id: 'one', depends_on: [] },
      { id: 'two', depends_on: [] },
      { id: 'three', depends_on: [] },
    ],
  });
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::one').after, []);
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::two').after, []);
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::three').after, []);
});

check('dag mode: diamond (a -> b, a -> c, b+c -> d) wires correctly', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' })];
  const result = expandPhases(phases, {
    parent: [
      { id: 'a', depends_on: [] },
      { id: 'b', depends_on: ['a'] },
      { id: 'c', depends_on: ['a'] },
      { id: 'd', depends_on: ['b', 'c'] },
    ],
  });
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::b').after, ['childA::a']);
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::c').after, ['childA::a']);
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::d').after, ['childA::b', 'childA::c']);
});

check('dag mode: depends_on propagates through to subsequent expanded ids correctly', () => {
  const phases = [
    phase({ id: 'parent' }),
    phase({ id: 'plan', parent: 'parent' }),
    phase({ id: 'exec', parent: 'parent', after: ['plan'] }),
  ];
  const result = expandPhases(phases, {
    parent: [
      { id: 'feat-1', depends_on: [] },
      { id: 'feat-2', depends_on: ['feat-1'] },
    ],
  });
  assert.deepStrictEqual(result.find((row) => row.id === 'plan::feat-1').after, []);
  assert.deepStrictEqual(result.find((row) => row.id === 'exec::feat-1').after, ['plan::feat-1']);
  assert.deepStrictEqual(result.find((row) => row.id === 'plan::feat-2').after, ['plan::feat-1', 'exec::feat-1']);
  assert.deepStrictEqual(
    result.find((row) => row.id === 'exec::feat-2').after,
    ['plan::feat-2', 'plan::feat-1', 'exec::feat-1'],
  );
});

// Mode boundary
check('partial depends_on (some items have it, others not) falls back to array mode', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' })];
  const result = expandPhases(phases, {
    parent: [
      { id: 'a' },
      { id: 'b', depends_on: [] },
      { id: 'c', depends_on: ['a'] },
    ],
  });
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::a').after, []);
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::b').after, ['childA::a']);
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::c').after, ['childA::b']);
});

check('cross-item edges use indexed keys when items lack ids', () => {
  const phases = [phase({ id: 'parent' }), phase({ id: 'childA', parent: 'parent' })];
  const result = expandPhases(phases, { parent: [{ title: 'first' }, { title: 'second' }] });
  assert.deepStrictEqual(result.find((row) => row.id === 'childA::1').after, ['childA::0']);
});

check('dag mode does not produce duplicate after entries when sibling+cross-item agree', () => {
  const phases = [
    phase({ id: 'parent' }),
    phase({ id: 'childA', parent: 'parent' }),
    phase({ id: 'childB', parent: 'parent', after: ['childA'] }),
  ];
  const result = expandPhases(phases, {
    parent: [
      { id: 'a', depends_on: [] },
      { id: 'b', depends_on: ['a'] },
    ],
  });
  const childBb = result.find((row) => row.id === 'childB::b');
  const counts = childBb.after.reduce((acc, v) => Object.assign(acc, { [v]: (acc[v] || 0) + 1 }), {});
  for (const id of Object.keys(counts)) {
    assert.strictEqual(counts[id], 1, `duplicate entry '${id}' in childB::b.after`);
  }
});

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exitCode = 1;
}
