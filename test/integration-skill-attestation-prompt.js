'use strict';

/**
 * Bug F — Phase 110 — (a) Attestation contract in formatInstruction.
 *
 * Asserts that:
 *  1. A phase with `invoke skill: <name>` gets the attestation contract appended.
 *  2. A phase with `skill: (none)` does NOT get an attestation contract.
 *  3. Verbose mode does NOT get the attestation contract.
 *  4. The contract names the resolved skill explicitly.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const { loadTemplate, computeWaves } = require('../lib/workflow');
const { formatInstruction } = require('../lib/runtime');

let passed = 0, failed = 0;

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

console.log('\nintegration-skill-attestation-prompt:');

function makeProject(tpl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sap-'));
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'config.json'), JSON.stringify({}), 'utf8');
  const tplPath = path.join(dir, 'wf.yaml');
  fs.writeFileSync(tplPath, tpl, 'utf8');
  return { dir, tplPath };
}

const WF_WITH_SKILL = yaml.stringify({
  workflow: 'test-attestation',
  version: 1,
  binds_to: 'phase',
  phases: [
    {
      phase: {
        id: 'execute',
        description: 'execute it',
        prompt: 'do the work',
        skill: 'subagent-driven-development',
      },
    },
    {
      phase: {
        id: 'review',
        description: 'review it',
        prompt: 'review the work',
        depends_on: ['execute'],
      },
    },
  ],
});

check('phase with routed skill → attestation contract present', () => {
  const { dir, tplPath } = makeProject(WF_WITH_SKILL);
  const template = loadTemplate(tplPath, { projectDir: dir });
  const waves = computeWaves(template);

  const instr = formatInstruction(template, waves[0], 0, {
    projectDir: dir,
    slug: 'test-slug',
    totalWaves: waves.length,
    silenceWarnings: true,
  });

  assert.ok(
    /\[attestation\]/.test(instr),
    `Expected [attestation] block in instruction:\n${instr}`
  );
  assert.ok(
    /invoked_skill:/.test(instr),
    `Expected 'invoked_skill:' in instruction:\n${instr}`
  );
});

check('phase with routed skill → contract names the resolved skill', () => {
  const { dir, tplPath } = makeProject(WF_WITH_SKILL);
  const template = loadTemplate(tplPath, { projectDir: dir });
  const waves = computeWaves(template);

  const instr = formatInstruction(template, waves[0], 0, {
    projectDir: dir,
    slug: 'test-slug',
    totalWaves: waves.length,
    silenceWarnings: true,
  });

  assert.ok(
    /invoked_skill:\s*subagent-driven-development/.test(instr),
    `Expected contract to name resolved skill 'subagent-driven-development':\n${instr}`
  );
});

check('phase with skill: (none) → no attestation contract', () => {
  const { dir, tplPath } = makeProject(WF_WITH_SKILL);
  const template = loadTemplate(tplPath, { projectDir: dir });
  const waves = computeWaves(template);

  // Wave 1 = review phase (no skill)
  const instr = formatInstruction(template, waves[1], 1, {
    projectDir: dir,
    slug: 'test-slug',
    totalWaves: waves.length,
    silenceWarnings: true,
  });

  assert.ok(
    !/\[attestation\]/.test(instr),
    `Expected NO [attestation] block for skill-less phase:\n${instr}`
  );
  assert.ok(
    !/invoked_skill:/.test(instr),
    `Expected NO invoked_skill: for skill-less phase:\n${instr}`
  );
});

check('verbose mode → no attestation contract', () => {
  const { dir, tplPath } = makeProject(WF_WITH_SKILL);
  const template = loadTemplate(tplPath, { projectDir: dir });
  const waves = computeWaves(template);

  const instr = formatInstruction(template, waves[0], 0, {
    projectDir: dir,
    slug: 'test-slug',
    totalWaves: waves.length,
    silenceWarnings: true,
    verbose: true,
  });

  assert.ok(
    !/\[attestation\]/.test(instr),
    `Expected NO [attestation] block in verbose mode:\n${instr}`
  );
});

// ---- summary ----
console.log(`\n  ${passed} passing, ${failed} failing`);
if (failed > 0) process.exit(1);
