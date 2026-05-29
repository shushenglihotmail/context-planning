'use strict';

/**
 * Unit tests for lib/workflow-template-validate.js (Phase 92).
 *
 * Run: node test/unit-workflow-template-validate.js
 */

const assert = require('assert');
const path = require('path');

const {
  validatePreExpand,
  validatePostExpand,
  TemplateValidationError,
  ALLOWED_PARAM_FIELDS,
  FORBIDDEN_PARAM_FIELDS,
} = require(path.join(__dirname, '..', 'lib', 'workflow-template-validate.js'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err && err.message ? err.message : err}`);
    if (err && err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    failed++;
  }
}

function expectThrow(fn, predicate) {
  let thrown = null;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, 'expected function to throw');
  if (predicate) {
    assert.ok(predicate(thrown), `thrown error did not match predicate: ${thrown.message}`);
  }
  return thrown;
}

console.log('\n--- 92-01: constants, error class, exports ---');

test('exports the public API', () => {
  assert.strictEqual(typeof validatePreExpand, 'function');
  assert.strictEqual(typeof validatePostExpand, 'function');
  assert.strictEqual(typeof TemplateValidationError, 'function');
  assert.ok(Array.isArray(ALLOWED_PARAM_FIELDS));
  assert.ok(Array.isArray(FORBIDDEN_PARAM_FIELDS));
});

test('whitelist contains exactly the 5 allowed fields', () => {
  const expected = ['skill', 'prompt', 'description', 'max_children', 'min_children'];
  assert.deepStrictEqual(ALLOWED_PARAM_FIELDS.slice().sort(), expected.slice().sort());
});

test('forbidden list contains the 12 expected fields', () => {
  const expected = [
    'id', 'parent', 'after', 'depends_on', 'optimizable', 'runner',
    'outputs', 'title', 'require', 'invoke', 'config_fallback', 'completion',
  ];
  for (const f of expected) {
    assert.ok(FORBIDDEN_PARAM_FIELDS.includes(f), `forbidden list missing: ${f}`);
  }
});

test('allowed and forbidden lists are disjoint', () => {
  for (const f of ALLOWED_PARAM_FIELDS) {
    assert.ok(!FORBIDDEN_PARAM_FIELDS.includes(f), `field appears in both lists: ${f}`);
  }
});

test('TemplateValidationError carries structured fields', () => {
  const err = new TemplateValidationError({
    filePath: 'templates/workflows/foo.yaml',
    phaseId: 'bar',
    fieldPath: 'depends_on[0]',
    rule: 'field-not-parameterizable',
    token: '${config.x}',
  });
  assert.ok(err instanceof Error);
  assert.ok(err instanceof TemplateValidationError);
  assert.strictEqual(err.name, 'TemplateValidationError');
  assert.strictEqual(err.filePath, 'templates/workflows/foo.yaml');
  assert.strictEqual(err.phaseId, 'bar');
  assert.strictEqual(err.fieldPath, 'depends_on[0]');
  assert.strictEqual(err.rule, 'field-not-parameterizable');
  assert.strictEqual(err.token, '${config.x}');
  // message should include each field for debuggability
  assert.ok(err.message.includes('templates/workflows/foo.yaml'));
  assert.ok(err.message.includes('bar'));
  assert.ok(err.message.includes('depends_on[0]'));
  assert.ok(err.message.includes('${config.x}'));
});

console.log('\n--- 92-02: validatePreExpand (whitelist + {{x.y}} ban) ---');

test('passes a phase with no tokens at all', () => {
  validatePreExpand({
    id: 'plan',
    after: ['setup'],
    prompt: 'write a plan',
    skill: 'writing-plans',
  });
});

test('passes parameterization in allowed fields', () => {
  for (const field of ALLOWED_PARAM_FIELDS) {
    const phase = { id: 'plan' };
    if (field === 'max_children' || field === 'min_children') {
      phase[field] = '${config.foo}';
    } else {
      phase[field] = '${config.foo} and {{some_param}}';
    }
    validatePreExpand(phase);
  }
});

test('rejects ${config.x} in id field', () => {
  expectThrow(
    () => validatePreExpand({ id: '${config.x}', prompt: 'x' }),
    (e) => e instanceof TemplateValidationError && e.fieldPath === 'id' && e.rule === 'field-not-parameterizable'
  );
});

test('rejects {{x}} in after field', () => {
  expectThrow(
    () => validatePreExpand({ id: 'plan', after: ['{{prev}}'] }),
    (e) => e instanceof TemplateValidationError && /^after\[0\]$/.test(e.fieldPath)
  );
});

test('rejects ${config.x} in depends_on array element', () => {
  expectThrow(
    () => validatePreExpand({ id: 'plan', depends_on: ['${config.foo}'] }),
    (e) => e.fieldPath === 'depends_on[0]'
  );
});

test('rejects parameterization in each forbidden field individually', () => {
  for (const field of FORBIDDEN_PARAM_FIELDS) {
    const phase = { id: 'plan' };
    if (field === 'id') {
      phase.id = '${config.bad}';
    } else if (field === 'after' || field === 'depends_on' || field === 'outputs') {
      phase[field] = ['${config.bad}'];
    } else {
      phase[field] = '${config.bad}';
    }
    expectThrow(
      () => validatePreExpand(phase),
      (e) => e instanceof TemplateValidationError && e.rule === 'field-not-parameterizable'
    );
  }
});

test('rejects {{item.id}} in allowed field (prompt)', () => {
  expectThrow(
    () => validatePreExpand({ id: 'plan', prompt: 'work on {{item.id}}' }),
    (e) => e instanceof TemplateValidationError && e.rule === 'dotted-token-forbidden'
  );
});

test('rejects {{item.title}} in description (allowed field)', () => {
  expectThrow(
    () => validatePreExpand({ id: 'plan', description: 'handle {{item.title}}' }),
    (e) => e.rule === 'dotted-token-forbidden'
  );
});

test('rejects {{item.id}} in forbidden field (id) — flagged as dotted-token before whitelist', () => {
  // Either rule may fire first; we just want it to throw.
  expectThrow(
    () => validatePreExpand({ id: '{{item.id}}' }),
    (e) => e instanceof TemplateValidationError
  );
});

test('rejects {{anything.with.dots}} (not just `item.`)', () => {
  expectThrow(
    () => validatePreExpand({ id: 'plan', prompt: 'hello {{ctx.foo}}' }),
    (e) => e.rule === 'dotted-token-forbidden'
  );
});

test('walks into nested objects', () => {
  expectThrow(
    () => validatePreExpand({ id: 'plan', completion: { mode: '${config.x}' } }),
    (e) => e instanceof TemplateValidationError && e.fieldPath.startsWith('completion')
  );
});

test('reports filePath when supplied in opts', () => {
  const err = expectThrow(
    () => validatePreExpand({ id: 'plan', after: ['${config.x}'] }, { filePath: 'foo.yaml' }),
    () => true
  );
  assert.strictEqual(err.filePath, 'foo.yaml');
  assert.ok(err.message.includes('foo.yaml'));
});

test('reports phaseId when supplied (overrides phase.id)', () => {
  const err = expectThrow(
    () => validatePreExpand({ id: 'plan', after: ['${config.x}'] }, { phaseId: 'explicit-id' }),
    () => true
  );
  assert.strictEqual(err.phaseId, 'explicit-id');
});

test('phaseId falls back to phase.id when not supplied', () => {
  const err = expectThrow(
    () => validatePreExpand({ id: 'auto-id', after: ['${config.x}'] }),
    () => true
  );
  assert.strictEqual(err.phaseId, 'auto-id');
});

test('skipFields option respects skipping (for engine-internal fields)', () => {
  // Some workflow internal keys (e.g., `_wrapperKind`) may legitimately
  // carry computed strings; opts.skipFields lets the loader exclude them.
  validatePreExpand(
    { id: 'plan', _wrapperKind: '${config.x}' },
    { skipFields: ['_wrapperKind'] }
  );
});

console.log('\n--- 92-03: validatePostExpand (leftover token detection) ---');

test('passes a fully resolved phase with no tokens', () => {
  validatePostExpand({
    id: 'plan',
    prompt: 'write the design doc',
    skill: 'writing-plans',
    after: ['setup'],
  });
});

test('rejects leftover {{simple}} token in prompt', () => {
  expectThrow(
    () => validatePostExpand({ id: 'plan', prompt: 'do {{leftover}} now' }),
    (e) => e instanceof TemplateValidationError && e.rule === 'unresolved-token'
  );
});

test('rejects leftover {{item.id}} token in prompt', () => {
  expectThrow(
    () => validatePostExpand({ id: 'plan', prompt: 'work on {{item.id}}' }),
    (e) => e.rule === 'unresolved-token'
  );
});

test('rejects leftover token in array element', () => {
  expectThrow(
    () => validatePostExpand({ id: 'plan', after: ['{{x}}'] }),
    (e) => e.rule === 'unresolved-token' && e.fieldPath === 'after[0]'
  );
});

test('rejects leftover token in nested object', () => {
  expectThrow(
    () => validatePostExpand({ id: 'plan', completion: { signal: '{{nope}}' } }),
    (e) => e.rule === 'unresolved-token' && e.fieldPath.startsWith('completion')
  );
});

test('does not reject ${config.x} (those should have been handled earlier; we only flag {{...}})', () => {
  // ${...} tokens are NOT this validator's concern post-expand because
  // CONFIG_TOKEN_RE expansion throws on its own when unresolved.
  validatePostExpand({ id: 'plan', prompt: 'literal ${config.x} text' });
});

test('post-expand reports filePath + phaseId in error', () => {
  const err = expectThrow(
    () => validatePostExpand({ id: 'p', prompt: '{{x}}' }, { filePath: 'foo.yaml' }),
    () => true
  );
  assert.strictEqual(err.filePath, 'foo.yaml');
  assert.strictEqual(err.phaseId, 'p');
});

test('post-expand walks deeply nested structures', () => {
  expectThrow(
    () => validatePostExpand({
      id: 'p',
      completion: {
        when: {
          all_of: ['done', '{{ghost}}'],
        },
      },
    }),
    (e) => e.rule === 'unresolved-token' && /completion\.when\.all_of\[1\]/.test(e.fieldPath)
  );
});

console.log(`\nTests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
