'use strict';

/**
 * Phase 71 + v1.6/83 integration test: formatInstruction emits the v1.6
 * directive format by default (`invoke skill: <name>`, `skill: (none)`,
 * with a one-time contract legend) and preserves the legacy
 * `(source: …)` provenance under `verbose: true`.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const { loadTemplate } = require('../lib/workflow');
const { computeWaves } = require('../lib/workflow');
const { formatInstruction } = require('../lib/runtime');

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

console.log('\nintegration-format-instruction-skills:');

function makeProject(tpl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-fis-'));
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'config.json'), JSON.stringify({}), 'utf8');
  const tplPath = path.join(dir, 'wf.yaml');
  fs.writeFileSync(tplPath, tpl, 'utf8');
  return { dir, tplPath };
}

check('verbose=true: routing-key, pinned, and absent skills render legacy annotation', () => {
  const tpl = yaml.stringify({
    workflow: 'test-skills',
    version: 1,
    binds_to: 'phase',
    phases: [
      { phase: { id: 'a', description: 'plan it', prompt: 'go', skill: 'plan' } },
      {
        phase: {
          id: 'b',
          description: 'execute it',
          prompt: 'go',
          skill: 'subagent-driven-development',
          depends_on: ['a'],
        },
      },
      { phase: { id: 'c', description: 'no skill', prompt: 'go', depends_on: ['b'] } },
    ],
  });
  const { dir, tplPath } = makeProject(tpl);
  const template = loadTemplate(tplPath, { projectDir: dir });
  const waves = computeWaves(template);

  // Wave 0 — phase a (routing-key)
  const w0 = formatInstruction(template, waves[0], 0, {
    projectDir: dir,
    slug: 'sl',
    totalWaves: waves.length,
    silenceWarnings: true,
    verbose: true,
  });
  assert.ok(
    /skill: (writing-plans|cp:manual\/plan) \(source: routing-key\)/.test(w0),
    `wave 0 missing routing-key annotation:\n${w0}`
  );
  assert.ok(!/\[contract\]/.test(w0), `verbose mode should not print contract legend:\n${w0}`);
  assert.ok(!/invoke skill:/.test(w0), `verbose mode should keep legacy 'skill:' line:\n${w0}`);

  // Wave 1 — phase b (pinned)
  const w1 = formatInstruction(template, waves[1], 1, {
    projectDir: dir,
    slug: 'sl',
    totalWaves: waves.length,
    silenceWarnings: true,
    verbose: true,
  });
  assert.ok(
    /skill: subagent-driven-development \(source: pinned\)/.test(w1),
    `wave 1 missing pinned annotation:\n${w1}`
  );

  // Wave 2 — phase c (absent)
  const w2 = formatInstruction(template, waves[2], 2, {
    projectDir: dir,
    slug: 'sl',
    totalWaves: waves.length,
    silenceWarnings: true,
    verbose: true,
  });
  assert.ok(
    /skill: \(absent\)/.test(w2),
    `wave 2 missing (absent) annotation:\n${w2}`
  );
});

check('default (non-verbose): emits invoke-skill directive + contract legend', () => {
  const tpl = yaml.stringify({
    workflow: 'test-default',
    version: 1,
    binds_to: 'phase',
    phases: [
      {
        phase: {
          id: 'a',
          description: 'execute it',
          prompt: 'go',
          skill: 'subagent-driven-development',
        },
      },
      { phase: { id: 'b', description: 'no skill', prompt: 'go', depends_on: ['a'] } },
    ],
  });
  const { dir, tplPath } = makeProject(tpl);
  const template = loadTemplate(tplPath, { projectDir: dir });
  const waves = computeWaves(template);

  // Wave 0 — pinned skill should emit 'invoke skill:' directive.
  const w0 = formatInstruction(template, waves[0], 0, {
    projectDir: dir,
    slug: 'sl',
    totalWaves: waves.length,
    silenceWarnings: true,
  });
  assert.ok(
    /\[contract\] For each phase below:/.test(w0),
    `wave 0 missing contract legend:\n${w0}`
  );
  assert.ok(
    /'invoke skill: <name>'/.test(w0),
    `wave 0 legend missing invoke directive line:\n${w0}`
  );
  assert.ok(
    /'skill: \(none\)'/.test(w0),
    `wave 0 legend missing (none) clause:\n${w0}`
  );
  assert.ok(
    /If the named skill is unavailable in your harness/.test(w0),
    `wave 0 legend missing unavailable-skill fallback clause:\n${w0}`
  );
  assert.ok(
    /^ {2}invoke skill: subagent-driven-development$/m.test(w0),
    `wave 0 missing 'invoke skill:' directive line for phase a:\n${w0}`
  );
  assert.ok(
    !/\(source: /.test(w0),
    `wave 0 should NOT emit (source: …) provenance in default mode:\n${w0}`
  );

  // Wave 1 — absent skill should emit 'skill: (none)'.
  const w1 = formatInstruction(template, waves[1], 1, {
    projectDir: dir,
    slug: 'sl',
    totalWaves: waves.length,
    silenceWarnings: true,
  });
  assert.ok(
    /^ {2}skill: \(none\)$/m.test(w1),
    `wave 1 missing 'skill: (none)' line for phase b:\n${w1}`
  );
  assert.ok(
    !/^ {2}invoke skill:/m.test(w1),
    `wave 1 should not emit per-phase invoke directive when no skill is routed:\n${w1}`
  );
});

check('verbose=true: unknown skill emits pass-through annotation', () => {
  const tpl = yaml.stringify({
    workflow: 'test-unknown',
    version: 1,
    binds_to: 'phase',
    phases: [
      { phase: { id: 'a', description: 'x', prompt: 'go', skill: 'totally-made-up-skill' } },
    ],
  });
  const { dir, tplPath } = makeProject(tpl);
  const template = loadTemplate(tplPath, { projectDir: dir });
  const waves = computeWaves(template);
  const out = formatInstruction(template, waves[0], 0, {
    projectDir: dir,
    slug: 'sl',
    totalWaves: 1,
    silenceWarnings: true,
    verbose: true,
  });
  assert.ok(
    /skill: totally-made-up-skill \(source: pass-through\)/.test(out),
    `missing pass-through annotation:\n${out}`
  );
});

console.log(`\nintegration-format-instruction-skills: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
