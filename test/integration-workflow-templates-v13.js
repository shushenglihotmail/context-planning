'use strict';

/**
 * Integration tests for v1.3 workflow-template expansion (Phase 55-04).
 *
 * Exercises loadTemplate()'s end-to-end pipeline on YAML fixtures shipped
 * in templates/workflow-templates/ (built-ins) and the chain fixtures
 * under _fixtures-v13/ (staged into a project dir for chain tests since
 * those aren't on the canonical lookup path).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadTemplate, validate } = require('../lib/workflow');

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err && err.stack ? err.stack : err}`);
    failed++;
  }
}

function fx(name) {
  return path.resolve(__dirname, '..', 'templates', 'workflows', '_fixtures-v13', name);
}

function stageChainFixtures() {
  // Stage chain-1..chain-4 from templates/workflow-templates/_fixtures-v13
  // into a tmp project dir's .planning/workflow-templates/ so they show
  // up via the project-shadows-builtin lookup path.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-wf-int-'));
  const tplDir = path.join(dir, '.planning', 'workflow-templates');
  fs.mkdirSync(tplDir, { recursive: true });
  const src = path.resolve(__dirname, '..', 'templates', 'workflow-templates', '_fixtures-v13');
  for (const f of ['chain-1.yaml', 'chain-2.yaml', 'chain-3.yaml', 'chain-4.yaml']) {
    fs.copyFileSync(path.join(src, f), path.join(tplDir, f));
  }
  return dir;
}

console.log('\nintegration-workflow-templates-v13:');

check('worked example: review-and-address expands per DESIGN.md', () => {
  const t = loadTemplate(fx('uses-workflow-template.yaml'));
  // Expected resolved phase list (post-v1.7 whitelist migration):
  //   - id: plan
  //   - id: review--review,  after: [plan]
  //   - id: review--address, after: [review--review]
  //   - id: execute,         after: [review--address]   ← rewritten from after: review
  assert.deepStrictEqual(t.phases.map((p) => p.id), [
    'plan',
    'review--review',
    'review--address',
    'execute',
  ]);
  const byId = Object.fromEntries(t.phases.map((p) => [p.id, p]));
  assert.deepStrictEqual(byId['review--review'].after, ['plan']);
  assert.deepStrictEqual(byId['review--address'].after, ['review--review']);
  assert.deepStrictEqual(byId['execute'].after, ['review--address']);
  const r = validate(t);
  assert.deepStrictEqual(r.errors, [], `unexpected errors: ${r.errors.join(' | ')}`);
});

check('chain depth 3 OK end-to-end', () => {
  const projectDir = stageChainFixtures();
  const t = loadTemplate(fx('wf-chain-depth-ok.yaml'), { projectDir });
  assert.strictEqual(t.phases.length, 1);
  assert.strictEqual(t.phases[0].id, 'g--m--n--leaf');
});

check('chain depth > 3 surfaces error', () => {
  const projectDir = stageChainFixtures();
  const t = loadTemplate(fx('wf-chain-depth-exceeded.yaml'), { projectDir });
  const r = validate(t);
  assert.ok(
    r.errors.some((e) => /chain depth exceeds 3/.test(e)),
    `expected depth-exceeded error, got: ${r.errors.join(' | ')}`
  );
});

check('group-handle id collision with sibling phase id surfaces error', () => {
  const t = loadTemplate(fx('wf-group-id-collision.yaml'));
  const r = validate(t);
  assert.ok(
    r.errors.some((e) => /group-handle id collides/.test(e)) ||
      r.errors.some((e) => /duplicate phase id/i.test(e)),
    `expected collision error, got: ${r.errors.join(' | ')}`
  );
});

check('expanded workflow validates as a runnable v1.3 template', () => {
  const t = loadTemplate(fx('uses-workflow-template.yaml'));
  const r = validate(t);
  assert.strictEqual(r.ok, true, `expected ok=true, errors: ${r.errors.join(' | ')}`);
});

console.log(
  failed
    ? `integration-workflow-templates-v13: ${passed} passed, ${failed} FAILED`
    : `integration-workflow-templates-v13: ${passed} passed`
);
if (failed) process.exit(1);
