'use strict';

/**
 * Phase 74 integration test: the shipped v1.5 built-in workflow templates
 * (quick.yaml, milestone.yaml) survive the load → expand → formatInstruction
 * pipeline with NO ${config.…} or unresolved {{...}} tokens in the rendered
 * role/skill lines, AND quick.yaml's design phase carries the STOP gate.
 *
 * This is the end-to-end regression guard for the v1.4 bug that triggered
 * milestone v1.5: a terse task description used to cause the supervisor
 * to start implementing before user confirmation of DESIGN.md.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadTemplate, computeWaves, validate } = require('../lib/workflow');
const { formatInstruction } = require('../lib/runtime');

const REPO = path.resolve(__dirname, '..');
const TEMPLATES = path.join(REPO, 'templates', 'workflows');

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

console.log('\nintegration-v15-builtin-templates:');

function freshProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-v15-'));
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'config.json'), JSON.stringify({}), 'utf8');
  return dir;
}

function loadBuiltin(name) {
  const dir = freshProject();
  const tplPath = path.join(TEMPLATES, name);
  const template = loadTemplate(tplPath, { projectDir: dir });
  return { dir, template };
}

function instructionsFor(template, dir) {
  const waves = computeWaves(template);
  const out = [];
  for (let i = 0; i < waves.length; i++) {
    out.push({
      wave: i,
      text: formatInstruction(template, waves[i], i, {
        projectDir: dir,
        slug: 'sample-slug',
        totalWaves: waves.length,
        silenceWarnings: true,
      }),
      phaseIds: (waves[i].phases || waves[i] || []).map
        ? (waves[i].phases || waves[i]).map((p) => p.id)
        : [],
    });
  }
  return out;
}

check('quick.yaml loads + validates cleanly', () => {
  const { template } = loadBuiltin('quick.yaml');
  const r = validate(template);
  assert.strictEqual(r.ok, true, `errors: ${JSON.stringify(r.errors)}`);
  // No role/skill orthogonality warnings.
  const bad = r.warnings.filter((w) => /routing key|must agree/.test(w));
  assert.deepStrictEqual(bad, [], `unexpected role/skill warnings: ${bad.join('; ')}`);
});

check('milestone.yaml loads + validates cleanly', () => {
  const { template } = loadBuiltin('milestone.yaml');
  const r = validate(template);
  assert.strictEqual(r.ok, true, `errors: ${JSON.stringify(r.errors)}`);
  const bad = r.warnings.filter((w) => /routing key|must agree/.test(w));
  assert.deepStrictEqual(bad, [], `unexpected role/skill warnings: ${bad.join('; ')}`);
});

check('quick.yaml: no ${config.…} or unresolved {{…}} on role/skill lines', () => {
  const { dir, template } = loadBuiltin('quick.yaml');
  const instructions = instructionsFor(template, dir);
  for (const { wave, text } of instructions) {
    // Hard rule: no raw config token leakage anywhere.
    assert.ok(
      !/\$\{config\./.test(text),
      `wave ${wave} leaks \${config.…}:\n${text}`
    );
    // role/skill lines must be fully resolved.
    const roleSkillLines = text.split('\n').filter((l) => /^\s*(role|skill):/i.test(l));
    for (const line of roleSkillLines) {
      assert.ok(
        !/\{\{[^}]+\}\}/.test(line),
        `unresolved {{...}} on role/skill line: ${line}`
      );
    }
  }
});

check('milestone.yaml: no ${config.…} or unresolved {{…}} on role/skill lines', () => {
  const { dir, template } = loadBuiltin('milestone.yaml');
  const instructions = instructionsFor(template, dir);
  for (const { wave, text } of instructions) {
    assert.ok(
      !/\$\{config\./.test(text),
      `wave ${wave} leaks \${config.…}:\n${text}`
    );
    const roleSkillLines = text.split('\n').filter((l) => /^\s*(role|skill):/i.test(l));
    for (const line of roleSkillLines) {
      assert.ok(
        !/\{\{[^}]+\}\}/.test(line),
        `unresolved {{...}} on role/skill line: ${line}`
      );
    }
  }
});

check('quick.yaml design phase: STOP gate is present in description', () => {
  const { dir, template } = loadBuiltin('quick.yaml');
  // Find the design phase
  const designPhase = template.phases.find((p) => p.id === 'design');
  assert.ok(designPhase, 'design phase missing');
  assert.ok(
    /STOP/.test(designPhase.description || ''),
    `design.description missing STOP gate:\n${designPhase.description}`
  );
  assert.ok(
    /confirm DESIGN\.md/i.test(designPhase.description || ''),
    `design.description missing 'confirm DESIGN.md' language:\n${designPhase.description}`
  );

  // Also confirm the STOP text reaches the supervisor instruction.
  const instructions = instructionsFor(template, dir);
  const joined = instructions.map((i) => i.text).join('\n');
  assert.ok(/STOP/.test(joined), 'STOP gate did not reach supervisor instruction');
});

check('quick.yaml: persona role + routing-key-derived skill', () => {
  const { template } = loadBuiltin('quick.yaml');
  const design = template.phases.find((p) => p.id === 'design');
  const execute = template.phases.find((p) => p.id === 'execute');
  // After top-level param substitution role should be persona literal.
  assert.strictEqual(design.role, 'tech-writer', `design.role=${design.role}`);
  assert.strictEqual(execute.role, 'developer', `execute.role=${execute.role}`);
  // Skill should be the routing key literal at template-load time
  // (runtime resolves it via provider.resolveSkill).
  assert.strictEqual(design.skill, 'plan', `design.skill=${design.skill}`);
  assert.strictEqual(execute.skill, 'execute', `execute.skill=${execute.skill}`);
});

check('milestone.yaml: persona roles + routing-key skills', () => {
  const { template } = loadBuiltin('milestone.yaml');
  const brainstorm = template.phases.find((p) => p.id === 'brainstorm');
  const proposeUpdates = template.phases.find((p) => p.id === 'propose-project-updates');
  const proposePhases = template.phases.find((p) => p.id === 'propose-phases');
  assert.strictEqual(brainstorm.role, 'product-thinker');
  assert.strictEqual(brainstorm.skill, 'brainstorm');
  assert.strictEqual(proposeUpdates.role, 'developer');
  assert.strictEqual(proposeUpdates.skill, 'plan');
  assert.strictEqual(proposePhases.role, 'developer');
  assert.strictEqual(proposePhases.skill, 'plan');
});

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
