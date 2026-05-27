'use strict';

/**
 * Integration tests for v1.3 phase-template resolution end-to-end
 * (Phase 54-04).
 *
 * Exercises `loadTemplate()` against real fixture YAMLs that reference
 * phase templates. The shipping `reviewer` template lives at
 * templates/phase-templates/reviewer.yaml and is discovered via the
 * default lookup. Chain / depth fixtures live under
 * templates/phase-templates/_fixtures-v13/ and are surfaced to the
 * resolver by staging a temp project dir whose
 * `.planning/phase-templates/` copies those fixtures (project scope
 * shadows builtin per DESIGN.md Q2).
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
    console.log(`    ${err && err.message ? err.message : err}`);
    failed++;
  }
}

const repoRoot = path.resolve(__dirname, '..');
const fxDir = path.join(repoRoot, 'templates', 'workflows', '_fixtures-v13');
const fx = (n) => path.join(fxDir, n);

// Stage chain fixtures into a temp project dir's .planning/phase-templates/
function stageChainProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-pt-int-'));
  const dst = path.join(dir, '.planning', 'phase-templates');
  fs.mkdirSync(dst, { recursive: true });
  const src = path.join(repoRoot, 'templates', 'phase-templates', '_fixtures-v13');
  for (const f of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, f), path.join(dst, f));
  }
  return dir;
}

console.log('\n=== v1.3 integration: phase-template resolution ===');

check('uses-phase-template.yaml: resolves reviewer template into 2 phases', () => {
  const t = loadTemplate(fx('uses-phase-template.yaml'));
  const r = validate(t);
  assert.deepEqual(r.errors, [], `unexpected errors: ${r.errors.join(' | ')}`);
  assert.equal(r.ok, true);

  assert.equal(t.phases.length, 3);

  const review = t.phases.find(p => p.id === 'review-auth');
  assert.ok(review, 'review-auth phase missing');
  assert.equal(review.role, 'reviewer');
  assert.ok(review.prompt.includes('Review the auth changes'), `prompt: ${review.prompt}`);
  assert.ok(review.prompt.includes('Report at least 1 concrete'), `prompt: ${review.prompt}`);
  assert.deepEqual(review.after, ['plan']);
  assert.ok(!('template' in review), 'template field must be erased on resolved phase');

  const billing = t.phases.find(p => p.id === 'review-billing');
  assert.ok(billing, 'review-billing phase missing');
  assert.ok(billing.prompt.includes('billing changes'), `prompt: ${billing.prompt}`);
  assert.ok(billing.prompt.includes('Report at least 0 concrete'), `prompt: ${billing.prompt}`);
});

check('uses-phase-template.yaml: no resolver warnings for well-formed call', () => {
  const t = loadTemplate(fx('uses-phase-template.yaml'));
  const r = validate(t);
  assert.deepEqual(r.warnings, [], `unexpected warnings: ${r.warnings.join(' | ')}`);
});

check('chain-depth-ok.yaml: 2-level chain resolves cleanly', () => {
  const projectDir = stageChainProject();
  const t = loadTemplate(fx('chain-depth-ok.yaml'), { projectDir });
  const r = validate(t);
  assert.deepEqual(r.errors, [], `errors: ${r.errors.join(' | ')}`);
  const leaf = t.phases[0];
  assert.equal(leaf.id, 'leaf');
  assert.equal(leaf.role, 'leaf');
  assert.ok(leaf.prompt.includes('label=hello'), `prompt: ${leaf.prompt}`);
  assert.ok(!('template' in leaf));
});

check('chain-depth-exceeded.yaml: depth > 3 surfaces resolver error via validate', () => {
  const projectDir = stageChainProject();
  const t = loadTemplate(fx('chain-depth-exceeded.yaml'), { projectDir });
  const r = validate(t);
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some(e => /chain depth exceeds 3/.test(e)),
    `expected depth-exceeded error, got: ${r.errors.join(' | ')}`
  );
});

check('missing-required-arg.yaml: surfaces required-param error', () => {
  const t = loadTemplate(fx('missing-required-arg.yaml'));
  const r = validate(t);
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some(e => /required param 'scope'/.test(e)),
    `expected required-param error, got: ${r.errors.join(' | ')}`
  );
});

check('unused-arg.yaml: surfaces unused-arg warning, still validates ok', () => {
  const t = loadTemplate(fx('unused-arg.yaml'));
  const r = validate(t);
  assert.deepEqual(r.errors, [], `unexpected errors: ${r.errors.join(' | ')}`);
  assert.equal(r.ok, true);
  assert.ok(
    r.warnings.some(w => /arg 'extra_unused' supplied but not referenced/.test(w)),
    `expected unused-arg warning, got: ${r.warnings.join(' | ')}`
  );
});

check('downstream sees resolved phases (no inner template) for runtime use', () => {
  const t = loadTemplate(fx('uses-phase-template.yaml'));
  for (const p of t.phases) {
    assert.ok(!('template' in p), `phase ${p.id} still carries an inner template field`);
    assert.ok(p.id && typeof p.id === 'string', `phase missing id`);
  }
});

if (failed === 0) {
  console.log(`\nAll ${passed} phase-template integration tests passed.`);
  process.exit(0);
} else {
  console.log(`\n${failed} of ${passed + failed} tests failed.`);
  process.exit(1);
}

check('uses-phase-template.yaml: no resolver warnings for well-formed call', () => {
  const t = loadTemplate(fx('uses-phase-template.yaml'));
  const r = validate(t);
  assert.deepEqual(r.warnings, [], `unexpected warnings: ${r.warnings.join(' | ')}`);
});

check('chain-depth-ok.yaml: 2-level chain resolves cleanly', () => {
  const t = loadTemplate(fx('chain-depth-ok.yaml'));
  const r = validate(t);
  assert.deepEqual(r.errors, [], `errors: ${r.errors.join(' | ')}`);
  const leaf = t.phases[0];
  assert.equal(leaf.id, 'leaf');
  assert.equal(leaf.role, 'leaf');
  assert.ok(leaf.prompt.includes('label=hello'), `prompt: ${leaf.prompt}`);
  assert.ok(!('template' in leaf));
});

check('chain-depth-exceeded.yaml: depth > 3 surfaces resolver error via validate', () => {
  const t = loadTemplate(fx('chain-depth-exceeded.yaml'));
  const r = validate(t);
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some(e => /chain depth exceeds 3/.test(e)),
    `expected depth-exceeded error, got: ${r.errors.join(' | ')}`
  );
});

check('missing-required-arg.yaml: surfaces required-param error', () => {
  const t = loadTemplate(fx('missing-required-arg.yaml'));
  const r = validate(t);
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some(e => /required param 'scope'/.test(e)),
    `expected required-param error, got: ${r.errors.join(' | ')}`
  );
});

check('unused-arg.yaml: surfaces unused-arg warning, still validates ok', () => {
  const t = loadTemplate(fx('unused-arg.yaml'));
  const r = validate(t);
  assert.deepEqual(r.errors, [], `unexpected errors: ${r.errors.join(' | ')}`);
  assert.equal(r.ok, true);
  assert.ok(
    r.warnings.some(w => /arg 'extra_unused' supplied but not referenced/.test(w)),
    `expected unused-arg warning, got: ${r.warnings.join(' | ')}`
  );
});

check('downstream sees resolved phases (no inner template) for runtime use', () => {
  const t = loadTemplate(fx('uses-phase-template.yaml'));
  for (const p of t.phases) {
    assert.ok(!('template' in p), `phase ${p.id} still carries an inner template field`);
    assert.ok(p.id && typeof p.id === 'string', `phase missing id`);
  }
});

if (failed === 0) {
  console.log(`\nAll ${passed} phase-template integration tests passed.`);
  process.exit(0);
} else {
  console.log(`\n${failed} of ${passed + failed} tests failed.`);
  process.exit(1);
}
