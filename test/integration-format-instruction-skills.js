'use strict';

/**
 * Phase 71 integration test: formatInstruction emits resolved skill
 * lines with `(source: …)` annotations.
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

check('routing-key, pinned, and absent skills render correctly', () => {
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
  });
  assert.ok(
    /skill: (writing-plans|cp:manual\/plan) \(source: routing-key\)/.test(w0),
    `wave 0 missing routing-key annotation:\n${w0}`
  );

  // Wave 1 — phase b (pinned)
  const w1 = formatInstruction(template, waves[1], 1, {
    projectDir: dir,
    slug: 'sl',
    totalWaves: waves.length,
    silenceWarnings: true,
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
  });
  assert.ok(
    /skill: \(absent\)/.test(w2),
    `wave 2 missing (absent) annotation:\n${w2}`
  );
});

check('unknown skill emits pass-through annotation', () => {
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
  });
  assert.ok(
    /skill: totally-made-up-skill \(source: pass-through\)/.test(out),
    `missing pass-through annotation:\n${out}`
  );
});

console.log(`\nintegration-format-instruction-skills: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
