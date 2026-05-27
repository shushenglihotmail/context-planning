'use strict';

/**
 * Unit tests for v1.3 workflow template schema additions.
 *
 * Covers the new `phase:` / `template:` YAML wrapper shapes (Phase 53),
 * template-arg resolution (Phase 54), workflow-template expansion
 * (Phase 55). Plan 53-01 — wrapper-recognition + auto-wrap helper.
 */

const assert = require('node:assert/strict');

const { unwrapPhaseEntry } = require('../lib/workflow');

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

console.log('\n=== 53-01: unwrapPhaseEntry helper ===');

check('bare v1.2 phase entry is treated as kind=phase', () => {
  const entry = { id: 'plan', role: 'planner' };
  const { kind, body } = unwrapPhaseEntry(entry);
  assert.equal(kind, 'phase');
  assert.equal(body, entry);
});

check('`phase:` wrapper unwraps to inner body, kind=phase', () => {
  const inner = { id: 'plan', role: 'planner' };
  const entry = { phase: inner };
  const { kind, body } = unwrapPhaseEntry(entry);
  assert.equal(kind, 'phase');
  assert.equal(body, inner);
});

check('`template:` wrapper returns kind=template + inner body', () => {
  const inner = { id: 'review', name: 'review-and-address', args: { scope: 'auth' } };
  const entry = { template: inner };
  const { kind, body } = unwrapPhaseEntry(entry);
  assert.equal(kind, 'template');
  assert.equal(body, inner);
});

check('multi-key entry with `phase` key is treated as bare (not wrapped)', () => {
  // A bare v1.2 entry that happens to have a `phase:` field but is not a
  // wrapper (multiple top-level keys) must NOT be misclassified.
  const entry = { id: 'x', phase: 'something', role: 'planner' };
  const { kind, body } = unwrapPhaseEntry(entry);
  assert.equal(kind, 'phase');
  assert.equal(body, entry);
});

check('non-object entry returns kind=phase with body=entry', () => {
  const { kind, body } = unwrapPhaseEntry(null);
  assert.equal(kind, 'phase');
  assert.equal(body, null);

  const r2 = unwrapPhaseEntry('oops');
  assert.equal(r2.kind, 'phase');
  assert.equal(r2.body, 'oops');
});

check('array entry returns kind=phase with body=entry (not a wrapper)', () => {
  const arr = [1, 2, 3];
  const { kind, body } = unwrapPhaseEntry(arr);
  assert.equal(kind, 'phase');
  assert.equal(body, arr);
});

check('empty object returns kind=phase, body is the empty object', () => {
  const entry = {};
  const { kind, body } = unwrapPhaseEntry(entry);
  assert.equal(kind, 'phase');
  assert.equal(body, entry);
});

console.log('\n=== 53-01: normalisePhase equivalence ===');

const { loadTemplate } = require('../lib/workflow');
const fs = require('fs');
const path = require('path');
const os = require('os');

function writeTmp(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-v13-'));
  const f = path.join(dir, 'wf.yaml');
  fs.writeFileSync(f, content, 'utf8');
  return f;
}

check('bare and `phase:`-wrapped YAML produce structurally identical normalised phases', () => {
  const bareYaml = `workflow: w
version: 1
binds_to: quick
phases:
  - id: plan
    role: planner
  - id: execute
    role: implementer
    depends_on: [plan]
`;
  const wrappedYaml = `workflow: w
version: 1
binds_to: quick
phases:
  - phase:
      id: plan
      role: planner
  - phase:
      id: execute
      role: implementer
      depends_on: [plan]
`;
  const a = loadTemplate(writeTmp(bareYaml));
  const b = loadTemplate(writeTmp(wrappedYaml));
  assert.deepEqual(a.phases, b.phases);
});

check('`template:`-wrapped YAML parses; body marked with non-enumerable _wrapperKind', () => {
  const y = `workflow: w
version: 1
binds_to: quick
phases:
  - phase:
      id: plan
      role: planner
  - template:
      id: review
      name: review-and-address
      args:
        scope: auth
      after: [plan]
`;
  const t = loadTemplate(writeTmp(y));
  assert.equal(t.phases.length, 2);
  assert.equal(t.phases[0].id, 'plan');
  assert.equal(t.phases[1].id, 'review');
  // _wrapperKind is non-enumerable: must be readable but not in JSON
  assert.equal(t.phases[1]._wrapperKind, 'template');
  assert.equal(JSON.stringify(t.phases[1]).includes('_wrapperKind'), false);
  // Phase-wrapper entries should NOT carry _wrapperKind.
  assert.equal(t.phases[0]._wrapperKind, undefined);
});

if (failed === 0) {
  console.log(`\nAll ${passed} v1.3 schema tests passed.`);
  process.exit(0);
} else {
  console.log(`\n${failed} of ${passed + failed} tests failed:`);
  for (const f of failures) console.log('  -', f);
  process.exit(1);
}
