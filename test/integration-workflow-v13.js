'use strict';

/**
 * Integration tests for v1.3 workflow template fixtures.
 *
 * Loads each fixture in templates/workflows/_fixtures-v13/ via the public
 * loadTemplate() API and asserts the expected ok/errors. This exercises the
 * YAML parse path end-to-end, complementing the pure-JS unit tests in
 * unit-workflow-schema-v13.js.
 */

const assert = require('node:assert/strict');
const path = require('path');

const { loadTemplate, validate } = require('../lib/workflow');

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

const fixturesDir = path.resolve(__dirname, '..', 'templates', 'workflows', '_fixtures-v13');
function fx(name) { return path.join(fixturesDir, name); }

console.log('=== v1.3 integration: fixture roundtrips ===');

check('bare-v12.yaml: loads and validates cleanly (no template flags)', () => {
  const t = loadTemplate(fx('bare-v12.yaml'));
  assert.equal(t.phases.length, 2);
  assert.equal(t.phases[0]._wrapperKind, undefined);
  assert.equal(t.phases[1]._wrapperKind, undefined);
  const r = validate(t);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

check('wrapped-phase.yaml: phase: wrappers normalise identically to bare', () => {
  const t = loadTemplate(fx('wrapped-phase.yaml'));
  assert.equal(t.phases.length, 2);
  // phase: wrappers do NOT carry _wrapperKind (only template: does).
  assert.equal(t.phases[0]._wrapperKind, undefined);
  assert.equal(t.phases[1]._wrapperKind, undefined);
  assert.equal(t.phases[0].id, 'plan');
  assert.equal(t.phases[1].id, 'execute');
  assert.deepEqual(t.phases[1].depends_on, ['plan']);
  const r = validate(t);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

check('template-include-stub.yaml: parses and surfaces expansion error for missing template', () => {
  // The fixture references a workflow-template that isn't shipped in the
  // legacy test fixtures dir, so 55-03 expansion fails and the wrapper
  // is left in place. The root-cause error is surfaced via validate().
  const t = loadTemplate(fx('template-include-stub.yaml'));
  assert.equal(t.phases.length, 2);
  assert.equal(t.phases[1]._wrapperKind, 'template');
  assert.equal(t.phases[1].name, 'review-and-address');
  assert.deepEqual(t.phases[1].args, { scope: 'auth' });
  const r = validate(t);
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) => e.includes('workflow-template expansion failed') && e.includes('not found')),
    `expected expansion-failed error, got: ${r.errors.join(' | ')}`
  );
  // No field-rules violations for this well-formed inclusion.
  const fieldErrs = r.errors.filter((e) =>
    e.includes('not allowed') || e.includes('must be an object')
  );
  assert.deepEqual(fieldErrs, [], `unexpected field errors: ${fieldErrs.join(' | ')}`);
});

check('error-template-with-prompt.yaml: rejects forbidden `prompt` on template inclusion', () => {
  const t = loadTemplate(fx('error-template-with-prompt.yaml'));
  const r = validate(t);
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) => e.includes("'prompt' not allowed on workflow-template inclusion")),
    `expected prompt-forbidden, got: ${r.errors.join(' | ')}`
  );
});

check('error-phase-template-override.yaml: rejects phase-level overrides on a template ref', () => {
  const t = loadTemplate(fx('error-phase-template-override.yaml'));
  const r = validate(t);
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) =>
      e.includes("'role' not allowed on a phase that references a template") ||
      e.includes("'prompt' not allowed on a phase that references a template")
    ),
    `expected override-forbidden, got: ${r.errors.join(' | ')}`
  );
});

check('runtime: v1.2 fixtures still loadable via public loadTemplate path', () => {
  // Loads the canonical quick workflow shipped with the package; ensures
  // no v1.3 changes have broken the v1.2 surface for real workflows.
  const t = loadTemplate(path.resolve(__dirname, '..', 'templates', 'workflows', 'quick.yaml'));
  const r = validate(t);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

if (failed === 0) {
  console.log(`\nAll ${passed} v1.3 integration tests passed.`);
  process.exit(0);
} else {
  console.log(`\n${failed} of ${passed + failed} tests failed:`);
  for (const f of failures) console.log('  -', f);
  process.exit(1);
}
