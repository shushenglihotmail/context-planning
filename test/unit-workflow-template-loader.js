'use strict';

/**
 * Unit tests for lib/workflow-template-loader.js (Phase 55-01).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const {
  loadWorkflowTemplate,
  resolveWorkflowTemplate,
  NAMESPACE_SEPARATOR,
} = require('../lib/workflow-template-loader');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-wftl-'));
  const tplDir = path.join(dir, '.planning', 'workflow-templates');
  fs.mkdirSync(tplDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(tplDir, `${name}.yaml`), content, 'utf8');
  }
  return dir;
}

console.log('\nunit-workflow-template-loader:');

check('loads a happy-path template with params + phases', () => {
  const dir = makeProject({
    review: yaml.stringify({
      name: 'review',
      params: [{ name: 'scope' }, { name: 'level', default: 'normal' }],
      phases: [
        { id: 'review', role: 'reviewer', prompt: 'Review {{scope}}.' },
        { id: 'address', after: ['review'], role: 'implementer' },
      ],
    }),
  });
  const t = loadWorkflowTemplate('review', { projectDir: dir });
  assert.equal(t.name, 'review');
  assert.equal(t.params.length, 2);
  assert.equal(t.params[0].name, 'scope');
  assert.equal(t.params[1].default, 'normal');
  assert.equal(t.phases.length, 2);
  assert.equal(t.phases[0].id, 'review');
  assert.equal(t.phases[1].id, 'address');
});

check('rejects missing name', () => {
  const dir = makeProject({
    bad: yaml.stringify({ phases: [{ id: 'x' }] }),
  });
  assert.throws(() => loadWorkflowTemplate('bad', { projectDir: dir }), /'name' must be/);
});

check('rejects top-level workflow:', () => {
  const dir = makeProject({
    bad: yaml.stringify({ name: 'bad', workflow: 'bad', phases: [{ id: 'x' }] }),
  });
  assert.throws(() => loadWorkflowTemplate('bad', { projectDir: dir }), /top-level 'workflow' is forbidden/);
});

check('rejects top-level version:', () => {
  const dir = makeProject({
    bad: yaml.stringify({ name: 'bad', version: 1, phases: [{ id: 'x' }] }),
  });
  assert.throws(() => loadWorkflowTemplate('bad', { projectDir: dir }), /top-level 'version' is forbidden/);
});

check('rejects empty phases array', () => {
  const dir = makeProject({
    bad: yaml.stringify({ name: 'bad', phases: [] }),
  });
  assert.throws(() => loadWorkflowTemplate('bad', { projectDir: dir }), /'phases' must be a non-empty array/);
});

check('rejects missing phases', () => {
  const dir = makeProject({
    bad: yaml.stringify({ name: 'bad' }),
  });
  assert.throws(() => loadWorkflowTemplate('bad', { projectDir: dir }), /'phases' must be a non-empty array/);
});

check('rejects internal id containing the reserved -- separator', () => {
  const dir = makeProject({
    bad: yaml.stringify({ name: 'bad', phases: [{ id: 'foo--bar' }] }),
  });
  assert.throws(() => loadWorkflowTemplate('bad', { projectDir: dir }), /must not contain the reserved '--' separator/);
});

check('rejects duplicate internal phase ids', () => {
  const dir = makeProject({
    bad: yaml.stringify({ name: 'bad', phases: [{ id: 'x' }, { id: 'x' }] }),
  });
  assert.throws(() => loadWorkflowTemplate('bad', { projectDir: dir }), /duplicate internal phase id 'x'/);
});

check('rejects phase missing id', () => {
  const dir = makeProject({
    bad: yaml.stringify({ name: 'bad', phases: [{ role: 'x' }] }),
  });
  assert.throws(() => loadWorkflowTemplate('bad', { projectDir: dir }), /must have a non-empty string 'id'/);
});

check('rejects params not an array', () => {
  const dir = makeProject({
    bad: yaml.stringify({ name: 'bad', params: 'oops', phases: [{ id: 'x' }] }),
  });
  assert.throws(() => loadWorkflowTemplate('bad', { projectDir: dir }), /params' must be an array/);
});

check('rejects param without name', () => {
  const dir = makeProject({
    bad: yaml.stringify({ name: 'bad', params: [{}], phases: [{ id: 'x' }] }),
  });
  assert.throws(() => loadWorkflowTemplate('bad', { projectDir: dir }), /params\[0\]\.name must be a non-empty string/);
});

check('rejects duplicate param name', () => {
  const dir = makeProject({
    bad: yaml.stringify({ name: 'bad', params: [{ name: 'x' }, { name: 'x' }], phases: [{ id: 'x' }] }),
  });
  assert.throws(() => loadWorkflowTemplate('bad', { projectDir: dir }), /duplicate param name 'x'/);
});

check('not-found error lists searched paths', () => {
  assert.throws(
    () => loadWorkflowTemplate('definitely-not-here', { projectDir: process.cwd() }),
    /Workflow-template not found: definitely-not-here.*Searched:/
  );
});

check('project-scope shadows builtin (project dir wins)', () => {
  // The repo ships no real workflow-templates yet, but the lookup order
  // is well-defined; this test exercises the project-scope path.
  const dir = makeProject({
    review: yaml.stringify({ name: 'review-PROJECT', phases: [{ id: 'p' }] }),
  });
  const t = loadWorkflowTemplate('review', { projectDir: dir });
  assert.equal(t.name, 'review-PROJECT');
  assert.ok(t.sourcePath.includes(path.join('.planning', 'workflow-templates')));
});

check('resolveWorkflowTemplate returns the file path without loading', () => {
  const dir = makeProject({
    x: yaml.stringify({ name: 'x', phases: [{ id: 'p' }] }),
  });
  const p = resolveWorkflowTemplate('x', { projectDir: dir });
  assert.ok(p.endsWith(path.join('workflow-templates', 'x.yaml')));
});

check('NAMESPACE_SEPARATOR is "--" (DESIGN.md contract)', () => {
  assert.strictEqual(NAMESPACE_SEPARATOR, '--');
});

console.log(`unit-workflow-template-loader: ${passed} passed${failed ? `, ${failed} FAILED` : ''}`);
if (failed) process.exit(1);
