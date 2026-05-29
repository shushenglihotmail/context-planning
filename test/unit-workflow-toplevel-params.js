'use strict';

/**
 * Phase 70 integration tests: top-level workflow `params:` processing
 * in lib/workflow.js loadTemplate. Verifies that:
 *   - `${config.<path>}` tokens in param defaults are interpolated
 *     against a project config (or the superpowers fallback table)
 *   - The resulting values are substituted into every top-level phase
 *     body via {{name}} tokens
 *   - Runtime tokens (declared neither in params nor cfg) are left
 *     intact so the runtime can substitute them later
 *   - Missing/unsupported paths surface as resolverErrors
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const { loadTemplate } = require('../lib/workflow');

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

function makeProject(templateFile, cfg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-wf-tlp-'));
  const tplPath = path.join(dir, 'wf.yaml');
  fs.writeFileSync(tplPath, templateFile, 'utf8');
  if (cfg !== undefined) {
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.planning', 'config.json'),
      JSON.stringify(cfg, null, 2),
      'utf8'
    );
  }
  return { dir, tplPath };
}

console.log('\nunit-workflow-toplevel-params:');

check('top-level params: superpowers fallback resolves zero-config', () => {
  const tpl = yaml.stringify({
    workflow: 'quick',
    binds_to: 'quick',
    params: [
      { name: 'design_skill', default: '${config.provider.quick_design_skill}' },
      { name: 'execute_skill', default: '${config.provider.execute_skill}' },
    ],
    phases: [
      { id: 'a', description: 'use {{design_skill}}', skill: '{{design_skill}}' },
      { id: 'b', description: 'use {{execute_skill}}', skill: '{{execute_skill}}', depends_on: ['a'] },
    ],
  });
  const { tplPath } = makeProject(tpl);
  const t = loadTemplate(tplPath);
  assert.deepStrictEqual(t._resolverErrors, []);
  assert.strictEqual(t.phases[0].skill, 'writing-plans');
  assert.strictEqual(t.phases[0].description, 'use writing-plans');
  assert.strictEqual(t.phases[1].skill, 'subagent-driven-development');
});

check('top-level params: project config overrides fallback', () => {
  const tpl = yaml.stringify({
    workflow: 'quick',
    binds_to: 'quick',
    params: [
      { name: 'execute_skill', default: '${config.provider.execute_skill}' },
    ],
    phases: [{ id: 'a', description: 'x {{execute_skill}}' }],
  });
  const { tplPath, dir } = makeProject(tpl, {
    cp: {},
    provider: { execute_skill: 'project-exec' },
  });
  const t = loadTemplate(tplPath, { projectDir: dir });
  assert.deepStrictEqual(t._resolverErrors, []);
  assert.strictEqual(t.phases[0].description, 'x project-exec');
});

check('top-level params: runtime tokens are left intact when declared as supervisor-supplied', () => {
  const tpl = yaml.stringify({
    workflow: 'quick',
    binds_to: 'quick',
    params: [
      { name: 'design_skill', default: '${config.provider.quick_design_skill}' },
      // No default → declared supervisor-supplied (v1.7).
      { name: 'task_description' },
    ],
    phases: [
      {
        id: 'a',
        description: 'skill={{design_skill}} task={{task_description}}',
      },
    ],
  });
  const { tplPath } = makeProject(tpl);
  const t = loadTemplate(tplPath);
  assert.deepStrictEqual(t._resolverErrors, []);
  assert.strictEqual(
    t.phases[0].description,
    'skill=writing-plans task={{task_description}}'
  );
});

check('top-level params: missing source.params is a silent no-op', () => {
  const tpl = yaml.stringify({
    workflow: 'demo',
    binds_to: 'quick',
    phases: [{ id: 'a', description: 'hello' }],
  });
  const { tplPath } = makeProject(tpl);
  const t = loadTemplate(tplPath);
  assert.deepStrictEqual(t._resolverErrors, []);
  assert.deepStrictEqual(t.params, []);
  assert.strictEqual(t.phases[0].description, 'hello');
});

check('top-level params: unknown ${config...} path with no fallback yields resolverErrors', () => {
  const tpl = yaml.stringify({
    workflow: 'demo',
    binds_to: 'quick',
    params: [{ name: 'x', default: '${config.does.not.exist}' }],
    phases: [{ id: 'a', description: '{{x}}' }],
  });
  const { tplPath } = makeProject(tpl);
  const t = loadTemplate(tplPath);
  assert.ok(t._resolverErrors.length > 0, 'expected at least one resolver error');
  assert.ok(
    /does\.not\.exist/.test(t._resolverErrors.join('\n')),
    'error mentions the unresolved path'
  );
});

check('top-level params: param without default is accepted as supervisor-supplied (v1.7)', () => {
  const tpl = yaml.stringify({
    workflow: 'demo',
    binds_to: 'quick',
    params: [{ name: 'x' }],
    phases: [{ id: 'a', description: '{{x}}' }],
  });
  const { tplPath } = makeProject(tpl);
  const t = loadTemplate(tplPath);
  assert.deepStrictEqual(t._resolverErrors, []);
  // {{x}} survives post-expand validation because x is declared.
  assert.strictEqual(t.phases[0].description, '{{x}}');
});

check('top-level params: undeclared runtime token is rejected post-expand (v1.7)', () => {
  const tpl = yaml.stringify({
    workflow: 'demo',
    binds_to: 'quick',
    params: [],
    phases: [{ id: 'a', description: 'task={{not_declared}}' }],
  });
  const { tplPath } = makeProject(tpl);
  const t = loadTemplate(tplPath);
  assert.ok(t._resolverErrors.length > 0, 'expected at least one resolver error');
  assert.ok(
    /unresolved-token/.test(t._resolverErrors.join('\n')),
    'error mentions unresolved-token rule'
  );
});

check('top-level params: t.params is exposed for inspection', () => {
  const tpl = yaml.stringify({
    workflow: 'demo',
    binds_to: 'quick',
    params: [
      { name: 'a', default: 'literal' },
      { name: 'b', default: '${config.provider.execute_skill}' },
    ],
    phases: [{ id: 'p', description: '{{a}} {{b}}' }],
  });
  const { tplPath } = makeProject(tpl);
  const t = loadTemplate(tplPath);
  assert.deepStrictEqual(t._resolverErrors, []);
  assert.strictEqual(t.params.length, 2);
  assert.strictEqual(t.params[0].name, 'a');
  assert.strictEqual(t.phases[0].description, 'literal subagent-driven-development');
});

console.log(
  failed
    ? `unit-workflow-toplevel-params: ${passed} passed, ${failed} FAILED`
    : `unit-workflow-toplevel-params: ${passed} passed`
);
if (failed) process.exit(1);
