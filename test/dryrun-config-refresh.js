#!/usr/bin/env node
/**
 * Dry-run tests for `cp config refresh` — the v0.5 explicit merge command.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const BIN = path.join(REPO, 'bin', 'cp.js');

// ---------- tiny test runner ----------
let passed = 0;
let failed = 0;
const failures = [];
function ok(label, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ' :: ' + detail : ''}`);
    console.log(`  \u2717 ${label}${detail ? ' :: ' + detail : ''}`);
  }
}
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(label + ` (=${e})`, a === e, `got ${a}`);
}
function section(name) { console.log(`\n=== ${name} ===`); }
function mktmp(n) { return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-refresh-' + n + '-')); }
function writeFile(p, c) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c || ''); }
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

const created = [];
function track(d) { created.push(d); return d; }

function runConfig(cwd, extraArgs = []) {
  const args = ['config', ...extraArgs];
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: (err.stdout || '') + (err.stderr || ''), exitCode: err.status || 1 };
  }
}

function buildV04Fixture(rootDir) {
  fs.mkdirSync(path.join(rootDir, '.git'), { recursive: true });
  const planDir = path.join(rootDir, '.planning');
  fs.mkdirSync(planDir, { recursive: true });

  // v0.4-style config: version 1, no harnesses, no echo-provider
  const cfg = {
    cp: {
      version: 1,
      workflow_provider: 'superpowers',
      providers: {
        superpowers: {
          detect: { any_of: ['.claude/plugins/superpowers'] },
          skills: { brainstorm: 'brainstorming', plan: 'writing-plans' }
        },
        manual: { detect: { always: true }, skills: { brainstorm: 'cp:manual/brainstorm' } }
      },
      behavior: { atomic_commits: true }
    }
  };
  fs.writeFileSync(path.join(planDir, 'config.json'), JSON.stringify(cfg, null, 2) + '\n');
  writeFile(path.join(planDir, 'PROJECT.md'), '# Test\n');
  writeFile(path.join(planDir, 'ROADMAP.md'), '# Roadmap\n\n## Phases\n');
  writeFile(path.join(planDir, 'STATE.md'), '# State\n');
}

try {

// ============================================================
section('cp config refresh --dry-run: reports planned changes');
{
  const root = track(mktmp('dryrun'));
  buildV04Fixture(root);
  const { stdout, exitCode } = runConfig(root, ['refresh', '--dry-run']);
  eq('exit code 0', exitCode, 0);
  ok('mentions would add', stdout.includes('would'));
  ok('mentions schema', stdout.includes('schema'));
  ok('mentions no changes written', stdout.includes('no changes written'));

  // Verify config NOT modified
  const after = JSON.parse(fs.readFileSync(path.join(root, '.planning', 'config.json'), 'utf8'));
  eq('version still 1', after.cp.version, 1);
  ok('no harnesses block', !after.cp.harnesses);
}

// ============================================================
section('cp config refresh: writes changes');
{
  const root = track(mktmp('write'));
  buildV04Fixture(root);
  const { stdout, exitCode } = runConfig(root, ['refresh']);
  eq('exit code 0', exitCode, 0);
  ok('mentions refreshed', stdout.includes('refreshed'));

  const after = JSON.parse(fs.readFileSync(path.join(root, '.planning', 'config.json'), 'utf8'));
  eq('version bumped to 2', after.cp.version, 2);
  ok('harnesses added', !!after.cp.harnesses && !!after.cp.harnesses.copilot);
  ok('echo-provider added', !!after.cp.providers['echo-provider']);
  ok('superpowers sentinels grew', after.cp.providers.superpowers.detect.any_of.length > 1);
}

// ============================================================
section('cp config refresh: second run is idempotent');
{
  const root = track(mktmp('idempotent'));
  buildV04Fixture(root);
  // First run
  runConfig(root, ['refresh']);
  const afterFirst = fs.readFileSync(path.join(root, '.planning', 'config.json'), 'utf8');

  // Second run
  const { stdout } = runConfig(root, ['refresh']);
  ok('reports up to date', stdout.includes('already up to date'));

  const afterSecond = fs.readFileSync(path.join(root, '.planning', 'config.json'), 'utf8');
  eq('config unchanged between runs', afterFirst, afterSecond);
}

// ============================================================
section('cp config refresh: no .planning/config.json -> exit 1');
{
  const root = track(mktmp('noconfig'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  const { exitCode, stdout } = runConfig(root, ['refresh']);
  eq('exit code 1', exitCode, 1);
  ok('error mentions init', stdout.includes('init'));
}

} finally {
  for (const d of created) rmrf(d);
}

// ---------- summary ----------
console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exitCode = 1;
} else {
  console.log('All config-refresh dry-run checks passed.');
}
