'use strict';

/**
 * Unit tests for lib/workflow.js phasesFromTemplate adapter.
 */

const assert = require('node:assert/strict');

const { loadTemplate, phasesFromTemplate } = require('../lib/workflow');
const { validatePhase } = require('../lib/types');

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

function template(phases, workflow) {
  return {
    meta: { workflow: workflow || `workflow-${Math.random()}`, version: 1, binds_to: 'custom' },
    principles: [],
    defaults: {},
    phases,
  };
}

function phase(overrides) {
  return Object.assign({ id: 'one', depends_on: [] }, overrides || {});
}

function suppressWarn(fn) {
  const originalWarn = console.warn;
  console.warn = function () {};
  try {
    return fn();
  } finally {
    console.warn = originalWarn;
  }
}

function assertAllValid(phases) {
  for (const p of phases) {
    assert.deepStrictEqual(validatePhase(p), { ok: true, errors: [] });
  }
}

console.log('unit-workflow-phase-adapter');

// Adapter shape
check('empty template phases returns empty array', () => {
  assert.deepStrictEqual(phasesFromTemplate(template([])), []);
});

check('each output phase passes validatePhase', () => {
  assertAllValid(phasesFromTemplate(template([phase()])));
});

check('id round-trips', () => {
  assert.strictEqual(phasesFromTemplate(template([phase({ id: 'alpha' })]))[0].id, 'alpha');
});

check('status defaults to pending', () => {
  assert.strictEqual(phasesFromTemplate(template([phase()]))[0].status, 'pending');
});

check('parent round-trips when set', () => {
  assert.strictEqual(phasesFromTemplate(template([phase({ id: 'child', parent: 'root' })]))[0].parent, 'root');
});

check('after round-trips as array', () => {
  assert.deepStrictEqual(phasesFromTemplate(template([phase({ after: ['setup'] })]))[0].after, ['setup']);
});

check('depends_on is preserved alongside after', () => {
  const out = phasesFromTemplate(template([phase({ depends_on: ['legacy'], after: ['modern'] })]))[0];
  assert.deepStrictEqual(out.depends_on, ['legacy']);
  assert.deepStrictEqual(out.after, ['modern']);
});

check('role round-trips', () => {
  assert.strictEqual(phasesFromTemplate(template([phase({ role: 'planner' })]))[0].role, 'planner');
});

check('model round-trips', () => {
  assert.strictEqual(phasesFromTemplate(template([phase({ model: 'high' })]))[0].model, 'high');
});

check('returns a fresh array on each call', () => {
  const t = template([phase({ id: 'stable' })]);
  const first = phasesFromTemplate(t);
  first.push(phase({ id: 'mutated' }));
  assert.deepStrictEqual(phasesFromTemplate(t).map((p) => p.id), ['stable']);
});

// v1.2 fields
check('persist true round-trips', () => {
  assert.strictEqual(phasesFromTemplate(template([phase({ persist: true })]))[0].persist, true);
});

check('persist false round-trips', () => {
  assert.strictEqual(phasesFromTemplate(template([phase({ persist: false })]))[0].persist, false);
});

check('persist absent defaults to false', () => {
  assert.strictEqual(phasesFromTemplate(template([phase()]))[0].persist, false);
});

check('parent explicit max_children is preserved', () => {
  const out = phasesFromTemplate(template([
    phase({ id: 'root', max_children: 5 }),
    phase({ id: 'child', parent: 'root' }),
  ]))[0];
  assert.strictEqual(out.max_children, 5);
});

check('parent without max_children defaults to 10', () => {
  const out = phasesFromTemplate(template([
    phase({ id: 'root' }),
    phase({ id: 'child', parent: 'root' }),
  ]))[0];
  assert.strictEqual(out.max_children, 10);
});

check('parent without min_children defaults to 1', () => {
  const out = phasesFromTemplate(template([
    phase({ id: 'root' }),
    phase({ id: 'child', parent: 'root' }),
  ]))[0];
  assert.strictEqual(out.min_children, 1);
});

check('non-parent without child limits leaves fields undefined', () => {
  const out = phasesFromTemplate(template([phase({ id: 'leaf' })]))[0];
  assert.strictEqual(out.max_children, undefined);
  assert.strictEqual(out.min_children, undefined);
});

check('phase declared as parent by child reference gets child limit defaults', () => {
  const out = phasesFromTemplate(template([
    phase({ id: 'parent' }),
    phase({ id: 'child', parent: 'parent' }),
  ]))[0];
  assert.deepStrictEqual({ max: out.max_children, min: out.min_children }, { max: 10, min: 1 });
});

// persist_output back-compat
check('persist_output true maps to persist true', () => {
  suppressWarn(() => {
    assert.strictEqual(phasesFromTemplate(template([phase({ persist_output: true })], 'legacy-true'))[0].persist, true);
  });
});

check('persist_output false maps to persist false', () => {
  suppressWarn(() => {
    assert.strictEqual(phasesFromTemplate(template([phase({ persist_output: false })], 'legacy-false'))[0].persist, false);
  });
});

check('persist wins over persist_output when both are present', () => {
  suppressWarn(() => {
    const out = phasesFromTemplate(template([phase({ persist: true, persist_output: false })], 'legacy-both'))[0];
    assert.strictEqual(out.persist, true);
  });
});

check('persist_output deprecation warning is emitted once per template workflow', () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = function (message) { warnings.push(message); };
  try {
    const t = template([phase({ persist_output: true })], 'legacy-warn-once');
    phasesFromTemplate(t);
    phasesFromTemplate(t);
  } finally {
    console.warn = originalWarn;
  }
  assert.deepStrictEqual(warnings, [
    '[cp v1.2] persist_output: is deprecated in template legacy-warn-once; use persist: instead',
  ]);
});

// Built-in template parity
check('built-in dev template phases pass validatePhase', () => {
  suppressWarn(() => assertAllValid(phasesFromTemplate(loadTemplate('dev'))));
});

check('built-in debug template phases pass validatePhase', () => {
  suppressWarn(() => assertAllValid(phasesFromTemplate(loadTemplate('debug'))));
});

check('built-in quick template phases pass validatePhase', () => {
  suppressWarn(() => assertAllValid(phasesFromTemplate(loadTemplate('quick'))));
});

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exitCode = 1;
}
