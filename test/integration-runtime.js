'use strict';

/**
 * Integration test for lib/runtime.js — stateful wave-walker.
 *
 * Tests all three binding tiers (quick, milestone, phase), formatInstruction
 * output format, markPhaseComplete wave advancement, resumeRun round-trip,
 * retryPhase / abandonRun lifecycle.
 *
 * ~40 assertions. No external test runner — bespoke ok() / section() helpers.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('yaml');

const runtime = require('../lib/runtime');
const lifecycle = require('../lib/lifecycle');
const paths = require('../lib/paths');

let pass = 0, fail = 0;
const failures = [];

function section(title) { console.log('\n=== ' + title + ' ==='); }

function ok(label, cond, detail) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    failures.push(label + (detail ? ': ' + detail : ''));
    console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
  }
}

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'workflows');
const DEBUG_MINI = path.join(FIXTURE_DIR, 'debug-mini.yaml');
const QUICK_MINI = path.join(FIXTURE_DIR, 'quick-mini.yaml');
const DEV_MINI = path.join(FIXTURE_DIR, 'dev-mini.yaml');

/**
 * Create an isolated project directory suitable for integration tests.
 * Includes: git repo, .planning scaffold, PROJECT.md with Constraints,
 * ROADMAP.md with ## Phases, STATE.md with ## Current Position + Progress.
 */
function freshProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-runtime-'));
  spawnSync('git', ['init', '-q'], {cwd: dir});
  spawnSync('git', ['config', 'user.email', 'test@local'], {cwd: dir});
  spawnSync('git', ['config', 'user.name', 'Test'], {cwd: dir});
  spawnSync('git', ['config', 'commit.gpgsign', 'false'], {cwd: dir});
  fs.mkdirSync(path.join(dir, '.planning'), {recursive: true});

  fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'),
    '# Test Project\n\n## Constraints\n\n- Constraint A\n- Constraint B\n');

  // ROADMAP.md must have ## Phases for scaffoldMilestone + scaffoldPhase
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Validated Requirements\n\n## Active Requirements\n\n## Phases\n');

  // STATE.md must have ## Current Position with Progress line for state.regenerate
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    '# State\n\n## Current Position\n\nPhase: -\nPlan: -\nStatus: Idle\n' +
    'Current focus: -\nLast activity: -\n\nProgress: [░░░░░░░░░░] 0%\n');

  spawnSync('git', ['add', '.'], {cwd: dir});
  spawnSync('git', ['commit', '-q', '-m', 'init'], {cwd: dir});
  return dir;
}

// ============================================================
// Section 1: formatInstruction — output format
// ============================================================
section('formatInstruction — output format');

{
  const dir = freshProject();
  const tpl = require('../lib/workflow').loadTemplate(DEBUG_MINI, {projectDir: dir});
  const waves = require('../lib/workflow').computeWaves(tpl);
  // debug-mini wave 0: [collect-symptoms] (single)
  const instr = runtime.formatInstruction(tpl, waves[0], 0, {
    projectDir: dir, slug: 'test-slug', totalWaves: waves.length,
  });

  ok('contains Global directives preamble',
    /Global directives \(apply to every phase of this workflow\)/.test(instr), instr.slice(0, 300));

  ok('Project constraints listed (1.)',
    /1\. Constraint A/.test(instr), instr.slice(0, 400));

  ok('Project constraints listed (2.)',
    /2\. Constraint B/.test(instr), instr.slice(0, 400));

  ok('Workflow principles listed',
    /Reproduce before fixing/.test(instr), instr.slice(0, 400));

  ok('Wave N of M line present',
    /Wave 1 of 4 — 1 phase\(s\) to execute:/.test(instr), instr.slice(0, 500));

  // Single-phase wave: [parallel] header must be absent
  ok('[parallel] header absent for single-phase wave',
    !/\[parallel\]/.test(instr));

  ok('Phase: id present',
    /Phase: collect-symptoms/.test(instr));

  ok('role field present',
    /role:\s+investigator/.test(instr));

  ok('absent fields render as (absent) / (none)',
    /model: \(absent\)/.test(instr) && /skill: \(none\)/.test(instr));

  ok('closing cp run mark-complete line present',
    /cp run mark-complete test-slug collect-symptoms < summary\.md/.test(instr));
}

