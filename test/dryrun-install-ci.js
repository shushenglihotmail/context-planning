#!/usr/bin/env node
/**
 * Dry-run / integration test for `cp install --ci` (Phase 29 P9 CI gate).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const CP = path.join(PLUGIN_ROOT, 'bin', 'cp.js');
const NODE = process.execPath;
const DEST_REL = path.join('.github', 'workflows', 'cp-audit.yml');

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

function freshProject(suffix) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), `cp-ci-${suffix}-`))
  );
  // cp init style — need .planning to exist so repoRoot() resolves.
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# x\n');
  return root;
}

// ----------------------------------------------------------------------
section('cp install --ci (fresh project)');
{
  const root = freshProject('fresh');
  const r = runCp(root, ['install', '--ci']);
  ok('exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('stdout mentions installed', /installed/.test(r.stdout), r.stdout);
  const dest = path.join(root, DEST_REL);
  ok('workflow file exists', fs.existsSync(dest));
  const content = fs.readFileSync(dest, 'utf8');
  ok('contains sentinel', content.includes('# cp:ci v1'));
  ok('contains audit step', /cp audit/.test(content));
  ok('contains setup-node', /setup-node/.test(content));
}

section('cp install --ci (idempotent on cp-owned file)');
{
  const root = freshProject('idem');
  runCp(root, ['install', '--ci']);
  const r = runCp(root, ['install', '--ci']);
  ok('exit 0', r.status === 0);
  ok('stdout mentions installed', /installed/.test(r.stdout));
}

section('cp install --ci (refuses user-owned workflow)');
{
  const root = freshProject('refuse');
  const dest = path.join(root, DEST_REL);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, 'name: my own workflow\non: push\njobs: {}\n');
  const r = runCp(root, ['install', '--ci']);
  ok('exit code 3', r.status === 3, `status=${r.status}`);
  ok('stdout mentions skipped', /skipped/.test(r.stdout), r.stdout);
  ok('user content preserved', fs.readFileSync(dest, 'utf8').includes('my own workflow'));
}

section('cp install --ci --force overrides user-owned');
{
  const root = freshProject('force');
  const dest = path.join(root, DEST_REL);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, 'name: mine\n');
  const r = runCp(root, ['install', '--ci', '--force']);
  ok('exit 0', r.status === 0, `status=${r.status} stderr=${r.stderr}`);
  ok('file now owned by cp', fs.readFileSync(dest, 'utf8').includes('# cp:ci v1'));
}

// ----------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
