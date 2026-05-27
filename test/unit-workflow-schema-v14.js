'use strict';

/**
 * Unit tests for v1.4 workflow template schema additions:
 *  - meta.supervised (boolean)
 *  - phase.materialize ('inline' | 'roadmap-phases')
 *  - phase.outputs (array of strings)
 *  - max_children default changed from 20 to 10
 */

const assert = require('node:assert/strict');

const { validate } = require('../lib/workflow');

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

function template(phases, meta) {
  return {
    meta: Object.assign({ workflow: 'schema-v14', version: 1, binds_to: 'quick' }, meta || {}),
    principles: [],
    defaults: {},
    phases,
  };
}

function phase(id, overrides) {
  return Object.assign({ id, depends_on: [] }, overrides || {});
}

function run(phases, meta) {
  return validate(template(phases, meta));
}

function assertNoErrors(result) {
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.ok, true);
}

function assertErrorIncludes(result, text) {
  assert.ok(result.errors.some((e) => e.includes(text)), result.errors.join('; '));
}

console.log('unit-workflow-schema-v14');

// supervised:
check('meta.supervised true is accepted', () => {
  assertNoErrors(run([phase('one')], { supervised: true }));
});

check('meta.supervised false is accepted', () => {
  assertNoErrors(run([phase('one')], { supervised: false }));
});

check('meta.supervised non-boolean reports type error', () => {
  const result = run([phase('one')], { supervised: 'yes' });
  assertErrorIncludes(result, 'meta.supervised must be a boolean');
});

// materialize:
check('parent with materialize: inline is accepted', () => {
  assertNoErrors(run([
    phase('parent', { materialize: 'inline', max_children: 3 }),
    phase('child', { parent: 'parent' }),
  ]));
});

check('parent with materialize: roadmap-phases is accepted', () => {
  assertNoErrors(run([
    phase('parent', { materialize: 'roadmap-phases', max_children: 3 }),
    phase('child', { parent: 'parent' }),
  ]));
});

check('parent with invalid materialize value reports error', () => {
  const result = run([
    phase('parent', { materialize: 'expand', max_children: 3 }),
    phase('child', { parent: 'parent' }),
  ]);
  assertErrorIncludes(result, "materialize must be 'inline' or 'roadmap-phases'");
});

check('non-parent with materialize emits warning', () => {
  const result = run([phase('leaf', { materialize: 'inline' })]);
  assert.ok(
    result.warnings.some((w) => w.includes('materialize') && w.includes('not a parent phase')),
    result.warnings.join('; ')
  );
});

// outputs:
check('phase with outputs array of strings is accepted', () => {
  assertNoErrors(run([phase('one', { outputs: ['lib/foo.js', 'test/foo.test.js'] })]));
});

check('phase with non-array outputs reports error', () => {
  const result = run([phase('one', { outputs: 'lib/foo.js' })]);
  assertErrorIncludes(result, 'outputs must be an array');
});

check('phase with non-string outputs entry reports error', () => {
  const result = run([phase('one', { outputs: ['lib/foo.js', 42] })]);
  assertErrorIncludes(result, 'outputs[1] must be a non-empty string');
});

check('phase with empty-string outputs entry reports error', () => {
  const result = run([phase('one', { outputs: [''] })]);
  assertErrorIncludes(result, 'outputs[0] must be a non-empty string');
});

// max_children default:
check('parent default max_children is now 10 (was 20)', () => {
  // min_children: 11 > default 10 → expect error citing the new default.
  const result = run([
    phase('parent', { min_children: 11 }),
    phase('child', { parent: 'parent' }),
  ]);
  assertErrorIncludes(result, 'max_children (10)');
});

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  for (const f of failures) console.error('  ✗', f);
  process.exit(1);
}