{
  // Parallel wave — dev-mini wave 1 has research-a + research-b
  const dir = freshProject();
  const tpl = require('../lib/workflow').loadTemplate(DEV_MINI, {projectDir: dir});
  const waves = require('../lib/workflow').computeWaves(tpl);
  // wave 1: [research-a, research-b]
  const parallelWave = waves[1];
  ok('parallel wave has 2 phases', parallelWave.length === 2, String(parallelWave.length));
  const instr = runtime.formatInstruction(tpl, parallelWave, 1, {
    projectDir: dir, slug: 'dev-slug', totalWaves: waves.length,
  });
  ok('[parallel] header present for 2-phase wave',
    /\[parallel\] Dispatch the following 2 phases concurrently/.test(instr), instr.slice(0, 500));
}

// ============================================================
// Section 2: startRun — quick tier
// ============================================================
section('startRun — quick tier');

{
  const dir = freshProject();
  const now = new Date('2025-03-15T10:00:00.000Z');
  const result = runtime.startRun(DEBUG_MINI, {projectDir: dir, name: 'my-debug-run', now});

  ok('returns slug', typeof result.slug === 'string' && result.slug.length > 0, result.slug);
  ok('binding is quick', result.binding === 'quick', result.binding);
  ok('slug matches date pattern', /^\d{4}-\d{2}-\d{2}/.test(result.slug), result.slug);
  ok('firstInstruction is non-empty string',
    typeof result.firstInstruction === 'string' && result.firstInstruction.length > 0);
  ok('template returned', result.template && result.template.meta && result.template.meta.workflow === 'debug-mini');
  ok('waves array returned', Array.isArray(result.waves) && result.waves.length > 0);

  // State file exists
  const stateFile = path.join(dir, '.planning', 'quick', result.slug, 'STATE.yaml');
  ok('STATE.yaml created', fs.existsSync(stateFile), stateFile);

  const state = yaml.parse(fs.readFileSync(stateFile, 'utf8'));
  ok('state has template_path', typeof state.template_path === 'string' && state.template_path.length > 0);
  ok('state current_wave starts at 0', state.current_wave === 0, String(state.current_wave));
}

{
  // dryRun: true must NOT create state files
  const dir = freshProject();
  const result = runtime.startRun(DEBUG_MINI, {projectDir: dir, dryRun: true});
  ok('dryRun returns waves array', Array.isArray(result.waves) && result.waves.length > 0);
  ok('dryRun waves have instruction field',
    result.waves[0] && typeof result.waves[0].instruction === 'string');
  const customRoot = path.join(dir, '.planning', 'quick');
  ok('dryRun does NOT create quick dir',
    !fs.existsSync(customRoot) || fs.readdirSync(customRoot).length === 0);
}

// ============================================================
// Section 3: startRun — milestone tier
// ============================================================
section('startRun — milestone tier');

{
  const dir = freshProject();
  const now = new Date('2025-04-01T09:00:00.000Z');
  const result = runtime.startRun(DEV_MINI, {projectDir: dir, name: 'Test Milestone', now});

  ok('milestone binding returned', result.binding === 'milestone', result.binding);

  // ROADMAP.md should contain the new milestone heading
  const roadmap = fs.readFileSync(path.join(dir, '.planning', 'ROADMAP.md'), 'utf8');
  ok('ROADMAP updated with milestone heading',
    /Test Milestone/.test(roadmap), roadmap.slice(0, 400));

  // dev-mini has 5 phases — all should be scaffolded
  const phasesDir = path.join(dir, '.planning', 'phases');
  const phaseEntries = fs.existsSync(phasesDir) ? fs.readdirSync(phasesDir) : [];
  ok('5 phase dirs scaffolded (one per template phase)', phaseEntries.length === 5,
    `found: ${phaseEntries.join(', ')}`);

  // RUN.yaml exists at expected path
  const slug = paths.milestoneSlug('Test Milestone');
  const runYamlPath = path.join(dir, '.planning', 'milestones', slug, 'RUN.yaml');
  ok('RUN.yaml created at milestone dir', fs.existsSync(runYamlPath), runYamlPath);

  const runState = yaml.parse(fs.readFileSync(runYamlPath, 'utf8'));
  ok('RUN.yaml has phaseNumByPhaseId with brainstorm',
    runState.phaseNumByPhaseId && typeof runState.phaseNumByPhaseId.brainstorm === 'number');
}

