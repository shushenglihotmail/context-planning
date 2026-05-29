'use strict';

/**
 * Tests for lib/workflow.js applyAutoInjectFinalize (v1.6 D1).
 *
 * The framework auto-injects a synthetic `finalize` scaffold phase into any
 * loaded template that doesn't declare one of its own, so `cp run <workflow>`
 * always has a closing step that flips state to `complete`.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const workflow = require('../lib/workflow');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(title) { console.log(`\n=== ${title} ===`); }

function tmpYaml(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-autoinj-'));
  const p = path.join(dir, 'workflow.yaml');
  fs.writeFileSync(p, body);
  return p;
}

section('applyAutoInjectFinalize — injection');
{
  const p = tmpYaml(
    'workflow: my-wf\nversion: 1\nbinds_to: phase\nphases:\n  - phase:\n      id: design\n      description: Sketch.\n  - phase:\n      id: build\n      description: Build.\n      depends_on: [design]\n',
  );
  const tpl = workflow.loadTemplate(p, {});
  workflow.applyAutoInjectFinalize(tpl);
  const last = tpl.phases[tpl.phases.length - 1];
  ok('last phase id is finalize', last && last.id === 'finalize');
  ok('phases length grew to 3', tpl.phases.length === 3);
  ok('kind is scaffold', last.kind === 'scaffold');
  ok('depends_on points to previous last phase', Array.isArray(last.depends_on) && last.depends_on[0] === 'build');
  ok('non-enumerable _autoInjected marker', last._autoInjected === true);
  ok('marker not enumerable', !Object.keys(last).includes('_autoInjected'));
  ok('binds_to=phase → cp run-finalize command', last.command === 'cp run-finalize {{slug_with_date}}');
}

section('applyAutoInjectFinalize — binds_to=quick command');
{
  const p = tmpYaml(
    'workflow: q-wf\nversion: 1\nbinds_to: quick\nphases:\n  - phase:\n      id: do\n      description: Do.\n',
  );
  const tpl = workflow.loadTemplate(p, {});
  workflow.applyAutoInjectFinalize(tpl);
  const last = tpl.phases[tpl.phases.length - 1];
  ok('quick binding → cp quick-finalize', last.command === 'cp quick-finalize {{slug_with_date}}');
}

section('applyAutoInjectFinalize — binds_to=milestone command');
{
  const p = tmpYaml(
    'workflow: m-wf\nversion: 1\nbinds_to: milestone\nphases:\n  - phase:\n      id: do\n      description: Do.\n',
  );
  const tpl = workflow.loadTemplate(p, {});
  workflow.applyAutoInjectFinalize(tpl);
  const last = tpl.phases[tpl.phases.length - 1];
  ok('milestone binding → cp milestone-finalize', last.command === 'cp milestone-finalize {{milestone_slug}}');
}

section('applyAutoInjectFinalize — idempotent on explicit finalize');
{
  const p = tmpYaml(
    'workflow: e-wf\nversion: 1\nbinds_to: phase\nphases:\n  - phase:\n      id: do\n      description: Do.\n  - phase:\n      id: finalize\n      description: Custom finalize.\n      depends_on: [do]\n',
  );
  const tpl = workflow.loadTemplate(p, {});
  const beforeLen = tpl.phases.length;
  workflow.applyAutoInjectFinalize(tpl);
  ok('explicit finalize is not replaced (length unchanged)', tpl.phases.length === beforeLen);
  const fin = tpl.phases.find(ph => ph.id === 'finalize');
  ok('explicit finalize lacks auto-injected marker', !fin._autoInjected);
  // Second call is a no-op.
  workflow.applyAutoInjectFinalize(tpl);
  ok('double-invocation still no-op', tpl.phases.length === beforeLen);
}

section('applyAutoInjectFinalize — double inject on auto-injected template');
{
  const p = tmpYaml(
    'workflow: d-wf\nversion: 1\nbinds_to: phase\nphases:\n  - phase:\n      id: only\n      description: Only.\n',
  );
  const tpl = workflow.loadTemplate(p, {});
  workflow.applyAutoInjectFinalize(tpl);
  const len = tpl.phases.length;
  workflow.applyAutoInjectFinalize(tpl);
  ok('second call after auto-inject is a no-op', tpl.phases.length === len);
}

section('applyAutoInjectFinalize — empty/invalid input is safe');
{
  ok('null returns null', workflow.applyAutoInjectFinalize(null) === null);
  const t1 = { phases: [] };
  workflow.applyAutoInjectFinalize(t1);
  ok('empty phases unchanged', t1.phases.length === 0);
  const t2 = {};
  workflow.applyAutoInjectFinalize(t2);
  ok('missing phases unchanged', !t2.phases);
}

section('applyAutoInjectFinalize — injected phase is wave-schedulable');
{
  const p = tmpYaml(
    'workflow: w-wf\nversion: 1\nbinds_to: phase\nphases:\n  - phase:\n      id: a\n      description: A.\n  - phase:\n      id: b\n      description: B.\n      depends_on: [a]\n',
  );
  const tpl = workflow.loadTemplate(p, {});
  workflow.applyAutoInjectFinalize(tpl);
  const v = workflow.validate(tpl);
  ok('validate accepts auto-injected template', v.ok, v.errors && v.errors.join('; '));
  const waves = workflow.computeWaves(tpl);
  ok('three waves emitted (a → b → finalize)', waves.length === 3);
  ok('final wave is the finalize phase', waves[waves.length - 1][0].id === 'finalize');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
