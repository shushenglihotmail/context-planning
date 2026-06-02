'use strict';

/**
 * Bug F — Phase 110 — (b) mark-complete invoked_skill parser.
 *
 * Tests that the mark-complete handler (via `cp run mark-complete`) writes
 * `invoked_skill` from stdin to .planning/.run-state/<slug>/<phaseId>.json.
 *
 * Tests exercise the lib function directly (not via the CLI binary) to keep
 * tests fast and deterministic.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const { execSync } = require('child_process');

// Import the helper we'll add to runtime
const runtime = require('../lib/runtime');

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

console.log('\nintegration-mark-complete-invoked-skill:');

/**
 * Build a minimal project with a single-phase workflow run in progress.
 * Returns { dir, slug, phaseId }.
 */
function mkFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-mci-'));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });

  fs.mkdirSync(path.join(dir, '.planning', 'phases', '01-target'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'),
    '# State\n\n## Current Position\n\nPhase: 1\nStatus: Ready\nLast activity: 2024-01-01 — seed\n');
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Phases\n\n### Phase 1: Target\n');
  fs.writeFileSync(path.join(dir, '.planning', 'phases', '01-target', 'PLAN.md'),
    '---\nphase: "1"\n---\n# Phase 1\n');
  fs.writeFileSync(path.join(dir, '.planning', 'config.json'), JSON.stringify({}));
  execSync('git add -A && git commit -q -m "seed"', { cwd: dir });

  // Build a minimal 1-phase workflow template
  const wfYaml = yaml.stringify({
    workflow: 'single',
    version: 1,
    binds_to: 'phase',
    phases: [
      { phase: { id: 'execute', description: 'do it', prompt: 'go', skill: 'subagent-driven-development' } },
    ],
  });
  const wfPath = path.join(dir, 'single.yaml');
  fs.writeFileSync(wfPath, wfYaml);

  // Start the run
  const { slug } = runtime.startRun(wfPath, { projectDir: dir, now: new Date('2024-01-01T10:00:00Z') });
  return { dir, slug, phaseId: 'execute' };
}

// --------------------------------------------------------------------------

section('parseInvokedSkill helper');

const parseInvokedSkill = runtime._parseInvokedSkill;
ok('helper is exported', typeof parseInvokedSkill === 'function');

section('Test 1: stdin without invoked_skill → <unrecorded>');
{
  const val = parseInvokedSkill('# Summary\n\nDid the work.\n');
  ok('returns <unrecorded>', val === '<unrecorded>', `got: ${val}`);
}

section('Test 2: stdin with invoked_skill: foo → "foo"');
{
  const val = parseInvokedSkill('# Summary\n\ninvoked_skill: foo\n\nDone.\n');
  ok('returns "foo"', val === 'foo', `got: ${val}`);
}

section('Test 3: stdin with superpowers skill → correct name');
{
  const val = parseInvokedSkill(
    '## Notes\n\nAll good.\n\ninvoked_skill: superpowers/subagent-driven-development\n'
  );
  ok('returns full skill name', val === 'superpowers/subagent-driven-development', `got: ${val}`);
}

section('Test 4: inline-fallback case');
{
  const val = parseInvokedSkill('invoked_skill: (inline-fallback)\n');
  ok('returns (inline-fallback)', val === '(inline-fallback)', `got: ${val}`);
}

section('Test 5: invoked_skill in middle of multi-line stdin');
{
  const val = parseInvokedSkill(
    'line1\nline2\ninvoked_skill: my-skill\nline4\nline5\n'
  );
  ok('extracts from middle', val === 'my-skill', `got: ${val}`);
}

section('Test 6: run-state file written by mark-complete');
{
  const { dir, slug, phaseId } = mkFixture();
  runtime.markPhaseComplete(slug, phaseId,
    '# Summary\n\nDid it.\n\ninvoked_skill: subagent-driven-development\n',
    { projectDir: dir, now: new Date('2024-01-01T11:00:00Z') }
  );
  const stateFile = path.join(dir, '.planning', '.run-state', slug, `${phaseId}.json`);
  ok('run-state file created', fs.existsSync(stateFile), `path: ${stateFile}`);
  const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  ok('invoked_skill persisted', data.invoked_skill === 'subagent-driven-development',
    `got: ${JSON.stringify(data)}`);
}

section('Test 7: missing invoked_skill → <unrecorded> in run-state');
{
  const { dir, slug, phaseId } = mkFixture();
  runtime.markPhaseComplete(slug, phaseId,
    '# Summary\n\nDid it without attestation.\n',
    { projectDir: dir, now: new Date('2024-01-01T11:00:00Z') }
  );
  const stateFile = path.join(dir, '.planning', '.run-state', slug, `${phaseId}.json`);
  ok('run-state file created', fs.existsSync(stateFile), `path: ${stateFile}`);
  const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  ok('invoked_skill is <unrecorded>', data.invoked_skill === '<unrecorded>',
    `got: ${JSON.stringify(data)}`);
}

section('Test 8: existing run-state file is updated (no data loss)');
{
  const { dir, slug, phaseId } = mkFixture();
  const stateFile = path.join(dir, '.planning', '.run-state', slug, `${phaseId}.json`);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({ existing_field: 'keep-me', invoked_skill: 'old' }));

  runtime.markPhaseComplete(slug, phaseId,
    '# Summary\n\ninvoked_skill: new-skill\n',
    { projectDir: dir, now: new Date('2024-01-01T11:00:00Z') }
  );
  const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  ok('existing_field preserved', data.existing_field === 'keep-me', `got: ${JSON.stringify(data)}`);
  ok('invoked_skill updated', data.invoked_skill === 'new-skill', `got: ${JSON.stringify(data)}`);
}

// ---- summary ----
console.log(`\n  ${passed} passing, ${failed} failing`);
if (failed > 0) process.exit(1);