{
  // Missing opts.name throws
  const dir = freshProject();
  let threw = false;
  let threwMsg = '';
  try {
    runtime.startRun(DEV_MINI, {projectDir: dir});
  } catch (e) {
    threw = true;
    threwMsg = e.message || '';
  }
  ok('missing opts.name throws', threw);
  ok('error mentions "opts.name" or "name"',
    /name/i.test(threwMsg), threwMsg);
}

// ============================================================
// Section 4: startRun — phase tier
// ============================================================
section('startRun — phase tier');

{
  // Write an inline phase-binding template into a fresh project dir
  const dir = freshProject();
  const phaseTplPath = path.join(dir, 'phase-test.yaml');
  fs.writeFileSync(phaseTplPath,
    'workflow: phase-test\nversion: 1\nbinds_to: phase\nphases:\n' +
    '  - phase:\n      id: step1\n      description: step1\n      prompt: |\n        Do step 1.\n');

  // With no active milestone/phase -> should throw
  let threw = false, threwMsg = '';
  try {
    runtime.startRun(phaseTplPath, {projectDir: dir});
  } catch (e) {
    threw = true;
    threwMsg = e.message || '';
  }
  ok('no active phase throws', threw);
  ok('error mentions "active phase"', /active phase/i.test(threwMsg), threwMsg);

  // Scaffold a milestone + phase so statusReport returns an active phase
  lifecycle.scaffoldMilestone(dir, 'Phase Tier Milestone');
  lifecycle.scaffoldPhase(dir, 1, {
    name: 'Target Phase',
    force: true,
    milestone: 'Phase Tier Milestone',
  });

  const now = new Date('2025-05-10T14:30:00.000Z');
  const result = runtime.startRun(phaseTplPath, {projectDir: dir, now});
  ok('phase tier: slug non-empty', typeof result.slug === 'string' && result.slug.length > 0,
    result.slug);

  // PLAN.md should have the workflow run section appended
  const phaseDirPath = paths.findPhaseDir('1', dir);
  const planContent = fs.readFileSync(path.join(phaseDirPath, 'PLAN.md'), 'utf8');
  ok('phase tier: PLAN.md has workflow run section',
    /Workflow run:/.test(planContent));

  // RUN.yaml should exist under .workflow-runs/
  const runPath = path.join(phaseDirPath, '.workflow-runs', `${result.slug}.yaml`);
  ok('phase tier: RUN.yaml under .workflow-runs/', fs.existsSync(runPath), runPath);
}

// ============================================================
// Section 5: markPhaseComplete — single-phase waves (quick)
// ============================================================
section('markPhaseComplete — single-phase wave advancement');

