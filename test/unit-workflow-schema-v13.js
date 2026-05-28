'use strict';

/**
 * Unit tests for v1.3 workflow template schema additions.
 *
 * Covers the new `phase:` / `template:` YAML wrapper shapes (Phase 53),
 * template-arg resolution (Phase 54), workflow-template expansion
 * (Phase 55). Plan 53-01 — wrapper-recognition + auto-wrap helper.
 */

const assert = require('node:assert/strict');

const { unwrapPhaseEntry, loadTemplate } = require('../lib/workflow');

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

check('bare v1.2 phase entry returns kind=bare (rejected by validator in v1.4)', () => {
  const entry = { id: 'plan', role: 'planner' };
  const { kind, body } = unwrapPhaseEntry(entry);
  assert.equal(kind, 'bare');
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

check('multi-key entry with `phase` key is classified as bare (not wrapped)', () => {
  // A bare v1.2 entry that happens to have a `phase:` field but is not a
  // wrapper (multiple top-level keys) must NOT be misclassified.
  const entry = { id: 'x', phase: 'something', role: 'planner' };
  const { kind, body } = unwrapPhaseEntry(entry);
  assert.equal(kind, 'bare');
  assert.equal(body, entry);
});

check('non-object entry returns kind=bare with body=entry', () => {
  const { kind, body } = unwrapPhaseEntry(null);
  assert.equal(kind, 'bare');
  assert.equal(body, null);

  const r2 = unwrapPhaseEntry('oops');
  assert.equal(r2.kind, 'bare');
  assert.equal(r2.body, 'oops');
});

check('array entry returns kind=bare with body=entry (not a wrapper)', () => {
  const arr = [1, 2, 3];
  const { kind, body } = unwrapPhaseEntry(arr);
  assert.equal(kind, 'bare');
  assert.equal(body, arr);
});

check('empty object returns kind=bare, body is the empty object', () => {
  const entry = {};
  const { kind, body } = unwrapPhaseEntry(entry);
  assert.equal(kind, 'bare');
  assert.equal(body, entry);
});

console.log('\n=== 53-01: normalisePhase equivalence ===');

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
  // v1.4: bare-form is now rejected at validate(), but loadTemplate +
  // normalisePhase still parses both shapes to a comparable structure.
  // The only difference is `_wrapperKind` (non-enumerable, excluded from
  // deepEqual). Both pick up `description:` only when supplied.
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
  // But the underlying wrapper kinds differ.
  assert.equal(a.phases[0]._wrapperKind, 'bare');
  assert.equal(b.phases[0]._wrapperKind, 'phase');
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
      name: nonexistent-template-for-test
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
  // v1.4: phase-wrapper entries DO carry _wrapperKind='phase'.
  assert.equal(t.phases[0]._wrapperKind, 'phase');
});

console.log('\n=== 53-02: validate() routes template entries through guard ===');

const { validate } = require('../lib/workflow');

function tmpl(phases) {
  return {
    meta: { workflow: 'v13-test', version: 1, binds_to: 'quick' },
    principles: [],
    defaults: {},
    phases,
  };
}

function mark(obj, kind) {
  Object.defineProperty(obj, '_wrapperKind', { value: kind, enumerable: false });
  return obj;
}

