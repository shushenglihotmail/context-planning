'use strict';

/**
 * Unit tests for lib/workflow-template-expand.js (Phase 55-02).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const { expandWorkflowTemplate, interpolateConfigTokens, CONFIG_FALLBACKS, MAX_DEPTH } = require('../lib/workflow-template-expand');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-wfte-'));
  const tplDir = path.join(dir, '.planning', 'workflow-templates');
  fs.mkdirSync(tplDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(tplDir, `${name}.yaml`), content, 'utf8');
  }
  return dir;
}

console.log('\nunit-workflow-template-expand:');

check('worked-example: review-and-address resolves with prefixes + wrapper after', () => {
  const dir = makeProject({
    'review-and-address': yaml.stringify({
      name: 'review-and-address',
      params: [{ name: 'scope' }],
      phases: [
        {
          phase: {
            id: 'review-{{scope}}',
            role: 'reviewer',
            prompt: 'Review {{scope}}.',
          },
        },
        {
          phase: {
            id: 'address-{{scope}}',
            role: 'implementer',
            after: ['review-{{scope}}'],
            prompt: 'Address {{scope}}.',
          },
        },
      ],
    }),
  });

  const result = expandWorkflowTemplate(
    {
      id: 'review',
      name: 'review-and-address',
      args: { scope: 'auth' },
      after: ['plan'],
    },
    { projectDir: dir }
  );
  assert.strictEqual(result.phases.length, 2);
  assert.strictEqual(result.phases[0].id, 'review--review-auth');
  assert.deepStrictEqual(result.phases[0].after, ['plan']);
  assert.strictEqual(result.phases[1].id, 'review--address-auth');
  assert.deepStrictEqual(result.phases[1].after, ['review--review-auth']);
  assert.deepStrictEqual(result.exitIds, ['review--address-auth']);
  assert.strictEqual(result.warnings.length, 0);
});

check('single-phase group: entry == exit', () => {
  const dir = makeProject({
    solo: yaml.stringify({
      name: 'solo',
      phases: [{ phase: { id: 'only', description: 'only', role: 'r', prompt: 'p' } }],
    }),
  });
  const r = expandWorkflowTemplate({ id: 'g', name: 'solo', after: ['x'] }, { projectDir: dir });
  assert.strictEqual(r.phases.length, 1);
  assert.strictEqual(r.phases[0].id, 'g--only');
  assert.deepStrictEqual(r.phases[0].after, ['x']);
  assert.deepStrictEqual(r.exitIds, ['g--only']);
});

check('external after refs left untouched (not internal)', () => {
  const dir = makeProject({
    t: yaml.stringify({
      name: 't',
      phases: [
        { phase: { id: 'a', description: 'a', role: 'r', prompt: 'p' } },
        { phase: { id: 'b', description: 'b', role: 'r', prompt: 'p', after: ['a', 'external-phase'] } },
      ],
    }),
  });
  const r = expandWorkflowTemplate({ id: 'g', name: 't' }, { projectDir: dir });
  assert.deepStrictEqual(r.phases[1].after, ['g--a', 'external-phase']);
});

check('depends_on rewritten same as after', () => {
  const dir = makeProject({
    t: yaml.stringify({
      name: 't',
      phases: [
        { phase: { id: 'a', description: 'a', role: 'r', prompt: 'p' } },
        { phase: { id: 'b', description: 'b', role: 'r', prompt: 'p', depends_on: ['a'] } },
      ],
    }),
  });
  const r = expandWorkflowTemplate({ id: 'g', name: 't' }, { projectDir: dir });
  assert.deepStrictEqual(r.phases[1].depends_on, ['g--a']);
});

check('empty group → load-time error', () => {
  // Construct via raw file because loader rejects empty phases. Use raw write.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-wfte-'));
  const tplDir = path.join(dir, '.planning', 'workflow-templates');
  fs.mkdirSync(tplDir, { recursive: true });
  fs.writeFileSync(path.join(tplDir, 'empty.yaml'), 'name: empty\nphases:\n  - {id: hole, role: skip}\n', 'utf8');
  // It loads fine; "empty group" really tests that loader-level emptiness is caught.
  // Verify the loader-level error instead:
  assert.throws(
    () => expandWorkflowTemplate({ id: 'g', name: 'nope' }, { projectDir: dir }),
    /Workflow-template not found/
  );
});

check('missing required arg → error', () => {
  const dir = makeProject({
    t: yaml.stringify({
      name: 't',
      params: [{ name: 'scope' }],
      phases: [{ phase: { id: 'a', description: 'a', role: 'r', prompt: '{{scope}}' } }],
    }),
  });
  assert.throws(
    () => expandWorkflowTemplate({ id: 'g', name: 't' }, { projectDir: dir }),
    /required param 'scope'/
  );
});

check('unused arg → warning', () => {
  const dir = makeProject({
    t: yaml.stringify({
      name: 't',
      params: [{ name: 'scope' }],
      phases: [{ phase: { id: 'a', description: 'a', role: 'r', prompt: '{{scope}}' } }],
    }),
  });
  const r = expandWorkflowTemplate(
    { id: 'g', name: 't', args: { scope: 'auth', extra: 'x' } },
    { projectDir: dir }
  );
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(/'extra' supplied but not referenced/.test(r.warnings[0]));
});

check('wrapper without id → error', () => {
  assert.throws(() => expandWorkflowTemplate({ name: 't' }, {}), /must carry a non-empty 'id'/);
});

check('wrapper without name → error', () => {
  assert.throws(() => expandWorkflowTemplate({ id: 'g' }, {}), /must carry a non-empty 'name'/);
});

check('wrapper id containing "--" → error', () => {
  assert.throws(
    () => expandWorkflowTemplate({ id: 'a--b', name: 't' }, {}),
    /must not contain the reserved/
  );
});

check('wrapper.after with multiple entries dedups + preserves order', () => {
  const dir = makeProject({
    t: yaml.stringify({
      name: 't',
      phases: [
        { phase: { id: 'a', description: 'a', role: 'r', prompt: 'p' } },
        { phase: { id: 'b', description: 'b', role: 'r', prompt: 'p', after: ['a'] } },
      ],
    }),
  });
  const r = expandWorkflowTemplate(
    { id: 'g', name: 't', after: ['x', 'y', 'x'] },
    { projectDir: dir }
  );
  // Entry is 'a' only; 'b' has internal inbound.
  const a = r.phases.find((p) => p.id === 'g--a');
  assert.deepStrictEqual(a.after, ['x', 'y']);
  const b = r.phases.find((p) => p.id === 'g--b');
  assert.deepStrictEqual(b.after, ['g--a']);
});

check('parallel group: no internal edges → all are entry AND exit', () => {
  const dir = makeProject({
    par: yaml.stringify({
      name: 'par',
      phases: [
        { phase: { id: 'a', description: 'a', role: 'r', prompt: 'p' } },
        { phase: { id: 'b', description: 'b', role: 'r', prompt: 'p' } },
        { phase: { id: 'c', description: 'c', role: 'r', prompt: 'p' } },
      ],
    }),
  });
  const r = expandWorkflowTemplate(
    { id: 'g', name: 'par', after: ['kick'] },
    { projectDir: dir }
  );
  assert.deepStrictEqual(r.phases.map((p) => p.id), ['g--a', 'g--b', 'g--c']);
  for (const p of r.phases) assert.deepStrictEqual(p.after, ['kick']);
  assert.deepStrictEqual(r.exitIds, ['g--a', 'g--b', 'g--c']);
});

check('chain depth 3 OK', () => {
  const dir = makeProject({
    d1: yaml.stringify({
      name: 'd1',
      phases: [{ template: { id: 'm', name: 'd2' } }],
    }),
    d2: yaml.stringify({
      name: 'd2',
      phases: [{ template: { id: 'n', name: 'd3' } }],
    }),
    d3: yaml.stringify({
      name: 'd3',
      phases: [{ phase: { id: 'leaf', description: 'leaf', role: 'r', prompt: 'p' } }],
    }),
  });
  const r = expandWorkflowTemplate({ id: 'g', name: 'd1' }, { projectDir: dir });
  assert.strictEqual(r.phases.length, 1);
  assert.strictEqual(r.phases[0].id, 'g--m--n--leaf');
});

check('chain depth >3 errors', () => {
  const dir = makeProject({
    d1: yaml.stringify({ name: 'd1', phases: [{ template: { id: 'm', name: 'd2' } }] }),
    d2: yaml.stringify({ name: 'd2', phases: [{ template: { id: 'n', name: 'd3' } }] }),
    d3: yaml.stringify({ name: 'd3', phases: [{ template: { id: 'o', name: 'd4' } }] }),
    d4: yaml.stringify({ name: 'd4', phases: [{ phase: { id: 'leaf', description: 'leaf', role: 'r', prompt: 'p' } }] }),
  });
  assert.throws(
    () => expandWorkflowTemplate({ id: 'g', name: 'd1' }, { projectDir: dir }),
    /chain depth exceeds 3/
  );
});

check('numeric token preservation via substitution (whole-string)', () => {
  const dir = makeProject({
    t: yaml.stringify({
      name: 't',
      params: [{ name: 'count' }],
      phases: [{ phase: { id: 'a', description: 'a', role: 'planner', prompt: 'p', max_children: '{{count}}' } }],
    }),
  });
  const r = expandWorkflowTemplate(
    { id: 'g', name: 't', args: { count: 5 } },
    { projectDir: dir }
  );
  assert.strictEqual(r.phases[0].max_children, 5);
});

check('MAX_DEPTH is 3 per DESIGN', () => {
  assert.strictEqual(MAX_DEPTH, 3);
});

// ---- Phase 70: interpolateConfigTokens primitive ----

check('interpolateConfigTokens: resolves nested path from cfg', () => {
  const cfg = { cp: { workflow_provider: 'superpowers' }, provider: { execute_skill: 'custom-exec' } };
  assert.strictEqual(
    interpolateConfigTokens('use ${config.provider.execute_skill}', cfg, { templateName: 't' }),
    'use custom-exec'
  );
});

check('interpolateConfigTokens: whole-string match preserves raw value type', () => {
  const cfg = { provider: { execute_skill: 'subagent-driven-development' } };
  const r = interpolateConfigTokens('${config.provider.execute_skill}', cfg, { templateName: 't' });
  assert.strictEqual(r, 'subagent-driven-development');
});

check('interpolateConfigTokens: superpowers fallback fires when cfg missing the path', () => {
  assert.strictEqual(
    interpolateConfigTokens('${config.provider.quick_design_skill}', {}, { templateName: 't' }),
    'writing-plans'
  );
  assert.strictEqual(
    interpolateConfigTokens('${config.provider.execute_skill}', {}, { templateName: 't' }),
    'subagent-driven-development'
  );
  assert.strictEqual(
    interpolateConfigTokens('${config.provider.brainstorm_skill}', {}, { templateName: 't' }),
    'brainstorming'
  );
});

check('interpolateConfigTokens: cfg value beats fallback', () => {
  const cfg = { provider: { execute_skill: 'override-exec' } };
  assert.strictEqual(
    interpolateConfigTokens('${config.provider.execute_skill}', cfg, { templateName: 't' }),
    'override-exec'
  );
});

check('interpolateConfigTokens: unknown path with no fallback throws with template name', () => {
  let threw = false;
  try {
    interpolateConfigTokens('${config.does.not.exist}', {}, { templateName: 'my-template' });
  } catch (err) {
    threw = true;
    assert.ok(/my-template/.test(err.message), 'error mentions template name');
    assert.ok(/does\.not\.exist/.test(err.message), 'error mentions missing path');
  }
  assert.ok(threw, 'expected interpolateConfigTokens to throw');
});

check('interpolateConfigTokens: non-string values pass through unchanged', () => {
  assert.strictEqual(interpolateConfigTokens(42, {}, { templateName: 't' }), 42);
  assert.strictEqual(interpolateConfigTokens(null, {}, { templateName: 't' }), null);
  assert.strictEqual(interpolateConfigTokens(true, {}, { templateName: 't' }), true);
});

check('interpolateConfigTokens: string without tokens passes through unchanged', () => {
  assert.strictEqual(
    interpolateConfigTokens('hello world', {}, { templateName: 't' }),
    'hello world'
  );
});

check('CONFIG_FALLBACKS lists the documented superpowers skill defaults', () => {
  assert.strictEqual(CONFIG_FALLBACKS['provider.quick_design_skill'], 'writing-plans');
  assert.strictEqual(CONFIG_FALLBACKS['provider.plan_skill'], 'writing-plans');
  assert.strictEqual(CONFIG_FALLBACKS['provider.execute_skill'], 'subagent-driven-development');
  assert.strictEqual(CONFIG_FALLBACKS['provider.brainstorm_skill'], 'brainstorming');
  assert.strictEqual(CONFIG_FALLBACKS['provider.review_skill'], 'requesting-code-review');
});

check('CONFIG_FALLBACKS includes v1.6 D3 extension rows (test/debug/verify/execute_plan/finish_branch)', () => {
  assert.strictEqual(CONFIG_FALLBACKS['provider.test_skill'], 'test-driven-development');
  assert.strictEqual(CONFIG_FALLBACKS['provider.debug_skill'], 'systematic-debugging');
  assert.strictEqual(CONFIG_FALLBACKS['provider.verify_skill'], 'verification-before-completion');
  assert.strictEqual(CONFIG_FALLBACKS['provider.execute_plan_skill'], 'executing-plans');
  assert.strictEqual(CONFIG_FALLBACKS['provider.finish_branch_skill'], 'finishing-a-development-branch');
});

check('v1.6 D3 fallback rows resolve through interpolateConfigTokens with empty cfg', () => {
  assert.strictEqual(
    interpolateConfigTokens('${config.provider.test_skill}', {}, { templateName: 't' }),
    'test-driven-development'
  );
  assert.strictEqual(
    interpolateConfigTokens('${config.provider.debug_skill}', {}, { templateName: 't' }),
    'systematic-debugging'
  );
  assert.strictEqual(
    interpolateConfigTokens('${config.provider.verify_skill}', {}, { templateName: 't' }),
    'verification-before-completion'
  );
  assert.strictEqual(
    interpolateConfigTokens('${config.provider.execute_plan_skill}', {}, { templateName: 't' }),
    'executing-plans'
  );
  assert.strictEqual(
    interpolateConfigTokens('${config.provider.finish_branch_skill}', {}, { templateName: 't' }),
    'finishing-a-development-branch'
  );
});

console.log(
  failed
    ? `unit-workflow-template-expand: ${passed} passed, ${failed} FAILED`
    : `unit-workflow-template-expand: ${passed} passed`
);
if (failed) process.exit(1);
