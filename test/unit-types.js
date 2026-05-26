'use strict';

/**
 * Unit tests for lib/types.js — unified Phase shape validation.
 */

const assert = require('node:assert/strict');

const { validatePhase } = require('../lib/types');

let passed = 0;
let failed = 0;
const failures = [];

function t(name, fn) {
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

function validPhase(overrides) {
  return Object.assign({ id: '47', depends_on: [], status: 'pending' }, overrides || {});
}

function assertErrorIncludes(result, text) {
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes(text)), result.errors.join('; '));
}

console.log('unit-types');

t('valid minimal Phase passes', () => {
  assert.deepStrictEqual(validatePhase(validPhase()), { ok: true, errors: [] });
});

t('valid Phase with milestone extension fields passes', () => {
  const result = validatePhase(validPhase({
    plans: ['47-01', '47-02'],
    workflow: 'dev',
    summary: '.planning/phases/47/SUMMARY.md',
    base_commit: 'abcdef1234567890',
  }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

t('valid Phase with workflow extension fields passes', () => {
  const result = validatePhase(validPhase({
    id: 'brainstorm',
    role: 'researcher',
    model: 'model-name',
    persist_output: true,
  }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

for (const status of ['pending', 'in-progress', 'complete', 'failed']) {
  t(`status ${status} is accepted`, () => {
    assert.strictEqual(validatePhase(validPhase({ status })).ok, true);
  });
}

t('invalid status string reports valid enum', () => {
  assertErrorIncludes(validatePhase(validPhase({ status: 'done' })),
    'status must be one of pending|in-progress|complete|failed');
});

t('missing status reports error', () => {
  const phase = validPhase();
  delete phase.status;
  assertErrorIncludes(validatePhase(phase), 'status must be one of');
});

t('numeric status reports error', () => {
  assertErrorIncludes(validatePhase(validPhase({ status: 1 })), 'status must be one of');
});

t('missing id reports error', () => {
  const phase = validPhase();
  delete phase.id;
  assertErrorIncludes(validatePhase(phase), 'id must be a non-empty string');
});

t('empty id reports error', () => {
  assertErrorIncludes(validatePhase(validPhase({ id: '' })), 'id must be a non-empty string');
});

t('numeric id reports error', () => {
  assertErrorIncludes(validatePhase(validPhase({ id: 47 })), 'id must be a non-empty string');
});

t('missing depends_on reports error', () => {
  const phase = validPhase();
  delete phase.depends_on;
  assertErrorIncludes(validatePhase(phase), 'depends_on must be an array');
});

t('non-array depends_on reports error', () => {
  assertErrorIncludes(validatePhase(validPhase({ depends_on: '46' })),
    'depends_on must be an array');
});

t('depends_on non-string item reports indexed error', () => {
  assertErrorIncludes(validatePhase(validPhase({ depends_on: ['46', 47] })),
    'depends_on[1] must be a string');
});

t('null input returns one object-shape error', () => {
  const result = validatePhase(null);
  assert.strictEqual(result.ok, false);
  assert.deepStrictEqual(result.errors, ['phase must be a non-null object']);
});

t('undefined input returns one object-shape error', () => {
  const result = validatePhase(undefined);
  assert.strictEqual(result.ok, false);
  assert.deepStrictEqual(result.errors, ['phase must be a non-null object']);
});

t('array input is rejected as non-object Phase', () => {
  assertErrorIncludes(validatePhase([]), 'phase must be a non-null object');
});

t('multiple errors are collected', () => {
  const result = validatePhase({ depends_on: [], status: 'done' });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errors.length, 2);
  assertErrorIncludes(result, 'id must be a non-empty string');
  assertErrorIncludes(result, 'status must be one of');
});

t('return shape always has ok and errors keys only', () => {
  assert.deepStrictEqual(Object.keys(validatePhase({})), ['ok', 'errors']);
  assert.deepStrictEqual(Object.keys(validatePhase(validPhase())), ['ok', 'errors']);
});

t('unknown extension fields are tolerated', () => {
  assert.strictEqual(validatePhase(validPhase({ foo: 'bar' })).ok, true);
});

t('empty depends_on array is valid', () => {
  const result = validatePhase(validPhase({ depends_on: [] }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exitCode = 1;
}