check('v1.2 bare-equivalent phases still validate ok', () => {
  const r = validate(tmpl([
    { id: 'plan', depends_on: [] },
    { id: 'execute', depends_on: ['plan'] },
  ]));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

check('phase entries with `_wrapperKind: phase` validate identically to bare (when description present)', () => {
  const r = validate(tmpl([
    mark({ id: 'plan', description: 'plan', depends_on: [] }, 'phase'),
    mark({ id: 'execute', description: 'execute', depends_on: ['plan'] }, 'phase'),
  ]));
  assert.deepEqual(r.errors, []);
});

check('template entry that bypasses loadTemplate expansion validates field-rules only', () => {
  // validate() is normally fed AFTER loadTemplate's expansion pass. When
  // called directly on a tmpl() containing a `template:` wrapper (as in
  // these unit tests), expansion did NOT run, so the field-rules branch
  // is the only thing that fires. A well-formed wrapper should validate
  // cleanly (no guard error from v1.2/53-x).
  const r = validate(tmpl([
    { id: 'plan', depends_on: [] },
    mark({ id: 'review', name: 'review-and-address', args: { scope: 'auth' }, after: ['plan'] }, 'template'),
  ]));
  assert.ok(
    !r.errors.some((e) => /not yet implemented/i.test(e)),
    `no obsolete guard error expected, got: ${r.errors.join(' | ')}`
  );
});

check('template entry still validates id uniqueness against sibling phases', () => {
  const r = validate(tmpl([
    { id: 'plan', depends_on: [] },
    mark({ id: 'plan', name: 'wf-template' }, 'template'),
  ]));
  assert.ok(
    r.errors.some((e) => e.toLowerCase().includes('duplicate phase id')),
    `expected duplicate-id error, got: ${r.errors.join(' | ')}`
  );
});

check('template entry skips depends_on validation (uses after)', () => {
  // A template entry without depends_on must NOT fire the v1.2
  // "depends_on must be an array" path. After Phase 55 the wrapper itself
  // is no longer flagged as "not yet implemented" — a well-formed wrapper
  // should produce zero errors when validate() is called in isolation.
  const r = validate(tmpl([
    mark({ id: 'review', name: 'wf-template' }, 'template'),
  ]));
  assert.deepEqual(r.errors, [], `expected no errors, got: ${r.errors.join(' | ')}`);
});

check('DAG analysis is skipped when any template entry is present', () => {
  // Adds an `after:` reference to the template; with templates present
  // we should NOT see a "depends_on references unknown phase" error, and
  // we should NOT see a topo-order warning.
  const r = validate(tmpl([
    { id: 'plan', depends_on: [] },
    mark({ id: 'review', name: 'wf-template', after: ['plan'] }, 'template'),
    { id: 'execute', depends_on: ['plan'] },
  ]));
  assert.ok(
    !r.errors.some((e) => e.includes('references unknown phase')),
    `unexpected dep-resolution error: ${r.errors.join(' | ')}`
  );
  assert.ok(
    !r.warnings.some((w) => w.toLowerCase().includes('topological')),
    `unexpected topo warning: ${r.warnings.join(' | ')}`
  );
});

console.log('\n=== 53-03: field-rules enforcement ===');

// --- workflow-template inclusion (kind=template) field rules ---

check('template inclusion requires `name`', () => {
  const r = validate(tmpl([
    mark({ id: 'review', args: { scope: 'auth' } }, 'template'),
  ]));
  assert.ok(
    r.errors.some((e) => e.includes('workflow-template inclusion requires a non-empty string')),
    `expected name-required error, got: ${r.errors.join(' | ')}`
  );
});

check('template inclusion rejects forbidden keys (e.g. prompt, parent)', () => {
  const r = validate(tmpl([
    mark({ id: 'review', name: 'wf', prompt: 'oops', parent: 'plan' }, 'template'),
  ]));
  assert.ok(
    r.errors.some((e) => e.includes("'prompt' not allowed on workflow-template inclusion")),
    `expected prompt-forbidden error, got: ${r.errors.join(' | ')}`
  );
  assert.ok(
    r.errors.some((e) => e.includes("'parent' not allowed on workflow-template inclusion")),
    `expected parent-forbidden error, got: ${r.errors.join(' | ')}`
  );
});

check('template inclusion accepts only id+name+args+after', () => {
  const r = validate(tmpl([
    mark({ id: 'review', name: 'wf', args: { x: 1 }, after: [] }, 'template'),
  ]));
  // Only the guard error should remain — no field-rules errors.
  const fieldErrs = r.errors.filter((e) =>
    e.includes('not allowed') || e.includes('must be') || e.includes('requires a non-empty')
  );
  assert.deepEqual(fieldErrs, [], `expected no field-rules errors, got: ${fieldErrs.join(' | ')}`);
});

check('template inclusion rejects non-object args', () => {
  const r = validate(tmpl([
    mark({ id: 'review', name: 'wf', args: 'oops' }, 'template'),
  ]));
  assert.ok(
    r.errors.some((e) => e.includes('args must be an object')),
    `expected args-object error, got: ${r.errors.join(' | ')}`
  );
});

check('template inclusion rejects user-set non-empty depends_on', () => {
  const r = validate(tmpl([
    { id: 'plan', depends_on: [] },
    mark({ id: 'review', name: 'wf', depends_on: ['plan'] }, 'template'),
  ]));
  assert.ok(
    r.errors.some((e) => e.includes("'depends_on' not allowed on workflow-template inclusion")),
    `expected depends_on-forbidden error, got: ${r.errors.join(' | ')}`
  );
});

// --- phase-template reference (phase wrapper with inner template:) field rules ---

check('phase with inner template (well-formed) produces no obsolete guard error', () => {
  const r = validate(tmpl([
    mark({ id: 'execute', template: { name: 'docker-build', args: { image: 'api' } } }, 'phase'),
  ]));
  assert.ok(
    !r.errors.some((e) => /not yet implemented/i.test(e)),
    `no obsolete guard error expected, got: ${r.errors.join(' | ')}`
  );
});

check('phase-template reference requires template.name as string', () => {
  const r = validate(tmpl([
    mark({ id: 'execute', template: { args: { image: 'api' } } }, 'phase'),
  ]));
  assert.ok(
    r.errors.some((e) => e.includes('template.name must be a non-empty string')),
    `expected template.name error, got: ${r.errors.join(' | ')}`
  );
});

check('phase-template reference rejects inner template keys other than name+args', () => {
  const r = validate(tmpl([
    mark({ id: 'execute', template: { name: 'wf', args: {}, weird: true } }, 'phase'),
  ]));
  assert.ok(
    r.errors.some((e) => e.includes('template.weird not allowed')),
    `expected template.weird error, got: ${r.errors.join(' | ')}`
  );
});

check('phase-template reference rejects phase-level overrides (e.g. prompt, parent)', () => {
  const r = validate(tmpl([
    mark({ id: 'execute', template: { name: 'wf' }, prompt: 'oops', parent: 'plan' }, 'phase'),
  ]));
  assert.ok(
    r.errors.some((e) => e.includes("'prompt' not allowed on a phase that references a template")),
    `expected prompt-override error, got: ${r.errors.join(' | ')}`
  );
  assert.ok(
    r.errors.some((e) => e.includes("'parent' not allowed on a phase that references a template")),
    `expected parent-override error, got: ${r.errors.join(' | ')}`
  );
});

check('phase-template reference allows id+template+after only', () => {
  const r = validate(tmpl([
    { id: 'plan', depends_on: [] },
    mark({ id: 'execute', template: { name: 'wf' }, after: ['plan'] }, 'phase'),
  ]));
  const fieldErrs = r.errors.filter((e) =>
    e.includes('not allowed') || e.includes('must be a non-empty')
  );
  assert.deepEqual(fieldErrs, [], `expected no field-rules errors, got: ${fieldErrs.join(' | ')}`);
});

check('phase-template reference rejects non-object inner template', () => {
  const r = validate(tmpl([
    mark({ id: 'execute', template: 'docker-build' }, 'phase'),
  ]));
  assert.ok(
    r.errors.some((e) => e.includes("inner 'template' must be an object")),
    `expected inner-object error, got: ${r.errors.join(' | ')}`
  );
});

check('phase-template reference rejects user-set non-empty depends_on', () => {
  const r = validate(tmpl([
    { id: 'plan', depends_on: [] },
    mark({ id: 'execute', template: { name: 'wf' }, depends_on: ['plan'] }, 'phase'),
  ]));
  assert.ok(
    r.errors.some((e) => e.includes("'depends_on' not allowed on a phase that references a template")),
    `expected depends_on-forbidden error, got: ${r.errors.join(' | ')}`
  );
});

if (failed === 0) {
  console.log(`\nAll ${passed} v1.3 schema tests passed.`);
  process.exit(0);
} else {
  console.log(`\n${failed} of ${passed + failed} tests failed:`);
  for (const f of failures) console.log('  -', f);
  process.exit(1);
}
