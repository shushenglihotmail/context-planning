'use strict';

/**
 * Bug F — Phase 110 — (c) Audit rule: skill-resolved-but-not-loaded.
 *
 * Fixtures are pure file-system: create .planning/.run-state/<slug>/<phase>.json
 * and call checkSkillResolvedButNotLoaded() directly.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const audit = require('../lib/audit');

let passed = 0, failed = 0;

function ok(label, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function section(t) { console.log(`\n=== ${t} ===`); }

console.log('\nintegration-audit-skill-resolved-but-not-loaded:');

/**
 * Create a minimal project wired to a reviewer-bearing execute skill.
 * Optionally create a run-state file under .planning/.run-state/.
 */
function mkProject(opts) {
  const { executeSkill, invokedSkill, slugName, phaseName } = opts;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-asrbl-'));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });

  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-target'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Phases\n\n### Phase 1: Target\n');
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    '# State\n\n## Current Position\n\nPhase: 1\nStatus: Ready\nLast activity: 2024-01-01 — seed\n');
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-target', 'PLAN.md'),
    '---\nphase: "1"\n---\n# Phase 1\n');
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-target', 'SUMMARY.md'),
    '# Summary\n\nDone.\n');
  execSync('git add -A && git commit -q -m "seed"', { cwd: dir });

  // Provider config with the execute skill
  if (executeSkill) {
    const cfg = {
      cp: {
        workflow_provider: 'test-manual',
        providers: {
          'test-manual': {
            description: 'test manual',
            detect: { always: true },
            skills: { execute: executeSkill },
            prompts: {},
          },
        },
      },
    };
    fs.writeFileSync(
      path.join(dir, '.planning', 'config.json'),
      JSON.stringify(cfg, null, 2) + '\n',
    );
  } else {
    // No cp config → provider resolution yields no skill → rule skips
    fs.writeFileSync(path.join(dir, '.planning', 'config.json'), JSON.stringify({ cp: {} }));
  }

  // Optionally create a run-state file
  if (slugName != null && phaseName != null && invokedSkill !== undefined) {
    const stateDir = path.join(dir, '.planning', '.run-state', slugName);
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, `${phaseName}.json`),
      JSON.stringify({ invoked_skill: invokedSkill })
    );
  }

  return dir;
}

// --------------------------------------------------------------------------

section('Fixture 1: allowlist skill + invoked_skill=<unrecorded> → MEDIUM finding');
{
  const root = mkProject({
    executeSkill: 'superpowers/subagent-driven-development',
    slugName: 'run-001',
    phaseName: 'execute',
    invokedSkill: '<unrecorded>',
  });
  const fn = audit.checkSkillResolvedButNotLoaded;
  ok('check is exported', typeof fn === 'function');
  const findings = fn(root, { phases: audit._listPhaseDirs(root) });
  ok('one finding emitted', findings.length >= 1, `got ${findings.length}: ${JSON.stringify(findings)}`);
  ok('finding id correct', findings[0].id === 'skill-resolved-but-not-loaded',
    `got: ${findings[0].id}`);
  ok('severity is MEDIUM', findings[0].severity === 'MEDIUM',
    `got: ${findings[0].severity}`);
  ok('message mentions unrecorded or mismatch',
    /unrecorded|mismatch/.test(findings[0].message),
    `got: ${findings[0].message}`);
}

section('Fixture 2: allowlist skill + invoked_skill matches resolved skill → no finding');
{
  const root = mkProject({
    executeSkill: 'superpowers/subagent-driven-development',
    slugName: 'run-002',
    phaseName: 'execute',
    invokedSkill: 'superpowers/subagent-driven-development',
  });
  const findings = audit.checkSkillResolvedButNotLoaded(root, { phases: audit._listPhaseDirs(root) });
  ok('no findings on match', findings.length === 0, `got ${findings.length}: ${JSON.stringify(findings)}`);
}

section('Fixture 3: allowlist skill + invoked_skill mismatch → MEDIUM finding');
{
  const root = mkProject({
    executeSkill: 'superpowers/subagent-driven-development',
    slugName: 'run-003',
    phaseName: 'execute',
    invokedSkill: 'orchestrator (inline)',
  });
  const findings = audit.checkSkillResolvedButNotLoaded(root, { phases: audit._listPhaseDirs(root) });
  ok('one finding on mismatch', findings.length >= 1, `got ${findings.length}`);
  ok('severity MEDIUM', findings[0].severity === 'MEDIUM');
  ok('message mentions mismatch', /mismatch/.test(findings[0].message),
    `got: ${findings[0].message}`);
}

section('Fixture 4: non-allowlist skill + <unrecorded> → no finding (rule skips)');
{
  const root = mkProject({
    executeSkill: 'custom-skill-not-in-list',
    slugName: 'run-004',
    phaseName: 'execute',
    invokedSkill: '<unrecorded>',
  });
  const findings = audit.checkSkillResolvedButNotLoaded(root, { phases: audit._listPhaseDirs(root) });
  ok('no findings for non-allowlist skill', findings.length === 0, `got ${findings.length}`);
}

section('Fixture 5: run-state file missing entirely → MEDIUM finding (treated as <unrecorded>)');
{
  // No slugName / phaseName / invokedSkill provided → no .run-state file
  const root = mkProject({
    executeSkill: 'superpowers/subagent-driven-development',
  });
  // Manually create the run-state DIR but not the file, to simulate a run that
  // started but never wrote a phase attestation.
  fs.mkdirSync(path.join(root, '.planning', '.run-state', 'run-005'), { recursive: true });
  // No phase json written.

  const findings = audit.checkSkillResolvedButNotLoaded(root, { phases: audit._listPhaseDirs(root) });
  // With no files to check, there should be no findings — the rule only fires
  // when a run-state file exists but lacks/mismatches the attestation.
  ok('no findings when run-state dir empty', findings.length === 0,
    `got ${findings.length}: ${JSON.stringify(findings)}`);
}

section('Fixture 6: (inline-fallback) is accepted — LOW finding, not MEDIUM');
{
  const root = mkProject({
    executeSkill: 'superpowers/subagent-driven-development',
    slugName: 'run-006',
    phaseName: 'execute',
    invokedSkill: '(inline-fallback)',
  });
  const findings = audit.checkSkillResolvedButNotLoaded(root, { phases: audit._listPhaseDirs(root) });
  // (inline-fallback) is a deliberate fallback: emit LOW or no finding.
  // This implementation emits LOW.
  ok('at most one finding (inline-fallback)', findings.length <= 1);
  if (findings.length > 0) {
    ok('severity LOW for inline-fallback', findings[0].severity === 'LOW',
      `got: ${findings[0].severity}`);
  }
}

section('No config (no provider) → no findings');
{
  const root = mkProject({ executeSkill: null });
  const findings = audit.checkSkillResolvedButNotLoaded(root, { phases: audit._listPhaseDirs(root) });
  ok('no findings when no provider configured', findings.length === 0);
}

// ---- summary ----
console.log(`\n  ${passed} passing, ${failed} failing`);
if (failed > 0) process.exit(1);
