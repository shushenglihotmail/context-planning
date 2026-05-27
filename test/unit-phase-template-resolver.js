'use strict';

/**
 * Unit tests for lib/phase-template-resolver.js (Phase 54-03).
 *
 * Covers: defaults merging, missing-required throw, unused-arg warning,
 * numeric/boolean cast at field boundary, after preservation,
 * chained resolution + depth cap (3), id-from-wrapper override.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const { resolvePhaseTemplateRef, MAX_DEPTH } = require('../lib/phase-template-resolver');

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err && err.message ? err.message : err}`);
    failed++;
  }
}

function makeProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-resolver-'));
  const tplDir = path.join(dir, '.planning', 'phase-templates');
  fs.mkdirSync(tplDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(tplDir, `${name}.yaml`), content, 'utf8');
  }
  return dir;
}

console.log('\nunit-phase-template-resolver:');

check('resolves a basic template with defaults', () => {
  const dir = makeProject({
    reviewer: yaml.stringify({
      name: 'reviewer',
      params: [{ name: 'scope', default: 'all' }],
      role: 'reviewer',
      prompt: 'Review {{scope}}.',
    }),
  });
  const { phase, warnings } = resolvePhaseTemplateRef(
    { id: 'review', template: { name: 'reviewer' }, depends_on: [] },
    { projectDir: dir }
  );
  assert.equal(phase.id, 'review');
  assert.equal(phase.role, 'reviewer');
  assert.equal(phase.prompt, 'Review all.');
  assert.deepEqual(warnings, []);
  assert.ok(!('template' in phase), 'template field should be erased');
});

check('caller args override defaults', () => {
  const dir = makeProject({
    reviewer: yaml.stringify({
      name: 'reviewer',
      params: [{ name: 'scope', default: 'all' }],
      prompt: 'Review {{scope}}.',
    }),
  });
  const { phase } = resolvePhaseTemplateRef(
    { id: 'r', template: { name: 'reviewer', args: { scope: 'auth' } }, depends_on: [] },
    { projectDir: dir }
  );
  assert.equal(phase.prompt, 'Review auth.');
});

check('missing required arg throws', () => {
  const dir = makeProject({
    reviewer: yaml.stringify({
      name: 'reviewer',
      params: [{ name: 'scope' }], // no default → required
      prompt: 'Review {{scope}}.',
    }),
  });
  assert.throws(
    () => resolvePhaseTemplateRef(
      { id: 'r', template: { name: 'reviewer' }, depends_on: [] },
      { projectDir: dir }
    ),
    /required param 'scope'/
  );
});

check('unused caller arg surfaces a warning', () => {
  const dir = makeProject({
    reviewer: yaml.stringify({
      name: 'reviewer',
      params: [{ name: 'scope', default: 'all' }],
      prompt: 'Review {{scope}}.',
    }),
  });
  const { warnings } = resolvePhaseTemplateRef(
    { id: 'r', template: { name: 'reviewer', args: { scope: 'auth', unused: 'x' } }, depends_on: [] },
    { projectDir: dir }
  );
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes("'unused'"), `unexpected warning: ${warnings[0]}`);
});

check('numeric field whole-string {{token}} casts to number', () => {
  const dir = makeProject({
    fan: yaml.stringify({
      name: 'fan',
      params: [{ name: 'n' }],
      role: 'parent',
      max_children: '{{n}}',
    }),
  });
  const { phase } = resolvePhaseTemplateRef(
    { id: 'p', template: { name: 'fan', args: { n: 5 } }, depends_on: [] },
    { projectDir: dir }
  );
  assert.strictEqual(phase.max_children, 5);
  assert.strictEqual(typeof phase.max_children, 'number');
});

check('boolean field whole-string {{token}} casts to boolean', () => {
  const dir = makeProject({
    fan: yaml.stringify({
      name: 'fan',
      params: [{ name: 'p' }],
      persist: '{{p}}',
    }),
  });
  const { phase } = resolvePhaseTemplateRef(
    { id: 'p', template: { name: 'fan', args: { p: true } }, depends_on: [] },
    { projectDir: dir }
  );
  assert.strictEqual(phase.persist, true);
});

check('after array from wrapper is copied to resolved phase', () => {
  const dir = makeProject({
    t: yaml.stringify({ name: 't', role: 'x' }),
  });
  const { phase } = resolvePhaseTemplateRef(
    { id: 'p', template: { name: 't' }, after: ['plan'], depends_on: [] },
    { projectDir: dir }
  );
  assert.deepEqual(phase.after, ['plan']);
});

check('id from wrapper overrides any id leakage from template body', () => {
  // body forbidden keys are caught by loader, but verify the resolver
  // pipeline still ends with wrapper id.
  const dir = makeProject({
    t: yaml.stringify({ name: 't', role: 'x' }),
  });
  const { phase } = resolvePhaseTemplateRef(
    { id: 'caller-id', template: { name: 't' }, depends_on: [] },
    { projectDir: dir }
  );
  assert.equal(phase.id, 'caller-id');
});

check('substitution inside arrays works', () => {
  const dir = makeProject({
    t: yaml.stringify({
      name: 't',
      params: [{ name: 'tag' }],
      principles: ['always-{{tag}}', 'never-stale'],
    }),
  });
  const { phase } = resolvePhaseTemplateRef(
    { id: 'p', template: { name: 't', args: { tag: 'fresh' } }, depends_on: [] },
    { projectDir: dir }
  );
  assert.deepEqual(phase.principles, ['always-fresh', 'never-stale']);
});

check('chained phase-template resolves up to depth 3', () => {
  const dir = makeProject({
    a: yaml.stringify({ name: 'a', template: { name: 'b' } }),
    b: yaml.stringify({ name: 'b', template: { name: 'c' } }),
    c: yaml.stringify({ name: 'c', role: 'leaf', prompt: 'done' }),
  });
  const { phase } = resolvePhaseTemplateRef(
    { id: 'p', template: { name: 'a' }, depends_on: [] },
    { projectDir: dir }
  );
  assert.equal(phase.role, 'leaf');
  assert.equal(phase.prompt, 'done');
  assert.ok(!('template' in phase));
});

check('chain depth > 3 throws', () => {
  const dir = makeProject({
    a: yaml.stringify({ name: 'a', template: { name: 'b' } }),
    b: yaml.stringify({ name: 'b', template: { name: 'c' } }),
    c: yaml.stringify({ name: 'c', template: { name: 'd' } }),
    d: yaml.stringify({ name: 'd', role: 'leaf' }),
  });
  assert.throws(
    () => resolvePhaseTemplateRef(
      { id: 'p', template: { name: 'a' }, depends_on: [] },
      { projectDir: dir }
    ),
    /chain depth exceeds 3/
  );
});

check('non-existent template throws not-found', () => {
  const dir = makeProject({});
  assert.throws(
    () => resolvePhaseTemplateRef(
      { id: 'p', template: { name: 'missing' }, depends_on: [] },
      { projectDir: dir }
    ),
    /not found/
  );
});

check('inner template must be object', () => {
  assert.throws(
    () => resolvePhaseTemplateRef(
      { id: 'p', template: 'not-object', depends_on: [] },
      { projectDir: process.cwd() }
    ),
    /must be an object/
  );
});

check('inner template.name required', () => {
  assert.throws(
    () => resolvePhaseTemplateRef(
      { id: 'p', template: { args: {} }, depends_on: [] },
      { projectDir: process.cwd() }
    ),
    /template\.name must be a non-empty string/
  );
});

check('depends_on from wrapper is preserved as array copy', () => {
  const dir = makeProject({
    t: yaml.stringify({ name: 't', role: 'x' }),
  });
  const deps = [];
  const { phase } = resolvePhaseTemplateRef(
    { id: 'p', template: { name: 't' }, depends_on: deps },
    { projectDir: dir }
  );
  assert.deepEqual(phase.depends_on, []);
  assert.notStrictEqual(phase.depends_on, deps, 'should be a copy');
});

check('MAX_DEPTH is 3 (DESIGN.md contract)', () => {
  assert.strictEqual(MAX_DEPTH, 3);
});

console.log(`unit-phase-template-resolver: ${passed} passed${failed ? `, ${failed} FAILED` : ''}`);
if (failed) process.exit(1);
