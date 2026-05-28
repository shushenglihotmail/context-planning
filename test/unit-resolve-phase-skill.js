'use strict';

/**
 * Phase 71 unit tests for runtime.resolvePhaseSkill.
 *
 * Verifies the four resolution sources:
 *   - absent       (null/undefined phase.skill)
 *   - routing-key  (key in active provider's skills map)
 *   - pinned       (literal that appears as a value in some provider's map)
 *   - pass-through (unknown — emitted as-is with warning)
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolvePhaseSkill } = require('../lib/runtime');

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

function makeProject(cfg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-rps-'));
  if (cfg !== undefined) {
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.planning', 'config.json'),
      JSON.stringify(cfg, null, 2),
      'utf8'
    );
  }
  return dir;
}

console.log('\nunit-resolve-phase-skill:');

check('absent: null skill yields source=absent', () => {
  const dir = makeProject(); // defaults
  const r = resolvePhaseSkill(null, { projectDir: dir });
  assert.strictEqual(r.name, null);
  assert.strictEqual(r.source, 'absent');
});

check('absent: empty string yields source=absent', () => {
  const dir = makeProject();
  const r = resolvePhaseSkill('', { projectDir: dir });
  assert.strictEqual(r.source, 'absent');
});

check('routing-key: superpowers plan → writing-plans (manual fallback ok)', () => {
  const dir = makeProject();
  const r = resolvePhaseSkill('plan', { projectDir: dir });
  // superpowers isn't installed in tmpdir, so resolveSkill falls back to manual:
  // 'plan' under manual → 'cp:manual/plan'. Source must still be routing-key
  // because 'plan' is a routing key for the active (superpowers) provider.
  assert.strictEqual(r.source, 'routing-key');
  assert.ok(
    r.name === 'writing-plans' || r.name === 'cp:manual/plan',
    `expected resolved skill, got ${r.name}`
  );
});

check('pinned: literal writing-plans → writing-plans, source=pinned', () => {
  const dir = makeProject();
  const r = resolvePhaseSkill('writing-plans', { projectDir: dir });
  assert.strictEqual(r.name, 'writing-plans');
  assert.strictEqual(r.source, 'pinned');
});

check('pinned: literal subagent-driven-development is pinned', () => {
  const dir = makeProject();
  const r = resolvePhaseSkill('subagent-driven-development', { projectDir: dir });
  assert.strictEqual(r.source, 'pinned');
});

check('pinned: cp:manual/plan recognised as pinned literal', () => {
  const dir = makeProject();
  const r = resolvePhaseSkill('cp:manual/plan', { projectDir: dir });
  assert.strictEqual(r.source, 'pinned');
});

check('pass-through: unknown skill is emitted with warning', () => {
  const dir = makeProject();
  const warnings = [];
  const r = resolvePhaseSkill('nonsense-no-such-skill', {
    projectDir: dir,
    warningsOut: warnings,
  });
  assert.strictEqual(r.name, 'nonsense-no-such-skill');
  assert.strictEqual(r.source, 'pass-through');
  assert.strictEqual(warnings.length, 1);
  assert.ok(/nonsense-no-such-skill/.test(warnings[0]));
});

check('routing-key under custom provider in cp.workflow_provider', () => {
  const cfg = {
    cp: {
      workflow_provider: 'echo-provider',
      providers: {
        'echo-provider': {
          plugin_shape: { dir_name: 'echo-provider', required_subdirs: [] },
          detect: { any_of: ['.planning/providers/echo-provider'] },
          skills: { plan: 'echo', execute: 'echo' },
        },
      },
    },
  };
  const dir = makeProject(cfg);
  // Make the detect path exist so primary resolves rather than falling back.
  fs.mkdirSync(path.join(dir, '.planning', 'providers', 'echo-provider'), { recursive: true });
  const r = resolvePhaseSkill('plan', { projectDir: dir });
  assert.strictEqual(r.source, 'routing-key');
  assert.strictEqual(r.name, 'echo');
});

check('no warningsOut array: pass-through still resolves without throwing', () => {
  const dir = makeProject();
  const r = resolvePhaseSkill('made-up-thing', { projectDir: dir });
  assert.strictEqual(r.source, 'pass-through');
  assert.strictEqual(r.name, 'made-up-thing');
});

console.log(`\nunit-resolve-phase-skill: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
