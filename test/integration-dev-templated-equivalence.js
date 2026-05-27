'use strict';

/**
 * Integration test (v1.3 plan 57-03): verify that the templated example
 * workflow `_examples/dev-templated.yaml` produces a resolved phase list
 * that matches `dev.yaml` field-for-field on the fields a phase-template
 * supplies.
 *
 * We compare {role, skill, prompt, parent, max_children, min_children}
 * on each named phase; ids are equal by construction; depends_on/after
 * are also asserted.
 */

const path = require('path');
const assert = require('assert');
const wf = require('../lib/workflow');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}

const repoRoot = path.resolve(__dirname, '..');
const devPath = path.join(repoRoot, 'templates', 'workflows', 'dev.yaml');
const templatedPath = path.join(repoRoot, 'templates', 'workflows', '_examples', 'dev-templated.yaml');

const dev = wf.loadTemplate(devPath, {});
const templated = wf.loadTemplate(templatedPath, {});

function byId(arr) {
  const m = new Map();
  for (const p of arr || []) {
    if (p && typeof p === 'object' && typeof p.id === 'string') m.set(p.id, p);
  }
  return m;
}

const a = byId(dev.phases);
const b = byId(templated.phases);

const ids = ['plan', 'child-plan', 'child-execute'];
ok('both workflows expose all 3 phase ids', ids.every((id) => a.has(id) && b.has(id)),
   'dev=' + JSON.stringify([...a.keys()]) + ' templated=' + JSON.stringify([...b.keys()]));

for (const id of ids) {
  const pa = a.get(id); const pb = b.get(id);
  if (!pa || !pb) continue;
  for (const field of ['role', 'skill', 'parent', 'max_children', 'min_children']) {
    ok(`${id}.${field} matches`, pa[field] === pb[field],
       `dev=${JSON.stringify(pa[field])} templated=${JSON.stringify(pb[field])}`);
  }
  // prompt content equivalence (whitespace-tolerant)
  const promptA = (pa.prompt || '').trim();
  const promptB = (pb.prompt || '').trim();
  ok(`${id}.prompt matches`, promptA === promptB,
     `dev_len=${promptA.length} templated_len=${promptB.length}`);
  // depends_on
  const dA = JSON.stringify(pa.depends_on || []);
  const dB = JSON.stringify(pb.depends_on || []);
  ok(`${id}.depends_on matches`, dA === dB, `dev=${dA} templated=${dB}`);
}

// templates_referenced sanity via inspect-style scan
const yaml = require('yaml');
const fs = require('fs');
const rawTpl = yaml.parse(fs.readFileSync(templatedPath, 'utf8'));
let templateRefs = 0;
for (const e of rawTpl.phases || []) {
  if (e && e.phase && e.phase.template) templateRefs++;
}
ok('templated example references 2 phase-templates', templateRefs === 2, 'got=' + templateRefs);

console.log('\n' + (failed === 0 ? '✓' : '✗') + ' dev-templated equivalence: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
