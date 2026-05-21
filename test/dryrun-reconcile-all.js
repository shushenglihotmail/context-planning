#!/usr/bin/env node
/**
 * Integration test for `cp reconcile --all` and `--phase <range>` CLI flags
 * — v0.8 Phase 29.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const CP = path.join(PLUGIN_ROOT, 'bin', 'cp.js');
const NODE = process.execPath;

let passed = 0,
  failed = 0;
function ok(label, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.log(`  \u2717 ${label}${detail ? ' :: ' + detail : ''}`);
  }
}
function section(t) {
  console.log(`\n=== ${t} ===`);
}

function runCp(cwd, args) {
  return spawnSync(NODE, [CP, ...args], { cwd, encoding: 'utf8' });
}

function setupMultiPhaseRepo(suffix, numPhases = 3) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), `cp-rall-cli-${suffix}-`))
  );
  execSync('git init -q -b main', { cwd: root });
  execSync('git config user.email t@l', { cwd: root });
  execSync('git config user.name t', { cwd: root });
  const phaseLines = [];
  for (let i = 1; i <= numPhases; i++) {
    const slug = `${String(i).padStart(2, '0')}-p${i}`;
    const dir = path.join(root, '.planning', 'phases', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'PLAN.md'),
      `---\nphase: "${i}"\nname: p${i}\n---\n# Phase ${i}\n`
    );
    phaseLines.push(`### Phase ${i}: p${i}\n\n- [ ] ${i}-01: x\n`);
  }
  fs.writeFileSync(
    path.join(root, '.planning', 'ROADMAP.md'),
    `# x\n\n## Phases\n\n### 🚧 v0 (In Progress)\n\n${phaseLines.join('\n')}\n`
  );
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# x\n');
  // Initial commit + one commit per phase to seed inferer.
  execSync('git add -A && git commit -q -m "init"', { cwd: root });
  for (let i = 1; i <= numPhases; i++) {
    fs.writeFileSync(path.join(root, `f${i}.txt`), 'x\n');
    execSync(`git add -A && git commit -q -m "cp(${i}-01): seed"`, { cwd: root });
  }
  return root;
}

// ----------------------------------------------------------------------
section('cp reconcile --all --infer-shas backfills every phase');
{
  const root = setupMultiPhaseRepo('all', 3);
  const r = runCp(root, ['reconcile', '--all', '--infer-shas', '--no-commit']);
  ok('exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('stdout mentions bulk', /bulk/.test(r.stdout), r.stdout);
  ok('mentions 3 phases scanned', /3 phases scanned/.test(r.stdout));
  for (let i = 1; i <= 3; i++) {
    const slug = `${String(i).padStart(2, '0')}-p${i}`;
    const c = fs.readFileSync(
      path.join(root, '.planning', 'phases', slug, 'PLAN.md'),
      'utf8'
    );
    ok(`phase ${i} got base-commit`, /base-commit:/.test(c));
  }
}

section('cp reconcile --phase 2-3 scopes correctly');
{
  const root = setupMultiPhaseRepo('range', 4);
  const r = runCp(root, ['reconcile', '--phase', '2-3', '--infer-shas', '--no-commit']);
  ok('exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('phase 1 untouched', !/base-commit:/.test(
    fs.readFileSync(path.join(root, '.planning', 'phases', '01-p1', 'PLAN.md'), 'utf8')
  ));
  ok('phase 2 backfilled', /base-commit:/.test(
    fs.readFileSync(path.join(root, '.planning', 'phases', '02-p2', 'PLAN.md'), 'utf8')
  ));
  ok('phase 3 backfilled', /base-commit:/.test(
    fs.readFileSync(path.join(root, '.planning', 'phases', '03-p3', 'PLAN.md'), 'utf8')
  ));
  ok('phase 4 untouched', !/base-commit:/.test(
    fs.readFileSync(path.join(root, '.planning', 'phases', '04-p4', 'PLAN.md'), 'utf8')
  ));
}

section('cp reconcile --phase 1,3 (comma list)');
{
  const root = setupMultiPhaseRepo('comma', 3);
  const r = runCp(root, ['reconcile', '--phase', '1,3', '--infer-shas', '--no-commit']);
  ok('exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('phase 1 backfilled', /base-commit:/.test(
    fs.readFileSync(path.join(root, '.planning', 'phases', '01-p1', 'PLAN.md'), 'utf8')
  ));
  ok('phase 2 untouched', !/base-commit:/.test(
    fs.readFileSync(path.join(root, '.planning', 'phases', '02-p2', 'PLAN.md'), 'utf8')
  ));
  ok('phase 3 backfilled', /base-commit:/.test(
    fs.readFileSync(path.join(root, '.planning', 'phases', '03-p3', 'PLAN.md'), 'utf8')
  ));
}

section('cp reconcile --all --dry-run does not write');
{
  const root = setupMultiPhaseRepo('dry', 2);
  const r = runCp(root, ['reconcile', '--all', '--infer-shas', '--dry-run']);
  ok('exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('mentions dry-run', /dry-run/.test(r.stdout), r.stdout);
  ok('phase 1 NOT modified', !/base-commit:/.test(
    fs.readFileSync(path.join(root, '.planning', 'phases', '01-p1', 'PLAN.md'), 'utf8')
  ));
}

section('cp reconcile --all --json emits structured output');
{
  const root = setupMultiPhaseRepo('json', 2);
  const r = runCp(root, ['reconcile', '--all', '--infer-shas', '--json', '--no-commit']);
  ok('exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch (_) { parsed = null; }
  ok('parses', parsed !== null, r.stdout.slice(0, 200));
  ok('bulk: true', parsed && parsed.bulk === true);
  ok('phasesScanned >= 2', parsed && parsed.phasesScanned >= 2);
  ok('applied >= 1', parsed && parsed.applied >= 1);
}

section('cp reconcile (conflicts: --all + positional)');
{
  const root = setupMultiPhaseRepo('conflict', 2);
  const r = runCp(root, ['reconcile', '1', '--all', '--infer-shas']);
  ok('exit 2', r.status === 2, `status=${r.status}`);
  ok('stderr mentions conflict', /conflicts/.test(r.stderr), r.stderr);
}

section('cp reconcile (rejects bad --phase spec)');
{
  const root = setupMultiPhaseRepo('badspec', 2);
  const r = runCp(root, ['reconcile', '--phase', 'abc', '--infer-shas']);
  ok('exit 2', r.status === 2, `status=${r.status}`);
  ok('stderr mentions parse error', /parse error/.test(r.stderr), r.stderr);
}

// ----------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
