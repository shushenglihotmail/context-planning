'use strict';

/**
 * Unit tests for v1.4 inline template blocks (Decision #1):
 *   - top-level `phase_templates:` array → resolvable by `template:` refs
 *   - top-level `workflow_templates:` array → accepted at grammar level
 *     (full expansion / inclusion already covered by 55-03; this only
 *     proves the inline block is parsed and shadows disk lookups)
 *   - inline shadows on-disk templates with the same name
 *   - duplicate inline names → error
 *   - inline phase-template body containing forbidden `id:` → error
 *   - top-level `workflow_templates:` non-array → error
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');

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
    if (err && err.message) console.log('    ', err.message);
  }
}

function writeTmpYaml(obj) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-v14-inline-'));
  const file = path.join(dir, 'wf.yaml');
  fs.writeFileSync(file, yaml.stringify(obj), 'utf8');
  return file;
}

console.log('\n=== v1.4 unit: inline phase_templates / workflow_templates ===');

check('inline phase_templates: resolves a phase: ref to inline body', () => {
  const file = writeTmpYaml({
    workflow: 'wf-inline-1',
    version: 1,
    binds_to: 'quick',
    phase_templates: [
      {
        name: 'inline-reviewer',
        params: [{ name: 'scope' }],
        role: 'reviewer',
        prompt: 'Review the {{scope}} changes.',
      },
    ],
    phases: [
      { phase: { id: 'plan', description: 'plan', role: 'planner', prompt: 'Plan it.' } },
      {
        phase: {
          id: 'review-auth',
          description: 'review auth',
          template: { name: 'inline-reviewer', args: { scope: 'auth' } },
          after: ['plan'],
        },
      },
    ],
  });
  const t = loadTemplate(file);
  const r = validate(t);
  assert.deepStrictEqual(r.errors, [], `unexpected errors: ${r.errors.join(' | ')}`);
  assert.strictEqual(r.ok, true);
  const resolved = t.phases.find((p) => p && p.id === 'review-auth');
  assert.ok(resolved, 'review-auth phase missing');
  assert.strictEqual(resolved.role, 'reviewer');
  assert.match(resolved.prompt, /Review the auth changes/);
});

check('inline phase_templates: shadows on-disk template of same name', () => {
  // `reviewer` ships on disk at templates/phase-templates/reviewer.yaml with
  // role=reviewer; the inline override changes role+prompt to prove the
  // inline map wins.
  const file = writeTmpYaml({
    workflow: 'wf-inline-shadow',
    version: 1,
    binds_to: 'quick',
    phase_templates: [
      {
        name: 'reviewer',
        params: [{ name: 'scope' }, { name: 'min_findings', default: 0 }],
        role: 'inline-override',
        prompt: 'INLINE {{scope}}',
      },
    ],
    phases: [
      {
        phase: {
          id: 'r',
          description: 'r',
          template: { name: 'reviewer', args: { scope: 'auth' } },
        },
      },
    ],
  });
  const t = loadTemplate(file);
  const r = validate(t);
  assert.deepStrictEqual(r.errors, [], `unexpected errors: ${r.errors.join(' | ')}`);
  const ph = t.phases.find((p) => p && p.id === 'r');
  assert.strictEqual(ph.role, 'inline-override', 'inline override should win over disk');
  assert.strictEqual(ph.prompt, 'INLINE auth');
});

check('inline phase_templates: duplicate name → error', () => {
  const file = writeTmpYaml({
    workflow: 'wf-inline-dup',
    version: 1,
    binds_to: 'quick',
    phase_templates: [
      { name: 'twice', role: 'r1', prompt: 'p1' },
      { name: 'twice', role: 'r2', prompt: 'p2' },
    ],
    phases: [{ phase: { id: 'plan', description: 'plan', role: 'planner', prompt: 'p' } }],
  });
  const t = loadTemplate(file);
  const r = validate(t);
  const hit = r.errors.find((e) => /duplicate inline phase-template name 'twice'/.test(e));
  assert.ok(hit, `expected duplicate error, got: ${r.errors.join(' | ')}`);
  assert.strictEqual(r.ok, false);
});

check('inline phase_templates: body with id: → error', () => {
  const file = writeTmpYaml({
    workflow: 'wf-inline-badbody',
    version: 1,
    binds_to: 'quick',
    phase_templates: [
      { name: 'bad', id: 'nope', role: 'r', prompt: 'p' },
    ],
    phases: [{ phase: { id: 'plan', description: 'plan', role: 'planner', prompt: 'p' } }],
  });
  const t = loadTemplate(file);
  const r = validate(t);
  const hit = r.errors.find((e) => /body field 'id' is supplied by the caller/.test(e));
  assert.ok(hit, `expected forbidden-id error, got: ${r.errors.join(' | ')}`);
  assert.strictEqual(r.ok, false);
});

check('inline phase_templates: non-array → error', () => {
  const file = writeTmpYaml({
    workflow: 'wf-inline-shape',
    version: 1,
    binds_to: 'quick',
    phase_templates: { name: 'wrong' },
    phases: [{ phase: { id: 'plan', description: 'plan', role: 'planner', prompt: 'p' } }],
  });
  const t = loadTemplate(file);
  const r = validate(t);
  const hit = r.errors.find((e) => /phase_templates: must be an array/.test(e));
  assert.ok(hit, `expected shape error, got: ${r.errors.join(' | ')}`);
  assert.strictEqual(r.ok, false);
});

check('inline workflow_templates: parsed; non-array → error', () => {
  const file = writeTmpYaml({
    workflow: 'wf-inline-wftpl-shape',
    version: 1,
    binds_to: 'quick',
    workflow_templates: 'not-an-array',
    phases: [{ phase: { id: 'plan', description: 'plan', role: 'planner', prompt: 'p' } }],
  });
  const t = loadTemplate(file);
  const r = validate(t);
  const hit = r.errors.find((e) => /workflow_templates: must be an array/.test(e));
  assert.ok(hit, `expected shape error, got: ${r.errors.join(' | ')}`);
  assert.strictEqual(r.ok, false);
});

check('inline workflow_templates: empty phases → error', () => {
  const file = writeTmpYaml({
    workflow: 'wf-inline-wftpl-empty',
    version: 1,
    binds_to: 'quick',
    workflow_templates: [
      { name: 'empty-group', phases: [] },
    ],
    phases: [{ phase: { id: 'plan', description: 'plan', role: 'planner', prompt: 'p' } }],
  });
  const t = loadTemplate(file);
  const r = validate(t);
  const hit = r.errors.find((e) => /'phases' must be a non-empty array/.test(e));
  assert.ok(hit, `expected empty-phases error, got: ${r.errors.join(' | ')}`);
  assert.strictEqual(r.ok, false);
});

check('inline workflow_templates: well-formed entry passes validation', () => {
  const file = writeTmpYaml({
    workflow: 'wf-inline-wftpl-ok',
    version: 1,
    binds_to: 'quick',
    workflow_templates: [
      {
        name: 'pair',
        phases: [
          { id: 'a', role: 'r', prompt: 'p' },
          { id: 'b', role: 'r', prompt: 'p', after: ['a'] },
        ],
      },
    ],
    phases: [{ phase: { id: 'plan', description: 'plan', role: 'planner', prompt: 'p' } }],
  });
  const t = loadTemplate(file);
  const r = validate(t);
  assert.deepStrictEqual(r.errors, [], `unexpected errors: ${r.errors.join(' | ')}`);
  assert.strictEqual(r.ok, true);
});

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed) {
  for (const f of failures) console.log('  -', f);
  process.exit(1);
}
