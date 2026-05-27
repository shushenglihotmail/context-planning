'use strict';

/**
 * Unit tests for lib/template-substitute.js (Phase 54-02).
 */

const assert = require('node:assert/strict');

const { substituteArgs } = require('../lib/template-substitute');

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

console.log('=== 54-02: substituteArgs string substitution ===');

check('replaces a single token in a string', () => {
  assert.equal(substituteArgs('hello {{name}}', { name: 'world' }), 'hello world');
});

check('replaces multiple tokens in one string', () => {
  assert.equal(
    substituteArgs('Review {{target}} in {{scope}}.', { target: 'auth', scope: 'src/' }),
    'Review auth in src/.'
  );
});

check('tolerates whitespace inside braces', () => {
  assert.equal(substituteArgs('{{ name }}', { name: 'x' }), 'x');
  assert.equal(substituteArgs('hi {{  name  }}', { name: 'x' }), 'hi x');
});

check('whole-string token returns the raw arg value (non-string)', () => {
  assert.equal(substituteArgs('{{count}}', { count: 42 }), 42);
  assert.equal(substituteArgs('{{flag}}', { flag: true }), true);
  assert.deepEqual(substituteArgs('{{list}}', { list: [1, 2] }), [1, 2]);
});

check('partial-string token coerces non-string values', () => {
  assert.equal(substituteArgs('count={{count}}', { count: 42 }), 'count=42');
  assert.equal(substituteArgs('flag={{flag}}', { flag: false }), 'flag=false');
});

check('throws on undeclared token, citing template name', () => {
  assert.throws(
    () => substituteArgs('hi {{missing}}', { name: 'x' }, { templateName: 'my-tpl' }),
    /Template 'my-tpl': undeclared substitution \{\{missing\}\}/
  );
});

check('throws even when only some tokens are declared', () => {
  assert.throws(
    () => substituteArgs('{{a}}-{{b}}', { a: '1' }),
    /undeclared substitution \{\{b\}\}/
  );
});

check('null and undefined arg values render as empty in mixed strings', () => {
  assert.equal(substituteArgs('x={{v}}.', { v: null }), 'x=.');
  assert.equal(substituteArgs('x={{v}}.', { v: undefined }), 'x=.');
});

check('whole-string token returns null when arg is null', () => {
  assert.equal(substituteArgs('{{v}}', { v: null }), null);
});

check('strings with no tokens pass through unchanged', () => {
  assert.equal(substituteArgs('plain text', { x: 1 }), 'plain text');
});

console.log('\n=== 54-02: substituteArgs recursive walk ===');

check('walks arrays element-by-element', () => {
  assert.deepEqual(
    substituteArgs(['{{a}}', 'lit', '{{b}}'], { a: 'x', b: 'y' }),
    ['x', 'lit', 'y']
  );
});

check('walks plain objects key-by-key', () => {
  const out = substituteArgs(
    { role: 'reviewer', prompt: 'Review {{target}}.' },
    { target: 'auth' }
  );
  assert.deepEqual(out, { role: 'reviewer', prompt: 'Review auth.' });
});

check('recurses through nested structures', () => {
  const out = substituteArgs(
    {
      role: 'reviewer',
      after: ['{{ref}}'],
      meta: { tags: ['{{tag}}', 'fixed'] },
    },
    { ref: 'plan', tag: 'security' }
  );
  assert.deepEqual(out, {
    role: 'reviewer',
    after: ['plan'],
    meta: { tags: ['security', 'fixed'] },
  });
});

check('leaves numbers and booleans untouched on the walk', () => {
  assert.deepEqual(
    substituteArgs({ a: 1, b: true, c: 'hi {{x}}' }, { x: 'there' }),
    { a: 1, b: true, c: 'hi there' }
  );
});

check('does not mutate the input value', () => {
  const input = { prompt: 'Review {{x}}', list: ['{{y}}'] };
  const snapshot = JSON.parse(JSON.stringify(input));
  substituteArgs(input, { x: 'a', y: 'b' });
  assert.deepEqual(input, snapshot);
});

console.log('\n=== 54-02: usedArgs tracking ===');

check('records every referenced arg name in opts.usedArgs', () => {
  const used = new Set();
  substituteArgs(
    { prompt: 'Review {{target}}.', after: ['{{ref}}'] },
    { target: 'auth', ref: 'plan', extra: 'unused' },
    { usedArgs: used }
  );
  assert.ok(used.has('target'));
  assert.ok(used.has('ref'));
  assert.ok(!used.has('extra'));
});

check('does not record args from undeclared lookups (it throws first)', () => {
  const used = new Set();
  assert.throws(() => substituteArgs('{{nope}}', {}, { usedArgs: used }));
  assert.equal(used.size, 0);
});

console.log('\n=== 54-02: token grammar ===');

check('rejects tokens with invalid identifier characters', () => {
  // `{{a-b}}` is not a token at all — should pass through as literal.
  assert.equal(substituteArgs('keep {{a-b}} as-is', { a: 'x' }), 'keep {{a-b}} as-is');
});

check('treats single-brace text as literal', () => {
  assert.equal(substituteArgs('just {one} brace', {}), 'just {one} brace');
});

check('empty args object still raises on any token', () => {
  assert.throws(() => substituteArgs('{{x}}', {}), /undeclared substitution/);
});

if (failed === 0) {
  console.log(`\nAll ${passed} template-substitute tests passed.`);
  process.exit(0);
} else {
  console.log(`\n${failed} of ${passed + failed} tests failed:`);
  for (const f of failures) console.log('  -', f);
  process.exit(1);
}
