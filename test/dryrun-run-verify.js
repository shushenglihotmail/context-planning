'use strict';

/**
 * Phase 116 dry-run for `cp run-verify` CLI.
 *
 * Spawns `node bin/cp.js run-verify ...` and verifies exit-code propagation,
 * --skip path, --json output shape.
 */

const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CP_JS = path.resolve(__dirname, '..', 'bin', 'cp.js');

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

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-drv-'));
}

function runCp(args, opts) {
  const o = opts || {};
  // Use Node with the absolute bin path. cwd is the test tmpdir so cp's
  // own package.json doesn't fool detect.
  return child_process.spawnSync(process.execPath, [CP_JS, ...args], {
    cwd: o.cwd || process.cwd(),
    encoding: 'utf8',
    timeout: 30000,
  });
}

console.log('\ndryrun-run-verify:');

check('--skip exits 0 with summary line', () => {
  const d = tmpdir();
  const r = runCp(['run-verify', 'my-slug', '--skip', '--cwd', d]);
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  assert.ok(/skipped/i.test(r.stdout), `expected 'skipped' in:\n${r.stdout}`);
});

check('--command success exits 0', () => {
  const d = tmpdir();
  const r = runCp([
    'run-verify',
    'my-slug',
    '--command',
    `node -e "process.exit(0)"`,
    '--cwd',
    d,
  ]);
  assert.strictEqual(r.status, 0, `expected 0, got ${r.status}; stderr: ${r.stderr}`);
  assert.ok(/tests passed/i.test(r.stdout), `expected pass summary:\n${r.stdout}`);
});

check('--command failure propagates exit code', () => {
  const d = tmpdir();
  const r = runCp([
    'run-verify',
    'my-slug',
    '--command',
    `node -e "process.exit(7)"`,
    '--cwd',
    d,
  ]);
  assert.strictEqual(r.status, 7, `expected 7, got ${r.status}`);
  assert.ok(/FAILED/.test(r.stderr) || /failed/i.test(r.stderr), `expected FAILED summary in stderr:\n${r.stderr}`);
});

check('--json emits parseable result with command, exitCode, source', () => {
  const d = tmpdir();
  const r = runCp([
    'run-verify',
    'my-slug',
    '--command',
    `node -e "process.exit(0)"`,
    '--cwd',
    d,
    '--json',
  ]);
  assert.strictEqual(r.status, 0);
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    throw new Error(`stdout not JSON:\n${r.stdout}\n--- error: ${e.message}`);
  }
  assert.strictEqual(parsed.exitCode, 0);
  assert.strictEqual(parsed.source, 'override');
  assert.strictEqual(parsed.slug, 'my-slug');
  assert.ok(parsed.command && parsed.command.indexOf('process.exit(0)') >= 0);
});

check('missing slug → exit 2 with usage', () => {
  const r = runCp(['run-verify']);
  assert.strictEqual(r.status, 2);
  assert.ok(/usage/i.test(r.stderr) || /usage/i.test(r.stdout));
});

check('no command in empty dir → warns to stderr, exits 0', () => {
  const d = tmpdir();
  const r = runCp(['run-verify', 'my-slug', '--cwd', d]);
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  assert.ok(/no test command/i.test(r.stderr), `expected warn in stderr:\n${r.stderr}`);
});

console.log(`\ndryrun-run-verify: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