{
  // quick-mini: discuss -> execute -> verify (each in its own wave)
  const dir = freshProject();
  const now = new Date('2025-06-01T08:00:00.000Z');
  const {slug} = runtime.startRun(QUICK_MINI, {projectDir: dir, now});

  // Wave 0: discuss — completing it should advance to wave 1
  const r0 = runtime.markPhaseComplete(slug, 'discuss', '# Discuss summary', {projectDir: dir, now});
  ok('single-phase wave: current_wave advances after completing only phase',
    r0.wave === 0, `wave returned: ${r0.wave}`);
  ok('single-phase wave: nextInstruction non-empty when more waves remain',
    typeof r0.nextInstruction === 'string' && r0.nextInstruction.length > 0);
  ok('single-phase wave: doneAfter false', r0.doneAfter === false, String(r0.doneAfter));

  // Verify state updated
  const state1 = require('../lib/custom').readState(slug, {projectDir: dir});
  ok('completed[] contains discuss', (state1.completed || []).includes('discuss'));
  ok('current_wave is 1 after wave 0 complete', state1.current_wave === 1, String(state1.current_wave));

  // Wave 1: execute
  runtime.markPhaseComplete(slug, 'execute', '# Execute summary', {projectDir: dir, now});

  // Wave 2: verify — last wave
  const rLast = runtime.markPhaseComplete(slug, 'verify', '# Verify summary', {projectDir: dir, now});
  ok('last wave: doneAfter true', rLast.doneAfter === true, String(rLast.doneAfter));
  ok('last wave: nextInstruction null', rLast.nextInstruction === null, String(rLast.nextInstruction));

  const stateFinal = require('../lib/custom').readState(slug, {projectDir: dir});
  ok('status done after all waves', stateFinal.status === 'done', stateFinal.status);
}

// ============================================================
// Section 6: markPhaseComplete — parallel wave (milestone tier)
// ============================================================
section('markPhaseComplete — parallel wave (milestone tier)');

{
  const dir = freshProject();
  const now = new Date('2025-07-01T09:00:00.000Z');
  const {slug} = runtime.startRun(DEV_MINI, {projectDir: dir, name: 'Parallel Wave Test', now});

  // Wave 0: brainstorm — advance to wave 1 (parallel: research-a + research-b)
  runtime.markPhaseComplete(slug, 'brainstorm', 'Brainstorm done', {projectDir: dir, now});

  // Wave 1 first half: research-a only — wave should NOT advance
  const r1 = runtime.markPhaseComplete(slug, 'research-a', 'Research A done', {projectDir: dir, now});
  ok('parallel wave partial: nextInstruction null', r1.nextInstruction === null, String(r1.nextInstruction));
  ok('parallel wave partial: doneAfter false', r1.doneAfter === false, String(r1.doneAfter));
  ok('parallel wave partial: wave index still 1', r1.wave === 1, String(r1.wave));

  // Wave 1 second half: research-b — wave should NOW advance
  const r2 = runtime.markPhaseComplete(slug, 'research-b', 'Research B done', {projectDir: dir, now});
  ok('parallel wave complete: wave index is 1 (the completed wave)', r2.wave === 1, String(r2.wave));
  ok('parallel wave complete: nextInstruction non-empty (plan wave)',
    typeof r2.nextInstruction === 'string' && r2.nextInstruction.length > 0);

  // Out-of-wave phase throws (currently in wave 2 = plan; trying to mark research-a again)
  let threw = false, threwMsg = '';
  try {
    runtime.markPhaseComplete(slug, 'research-a', 'redo', {projectDir: dir, now});
  } catch (e) {
    threw = true;
    threwMsg = e.message || '';
  }
  ok('out-of-wave phase throws', threw);
  ok('error mentions current wave ids', /not in current wave/i.test(threwMsg), threwMsg);
}

// ============================================================
// Section 7: resumeRun round-trip
// ============================================================
section('resumeRun — round-trip');

{
  const dir = freshProject();
  const now = new Date('2025-08-01T10:00:00.000Z');
  const {slug, firstInstruction} = runtime.startRun(QUICK_MINI, {projectDir: dir, now});

  const resumed = runtime.resumeRun(slug, {projectDir: dir});
  ok('resumeRun returns currentWave 0', resumed.currentWave === 0, String(resumed.currentWave));
  ok('resumeRun instruction matches firstInstruction', resumed.instruction === firstInstruction);
  ok('resumeRun returns binding quick', resumed.binding === 'quick', resumed.binding);
}

{
  // Unknown slug throws
  const dir = freshProject();
  let threw = false, threwMsg = '';
  try {
    runtime.resumeRun('no-such-slug-xyz', {projectDir: dir});
  } catch (e) {
    threw = true;
    threwMsg = e.message || '';
  }
  ok('resumeRun unknown slug throws', threw);
  ok('error contains slug', /no-such-slug-xyz/.test(threwMsg), threwMsg);
}

