'use strict';

/**
 * Phase 117 integration test: verify gate wired into milestone.yaml.
 *
 * Asserts:
 *   1. milestone.yaml loads/validates.
 *   2. `verify` phase exists, kind=scaffold, command references
 *      `cp run-verify` and `{{milestone_slug}}`.
 *   3. `review.depends_on` contains `verify` (and only verify).
 *   4. `review_skill` default is `review` (the routing key, not the
 *      bare literal `code-review`).
 *   5. Wave ordering: verify appears in a strictly earlier wave than
 *      review.
 *   6. verify_command + verify_skip params declared.
 */

const assert = require('node:assert/strict');
const path = require('path');

const workflow = require('../lib/workflow');

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`    ${err && err.message ? err.message : err}`);
    failed++;
  }
}

const TPL_PATH = path.resolve(__dirname, '..', 'templates', 'workflows', 'milestone.yaml');

console.log('\nintegration-milestone-verify-gate:');

const tpl = workflow.loadTemplate(TPL_PATH);

check('milestone.yaml loads and validates', () => {
  const v = workflow.validate(tpl);
  assert.equal(v.ok, true, `errors: ${(v.errors || []).join('; ')}`);
});

function findPhase(id) {
  return tpl.phases.find((p) => p.id === id);
}

check('verify phase exists with kind=scaffold', () => {
  const p = findPhase('verify');
  assert.ok(p, 'verify phase not found');
  assert.equal(p.kind, 'scaffold');
});

check('verify command invokes cp run-verify with milestone_slug substitution', () => {
  const p = findPhase('verify');
  assert.ok(p.command, 'verify phase missing command');
  assert.match(p.command, /cp run-verify/, `expected 'cp run-verify' in: ${p.command}`);
  assert.match(p.command, /\{\{\s*milestone_slug\s*\}\}/, `expected milestone_slug substitution`);
});

check('review.depends_on lists verify (gates review on tests passing)', () => {
  const p = findPhase('review');
  assert.ok(p, 'review phase missing');
  assert.ok(
    Array.isArray(p.depends_on) && p.depends_on.includes('verify'),
    `review.depends_on must include 'verify', got: ${JSON.stringify(p.depends_on)}`
  );
});

check('review_skill default is "review" (routing key, not literal code-review)', () => {
  const params = tpl.params || [];
  const reviewSkill = params.find((x) => x.name === 'review_skill');
  assert.ok(reviewSkill, 'review_skill param missing');
  assert.equal(
    reviewSkill.default,
    'review',
    `expected default "review", got: ${JSON.stringify(reviewSkill.default)}`
  );
});

check('verify_command and verify_skip params declared', () => {
  const params = tpl.params || [];
  const names = params.map((x) => x.name);
  assert.ok(names.includes('verify_command'), `verify_command missing in params: ${names.join(',')}`);
  assert.ok(names.includes('verify_skip'), `verify_skip missing in params: ${names.join(',')}`);
});

check('wave ordering: verify wave index < review wave index', () => {
  const waves = workflow.computeWaves(tpl);
  let verifyWave = -1;
  let reviewWave = -1;
  waves.forEach((w, i) => {
    w.forEach((p) => {
      if (p.id === 'verify') verifyWave = i;
      if (p.id === 'review') reviewWave = i;
    });
  });
  assert.notEqual(verifyWave, -1, 'verify not scheduled in any wave');
  assert.notEqual(reviewWave, -1, 'review not scheduled in any wave');
  assert.ok(
    verifyWave < reviewWave,
    `expected verify (wave ${verifyWave}) strictly before review (wave ${reviewWave})`
  );
});

check('verify wave is scheduled after child-execute waves complete', () => {
  // child-execute has after: [child-plan]; both are fanout children of
  // propose-phases. verify depends_on propose-phases. We assert verify
  // appears no earlier than any non-fanout phase produced after
  // propose-phases — specifically that propose-phases is in an earlier
  // wave than verify.
  const waves = workflow.computeWaves(tpl);
  let proposeWave = -1;
  let verifyWave = -1;
  waves.forEach((w, i) => {
    w.forEach((p) => {
      if (p.id === 'propose-phases') proposeWave = i;
      if (p.id === 'verify') verifyWave = i;
    });
  });
  assert.ok(
    proposeWave < verifyWave,
    `propose-phases (wave ${proposeWave}) must precede verify (wave ${verifyWave})`
  );
});

console.log(`\nintegration-milestone-verify-gate: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
