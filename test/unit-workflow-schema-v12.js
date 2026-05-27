'use strict';

/**
 * Unit tests for v1.2 workflow template schema validation.
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
    meta: Object.assign({ workflow: 'schema-v12', version: 1, binds_to: 'custom' }, meta || {}),
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
  assert.ok(result.errors.some((error) => error.includes(text)), result.errors.join('; '));
}

function assertWarningIncludes(result, text) {
  assert.ok(result.warnings.some((warning) => warning.includes(text)), result.warnings.join('; '));
}

console.log('unit-workflow-schema-v12');

check('valid parent with two children has no errors', () => {
  assertNoErrors(run([
    phase('parent', { max_children: 2, min_children: 1 }),
    phase('child-a', { parent: 'parent' }),
    phase('child-b', { parent: 'parent', after: ['child-a'] }),
  ]));
});

check('valid top-level after references top-level phase', () => {
  assertNoErrors(run([
    phase('setup'),
    phase('execute', { after: ['setup'] }),
  ]));
});

check('valid child after references same-parent sibling', () => {
  assertNoErrors(run([
    phase('parent'),
    phase('draft', { parent: 'parent' }),
    phase('review', { parent: 'parent', after: ['draft'] }),
  ]));
});

check('valid parent max-only uses default min_children=1', () => {
  assertNoErrors(run([
    phase('parent', { max_children: 1 }),
    phase('child', { parent: 'parent' }),
  ]));
});

check('valid parent min-only uses default max_children=10', () => {
  assertNoErrors(run([
    phase('parent', { min_children: 10 }),
    phase('child', { parent: 'parent' }),
  ]));
});

check('valid parent accepts max_children equal to min_children', () => {
  assertNoErrors(run([
    phase('parent', { max_children: 3, min_children: 3 }),
    phase('child', { parent: 'parent' }),
  ]));
});

check('valid boolean persist true is accepted', () => {
  assertNoErrors(run([phase('one', { persist: true })]));
});

check('valid boolean persist false is accepted', () => {
  assertNoErrors(run([phase('one', { persist: false })]));
});

check('unknown parent reports exact parent id', () => {
  const result = run([phase('child', { parent: 'missing' })]);
  assertErrorIncludes(result, "phase 'child' has unknown parent 'missing'");
});

check('known top-level parent is accepted', () => {
  const result = run([phase('root'), phase('child', { parent: 'root' })]);
  assert.ok(!result.errors.some((error) => error.includes('unknown parent')), result.errors.join('; '));
});

check('grandchild attempt reports grandchild error', () => {
  const result = run([
    phase('root'),
    phase('child', { parent: 'root' }),
    phase('grandchild', { parent: 'child' }),
  ]);
  assertErrorIncludes(result, "phase 'grandchild' is a grandchild of 'root' via 'child'");
});

check('non-parent max_children emits warning', () => {
  const result = run([phase('leaf', { max_children: 2 })]);
  assertWarningIncludes(result, "phase 'leaf' sets max_children/min_children but is not a parent phase");
});

check('non-parent min_children emits warning', () => {
  const result = run([phase('leaf', { min_children: 1 })]);
  assertWarningIncludes(result, "phase 'leaf' sets max_children/min_children but is not a parent phase");
});

check('non-parent child limits warning does not make template invalid', () => {
  const result = run([phase('leaf', { max_children: 2 })]);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

check('parent max_children less than min_children reports error', () => {
  const result = run([
    phase('parent', { max_children: 1, min_children: 2 }),
    phase('child', { parent: 'parent' }),
  ]);
  assertErrorIncludes(result, "phase 'parent' has max_children (1) < min_children (2)");
});

check('parent min-only above default max_children reports error', () => {
  const result = run([
    phase('parent', { min_children: 11 }),
    phase('child', { parent: 'parent' }),
  ]);
  assertErrorIncludes(result, "phase 'parent' has max_children (10) < min_children (11)");
});

check('non-integer max_children reports positive integer error', () => {
  const result = run([
    phase('parent', { max_children: 1.5 }),
    phase('child', { parent: 'parent' }),
  ]);
  assertErrorIncludes(result, "phase 'parent' max_children must be a positive integer (got 1.5)");
});

check('zero max_children reports positive integer error', () => {
  const result = run([
    phase('parent', { max_children: 0 }),
    phase('child', { parent: 'parent' }),
  ]);
  assertErrorIncludes(result, "phase 'parent' max_children must be a positive integer (got 0)");
});

check('string min_children reports positive integer error', () => {
  const result = run([
    phase('parent', { min_children: '1' }),
    phase('child', { parent: 'parent' }),
  ]);
  assertErrorIncludes(result, "phase 'parent' min_children must be a positive integer (got 1)");
});

check('negative min_children reports positive integer error', () => {
  const result = run([
    phase('parent', { min_children: -1 }),
    phase('child', { parent: 'parent' }),
  ]);
  assertErrorIncludes(result, "phase 'parent' min_children must be a positive integer (got -1)");
});

check('child after referencing top-level phase reports non-sibling error', () => {
  const result = run([
    phase('parent'),
    phase('setup'),
    phase('child', { parent: 'parent', after: ['setup'] }),
  ]);
  assertErrorIncludes(result, "phase 'child' after-dep 'setup' is not a sibling under parent 'parent'");
});

check('child after referencing other parent child reports non-sibling error', () => {
  const result = run([
    phase('parent-a'),
    phase('parent-b'),
    phase('child-a', { parent: 'parent-a' }),
    phase('child-b', { parent: 'parent-b', after: ['child-a'] }),
  ]);
  assertErrorIncludes(result, "phase 'child-b' after-dep 'child-a' is not a sibling under parent 'parent-b'");
});

check('child after referencing unknown phase reports non-sibling error', () => {
  const result = run([
    phase('parent'),
    phase('child', { parent: 'parent', after: ['missing'] }),
  ]);
  assertErrorIncludes(result, "phase 'child' after-dep 'missing' is not a sibling under parent 'parent'");
});

check('top-level after referencing child reports child-phase error', () => {
  const result = run([
    phase('parent'),
    phase('child', { parent: 'parent' }),
    phase('top', { after: ['child'] }),
  ]);
  assertErrorIncludes(result, "phase 'top' after-dep 'child' is a child phase; top-level after must reference top-level phases");
});

check('top-level after does not reject unknown ids with child-phase error', () => {
  const result = run([phase('top', { after: ['missing'] })]);
  assert.ok(!result.errors.some((error) => error.includes('child phase')), result.errors.join('; '));
});

check('string persist reports type error', () => {
  const result = run([phase('one', { persist: 'true' })]);
  assertErrorIncludes(result, "phase 'one' persist must be boolean (got string)");
});

check('null persist reports object type error', () => {
  const result = run([phase('one', { persist: null })]);
  assertErrorIncludes(result, "phase 'one' persist must be boolean (got object)");
});

check('existing missing workflow validation still triggers', () => {
  const result = run([phase('one')], { workflow: undefined });
  assertErrorIncludes(result, 'meta.workflow must be a non-empty string');
});

check('existing unknown binds_to validation still triggers', () => {
  const result = run([phase('one')], { binds_to: 'unknown' });
  assertErrorIncludes(result, 'meta.binds_to must be one of');
});

check('existing depends_on unknown phase validation still triggers', () => {
  const result = run([phase('one', { depends_on: ['missing'] })]);
  assertErrorIncludes(result, "depends_on references unknown phase 'missing'");
});

check('existing depends_on cycle validation still triggers', () => {
  const result = run([
    phase('a', { depends_on: ['b'] }),
    phase('b', { depends_on: ['a'] }),
  ]);
  assertErrorIncludes(result, 'Cycle detected');
});

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exitCode = 1;
}