{
  // resumeRun works for milestone tier
  const dir = freshProject();
  const now = new Date('2025-08-15T11:00:00.000Z');
  const {slug} = runtime.startRun(DEV_MINI, {projectDir: dir, name: 'Resume Test', now});

  const resumed = runtime.resumeRun(slug, {projectDir: dir});
  ok('milestone tier resumeRun: binding is milestone', resumed.binding === 'milestone', resumed.binding);
  ok('milestone tier resumeRun: currentWave is 0', resumed.currentWave === 0, String(resumed.currentWave));
  ok('milestone tier resumeRun: instruction non-empty',
    typeof resumed.instruction === 'string' && resumed.instruction.length > 0);
}

// ============================================================
// Section 8: retryPhase / abandonRun
// ============================================================
section('retryPhase / abandonRun');

{
  // retryPhase: mark discuss complete (wave advances), then retry discuss
  // — should remove it from completed and roll wave back
  const dir = freshProject();
  const now = new Date('2025-09-01T12:00:00.000Z');
  const {slug} = runtime.startRun(QUICK_MINI, {projectDir: dir, now});

  runtime.markPhaseComplete(slug, 'discuss', 'Discuss done', {projectDir: dir, now});

  const retryResult = runtime.retryPhase(slug, 'discuss', {projectDir: dir, now});
  ok('retryPhase returns instruction', typeof retryResult.instruction === 'string' && retryResult.instruction.length > 0);
  ok('retryPhase returns wave for discuss (0)', retryResult.wave === 0, String(retryResult.wave));

  const stateAfterRetry = require('../lib/custom').readState(slug, {projectDir: dir});
  ok('retryPhase removes phaseId from completed[]',
    !(stateAfterRetry.completed || []).includes('discuss'),
    JSON.stringify(stateAfterRetry.completed));
  ok('retryPhase rolls back current_wave to 0', stateAfterRetry.current_wave === 0,
    String(stateAfterRetry.current_wave));
}

{
  // abandonRun sets status to abandoned
  const dir = freshProject();
  const now = new Date('2025-09-10T14:00:00.000Z');
  const {slug} = runtime.startRun(DEBUG_MINI, {projectDir: dir, name: 'to-abandon', now});

  const r = runtime.abandonRun(slug, {projectDir: dir, now});
  ok('abandonRun returns {status: "abandoned"}', r.status === 'abandoned', JSON.stringify(r));

  const state = require('../lib/custom').readState(slug, {projectDir: dir});
  ok('abandonRun writes abandoned status to state', state.status === 'abandoned', state.status);
}

{
  // abandonRun on milestone tier: only RUN.yaml is touched
  const dir = freshProject();
  const now = new Date('2025-09-20T10:00:00.000Z');
  const {slug} = runtime.startRun(DEV_MINI, {projectDir: dir, name: 'Abandon Test MS', now});

  // Verify milestone heading is still in ROADMAP before abandon
  const roadmapBefore = fs.readFileSync(path.join(dir, '.planning', 'ROADMAP.md'), 'utf8');
  const hadMilestone = /Abandon Test MS/.test(roadmapBefore);

  runtime.abandonRun(slug, {projectDir: dir, now});

  // ROADMAP should still contain the milestone (not deleted)
  const roadmapAfter = fs.readFileSync(path.join(dir, '.planning', 'ROADMAP.md'), 'utf8');
  ok('milestone: abandonRun does NOT remove milestone from ROADMAP',
    hadMilestone && /Abandon Test MS/.test(roadmapAfter));

  // RUN.yaml status should be abandoned
  const runYamlPath = path.join(dir, '.planning', 'milestones', slug, 'RUN.yaml');
  const runState = yaml.parse(fs.readFileSync(runYamlPath, 'utf8'));
  ok('milestone: RUN.yaml status is abandoned', runState.status === 'abandoned', runState.status);
}

// ============================================================
// Results
// ============================================================
console.log('\n----------------------------------------');
console.log('Passed: ' + pass + '   Failed: ' + fail);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(function(f) { console.log('  - ' + f); });
  process.exit(1);
}
