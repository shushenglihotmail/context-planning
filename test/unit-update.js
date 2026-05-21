'use strict';

/**
 * Unit tests for lib/update.js — the cp update orchestration.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execSync } = require('node:child_process');

const update = require('../lib/update');

let passed = 0;
function t(name, fn) {
  fn();
  console.log('  ✓', name);
  passed++;
}

console.log('unit-update');

function mkTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-update-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email cp@test', { cwd: dir });
  execSync('git config user.name cp-test', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
  return dir;
}

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- detectHarnesses ----------

t('detectHarnesses returns empty array for fresh repo', () => {
  const dir = mkTempRepo();
  try {
    assert.deepEqual(update.detectHarnesses(dir), []);
  } finally { rm(dir); }
});

t('detectHarnesses finds copilot via .github/skills marker', () => {
  const dir = mkTempRepo();
  try {
    fs.mkdirSync(path.join(dir, '.github', 'skills', 'cp-status'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.github', 'skills', 'cp-status', 'SKILL.md'), '#');
    assert.deepEqual(update.detectHarnesses(dir), ['copilot']);
  } finally { rm(dir); }
});

t('detectHarnesses finds claude via .claude/commands/cp marker', () => {
  const dir = mkTempRepo();
  try {
    fs.mkdirSync(path.join(dir, '.claude', 'commands', 'cp'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'commands', 'cp', 'status.md'), '#');
    assert.deepEqual(update.detectHarnesses(dir), ['claude']);
  } finally { rm(dir); }
});

t('detectHarnesses finds multiple harnesses in canonical order', () => {
  const dir = mkTempRepo();
  try {
    // Install in non-canonical order; detection must reorder.
    fs.mkdirSync(path.join(dir, '.claude', 'commands', 'cp'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'commands', 'cp', 'status.md'), '#');
    fs.mkdirSync(path.join(dir, '.github', 'skills', 'cp-status'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.github', 'skills', 'cp-status', 'SKILL.md'), '#');
    assert.deepEqual(update.detectHarnesses(dir), ['copilot', 'claude']);
  } finally { rm(dir); }
});

t('detectHarnesses seeds from config cp.harness when set', () => {
  const dir = mkTempRepo();
  try {
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.planning', 'config.json'),
      JSON.stringify({ cp: { harness: 'cursor', workflow_provider: 'manual', provider_skill_mapping: {} } }),
    );
    // No filesystem markers — config alone seeds detection.
    assert.deepEqual(update.detectHarnesses(dir), ['cursor']);
  } finally { rm(dir); }
});

// ---------- runUpdate ----------

t('runUpdate fails when .planning/ missing', () => {
  const dir = mkTempRepo();
  try {
    const r = update.runUpdate(dir, { quiet: true });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no-planning-dir');
    assert.match(r.message, /cp init/);
  } finally { rm(dir); }
});

t('runUpdate fails when no harness installed', () => {
  const dir = mkTempRepo();
  try {
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), '# Test');
    // Provide a minimal valid config — but NO harness anywhere.
    // Note: loadConfig will return defaults; we need to make sure that
    // doesn't accidentally seed a harness. Defaults set harness=copilot,
    // so even a fresh repo will detect copilot via config seeding.
    // To exercise the no-harness path we explicitly set harness to a
    // non-installed value AND ensure no filesystem markers exist.
    fs.writeFileSync(
      path.join(dir, '.planning', 'config.json'),
      JSON.stringify({ cp: { harness: 'nonexistent-harness', workflow_provider: 'manual', provider_skill_mapping: {} } }),
    );
    const r = update.runUpdate(dir, { quiet: true });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no-harness-detected');
  } finally { rm(dir); }
});

t('runUpdate dry-run does not write files', () => {
  const dir = mkTempRepo();
  try {
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), '# Test');
    // Pretend copilot is installed via filesystem marker.
    fs.mkdirSync(path.join(dir, '.github', 'skills', 'cp-status'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.github', 'skills', 'cp-status', 'SKILL.md'), 'old');
    const before = fs.readFileSync(path.join(dir, '.github', 'skills', 'cp-status', 'SKILL.md'), 'utf8');
    update.runUpdate(dir, { dryRun: true, quiet: true });
    const after = fs.readFileSync(path.join(dir, '.github', 'skills', 'cp-status', 'SKILL.md'), 'utf8');
    assert.equal(before, after, 'dry-run must not write skill files');
  } finally { rm(dir); }
});

t('runUpdate returns ok=true and structured steps when planning + harness OK', () => {
  const dir = mkTempRepo();
  try {
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), '# Test');
    // Stage as initial commit so install/refresh's git operations work.
    fs.writeFileSync(path.join(dir, '.planning', 'config.json'),
      JSON.stringify({ cp: { harness: 'copilot', workflow_provider: 'manual', provider_skill_mapping: {} } }));
    execSync('git add -A', { cwd: dir });
    execSync('git commit -q -m init', { cwd: dir });
    const r = update.runUpdate(dir, { dryRun: true, quiet: true });
    assert.equal(r.ok, true);
    assert.equal(r.dryRun, true);
    assert.ok(Array.isArray(r.steps));
    const stepNames = r.steps.map((s) => s.step);
    assert.ok(stepNames.includes('detect'));
    assert.ok(stepNames.includes('install'));
    assert.ok(stepNames.includes('config-refresh'));
    assert.ok(stepNames.includes('audit-fix'));
  } finally { rm(dir); }
});

console.log(`unit-update: ${passed} passed`);
