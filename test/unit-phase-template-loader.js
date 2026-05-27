'use strict';

/**
 * Unit tests for lib/phase-template-loader.js (Phase 54-01).
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadPhaseTemplate, resolvePhaseTemplate } = require('../lib/phase-template-loader');

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

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-loader-'));
  fs.mkdirSync(path.join(dir, '.planning', 'phase-templates'), { recursive: true });
  return dir;
}

function writeProjectTemplate(projectDir, name, contents) {
  const p = path.join(projectDir, '.planning', 'phase-templates', `${name}.yaml`);
  fs.writeFileSync(p, contents);
  return p;
}

console.log('=== 54-01: loadPhaseTemplate happy paths ===');

check('loads a minimal template with name + body', () => {
  const projectDir = mkProject();
  writeProjectTemplate(projectDir, 'minimal', `
name: minimal
role: reviewer
prompt: "Hello world."
`.trim());
  const t = loadPhaseTemplate('minimal', { projectDir });
  assert.equal(t.name, 'minimal');
  assert.deepEqual(t.params, []);
  assert.equal(t.body.role, 'reviewer');
  assert.equal(t.body.prompt, 'Hello world.');
  assert.ok(t.sourcePath.endsWith(path.join('phase-templates', 'minimal.yaml')));
});

check('parses params with mixed required + default', () => {
  const projectDir = mkProject();
  writeProjectTemplate(projectDir, 'with-params', `
name: with-params
params:
  - name: target
    default: "the diff"
  - name: scope
role: reviewer
prompt: "Review {{target}} in {{scope}}."
`.trim());
  const t = loadPhaseTemplate('with-params', { projectDir });
  assert.equal(t.params.length, 2);
  assert.deepEqual(t.params[0], { name: 'target', default: 'the diff' });
  assert.deepEqual(t.params[1], { name: 'scope' });
  // Body excludes name + params:
  assert.equal(Object.prototype.hasOwnProperty.call(t.body, 'name'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(t.body, 'params'), false);
});

check('project-scope template shadows the builtin namespace', () => {
  // Verified indirectly: lookup chain hits .planning/ first, so a project
  // file at .planning/phase-templates/<name>.yaml is returned even if a
  // builtin with the same name exists. We don't have a builtin with this
  // name in the test repo, but resolvePhaseTemplate returns the project
  // path first.
  const projectDir = mkProject();
  const p = writeProjectTemplate(projectDir, 'shadow', `name: shadow\nrole: x`);
  const resolved = resolvePhaseTemplate('shadow', { projectDir });
  assert.equal(resolved, p);
});

console.log('\n=== 54-01: loadPhaseTemplate error paths ===');

check('throws on missing template', () => {
  const projectDir = mkProject();
  assert.throws(() => loadPhaseTemplate('nope', { projectDir }), /Phase-template not found: nope/);
});

check('throws when top-level is not a mapping', () => {
  const projectDir = mkProject();
  writeProjectTemplate(projectDir, 'list', `- 1\n- 2`);
  assert.throws(() => loadPhaseTemplate('list', { projectDir }), /top-level must be a YAML mapping/);
});

check('throws when name is missing', () => {
  const projectDir = mkProject();
  writeProjectTemplate(projectDir, 'noname', `role: reviewer\nprompt: hi`);
  assert.throws(() => loadPhaseTemplate('noname', { projectDir }), /'name' must be a non-empty string/);
});

check('throws when name is empty string', () => {
  const projectDir = mkProject();
  writeProjectTemplate(projectDir, 'empty-name', `name: ""\nrole: reviewer`);
  assert.throws(() => loadPhaseTemplate('empty-name', { projectDir }), /'name' must be a non-empty string/);
});

check('throws when params is not an array', () => {
  const projectDir = mkProject();
  writeProjectTemplate(projectDir, 'bad-params', `name: bad-params\nparams: {target: x}\nrole: r`);
  assert.throws(() => loadPhaseTemplate('bad-params', { projectDir }), /'params' must be an array/);
});

check('throws when params item lacks name', () => {
  const projectDir = mkProject();
  writeProjectTemplate(projectDir, 'noname-param', `name: noname-param\nparams:\n  - default: x\nrole: r`);
  assert.throws(() => loadPhaseTemplate('noname-param', { projectDir }), /params\[0\]\.name must be a non-empty string/);
});

check('throws on duplicate param name', () => {
  const projectDir = mkProject();
  writeProjectTemplate(projectDir, 'dup', `name: dup\nparams:\n  - name: target\n  - name: target\nrole: r`);
  assert.throws(() => loadPhaseTemplate('dup', { projectDir }), /duplicate param name 'target'/);
});

check('throws when body contains caller-supplied id', () => {
  const projectDir = mkProject();
  writeProjectTemplate(projectDir, 'with-id', `name: with-id\nid: oops\nrole: reviewer`);
  assert.throws(() => loadPhaseTemplate('with-id', { projectDir }), /body field 'id' is supplied by the caller/);
});

check('throws when body contains caller-supplied depends_on', () => {
  const projectDir = mkProject();
  writeProjectTemplate(projectDir, 'with-deps', `name: with-deps\ndepends_on: [a]\nrole: reviewer`);
  assert.throws(() => loadPhaseTemplate('with-deps', { projectDir }), /body field 'depends_on' is supplied by the caller/);
});

check('throws on YAML parse error with file path in message', () => {
  const projectDir = mkProject();
  writeProjectTemplate(projectDir, 'broken', `name: broken\n  this is: : not valid yaml`);
  assert.throws(() => loadPhaseTemplate('broken', { projectDir }), /Phase-template parse error/);
});

console.log('\n=== 54-01: resolvePhaseTemplate lookup chain ===');

check('rejects empty name', () => {
  assert.throws(() => resolvePhaseTemplate('', {}), /non-empty string name/);
});

check('rejects whitespace-only name', () => {
  assert.throws(() => resolvePhaseTemplate('   ', {}), /non-empty string name/);
});

check('searched paths include both project and builtin', () => {
  const projectDir = mkProject();
  try {
    resolvePhaseTemplate('definitely-missing', { projectDir });
    throw new Error('expected throw');
  } catch (err) {
    assert.match(err.message, /\.planning[\\/]phase-templates[\\/]definitely-missing\.yaml/);
    assert.match(err.message, /templates[\\/]phase-templates[\\/]definitely-missing\.yaml/);
  }
});

if (failed === 0) {
  console.log(`\nAll ${passed} phase-template-loader tests passed.`);
  process.exit(0);
} else {
  console.log(`\n${failed} of ${passed + failed} tests failed:`);
  for (const f of failures) console.log('  -', f);
  process.exit(1);
}
