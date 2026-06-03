'use strict';

/**
 * Phase 116 unit tests for lib/verify.
 *
 * detectTestCommand priority: npm > pytest > cargo > go > null
 * loadConfiguredCommand: reads .planning/config.json:cp.behavior.test_command
 * resolveCommand: override > config > auto-detect > none
 * runVerify: --skip path, success path, failure path, no-command warn path
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const verify = require('../lib/verify');

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

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'cp-verify-'));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

console.log('\nunit-verify:');

// ── detectTestCommand ───────────────────────────────────────────────────

check('detect: npm test wins when package.json has scripts.test', () => {
  const d = tmpdir();
  writeJson(path.join(d, 'package.json'), { name: 'x', scripts: { test: 'echo ok' } });
  // Even with Cargo.toml present, npm should win:
  fs.writeFileSync(path.join(d, 'Cargo.toml'), '[package]\nname="x"\n', 'utf8');
  assert.strictEqual(verify.detectTestCommand(d), 'npm test');
});

check('detect: package.json without scripts.test → fall through', () => {
  const d = tmpdir();
  writeJson(path.join(d, 'package.json'), { name: 'x' });
  fs.writeFileSync(path.join(d, 'Cargo.toml'), '[package]\nname="x"\n', 'utf8');
  assert.strictEqual(verify.detectTestCommand(d), 'cargo test');
});

check('detect: package.json with empty scripts.test → fall through', () => {
  const d = tmpdir();
  writeJson(path.join(d, 'package.json'), { name: 'x', scripts: { test: '   ' } });
  fs.writeFileSync(path.join(d, 'go.mod'), 'module x\n', 'utf8');
  assert.strictEqual(verify.detectTestCommand(d), 'go test ./...');
});

check('detect: pytest.ini → pytest', () => {
  const d = tmpdir();
  fs.writeFileSync(path.join(d, 'pytest.ini'), '[pytest]\n', 'utf8');
  assert.strictEqual(verify.detectTestCommand(d), 'pytest');
});

check('detect: pyproject.toml with [tool.pytest] → pytest', () => {
  const d = tmpdir();
  fs.writeFileSync(path.join(d, 'pyproject.toml'), '[tool.pytest.ini_options]\n', 'utf8');
  assert.strictEqual(verify.detectTestCommand(d), 'pytest');
});

check('detect: setup.cfg with [tool:pytest] → pytest', () => {
  const d = tmpdir();
  fs.writeFileSync(path.join(d, 'setup.cfg'), '[tool:pytest]\n', 'utf8');
  assert.strictEqual(verify.detectTestCommand(d), 'pytest');
});

check('detect: Cargo.toml → cargo test', () => {
  const d = tmpdir();
  fs.writeFileSync(path.join(d, 'Cargo.toml'), '[package]\nname="x"\n', 'utf8');
  assert.strictEqual(verify.detectTestCommand(d), 'cargo test');
});

check('detect: go.mod → go test ./...', () => {
  const d = tmpdir();
  fs.writeFileSync(path.join(d, 'go.mod'), 'module x\n', 'utf8');
  assert.strictEqual(verify.detectTestCommand(d), 'go test ./...');
});

check('detect: empty dir → null', () => {
  const d = tmpdir();
  assert.strictEqual(verify.detectTestCommand(d), null);
});

// ── loadConfiguredCommand ───────────────────────────────────────────────

check('config: reads cp.behavior.test_command', () => {
  const d = tmpdir();
  writeJson(path.join(d, '.planning', 'config.json'), {
    cp: { behavior: { test_command: 'jest --silent' } },
  });
  assert.strictEqual(verify.loadConfiguredCommand(d), 'jest --silent');
});

check('config: missing file → null', () => {
  const d = tmpdir();
  assert.strictEqual(verify.loadConfiguredCommand(d), null);
});

check('config: missing field → null', () => {
  const d = tmpdir();
  writeJson(path.join(d, '.planning', 'config.json'), { cp: { behavior: {} } });
  assert.strictEqual(verify.loadConfiguredCommand(d), null);
});

check('config: empty-string field → null', () => {
  const d = tmpdir();
  writeJson(path.join(d, '.planning', 'config.json'), {
    cp: { behavior: { test_command: '   ' } },
  });
  assert.strictEqual(verify.loadConfiguredCommand(d), null);
});

// ── resolveCommand priority ─────────────────────────────────────────────

check('resolve: override beats config beats auto-detect', () => {
  const d = tmpdir();
  writeJson(path.join(d, 'package.json'), { scripts: { test: 'npm-runs' } });
  writeJson(path.join(d, '.planning', 'config.json'), {
    cp: { behavior: { test_command: 'config-runs' } },
  });
  const r1 = verify.resolveCommand(d, { override: 'override-runs' });
  assert.strictEqual(r1.command, 'override-runs');
  assert.strictEqual(r1.source, 'override');
  const r2 = verify.resolveCommand(d, {});
  assert.strictEqual(r2.command, 'config-runs');
  assert.strictEqual(r2.source, 'config');
});

check('resolve: config absent → auto-detect', () => {
  const d = tmpdir();
  writeJson(path.join(d, 'package.json'), { scripts: { test: 'echo ok' } });
  const r = verify.resolveCommand(d, {});
  assert.strictEqual(r.command, 'npm test');
  assert.strictEqual(r.source, 'auto-detect');
});

check('resolve: nothing → source=none, command=null', () => {
  const d = tmpdir();
  const r = verify.resolveCommand(d, {});
  assert.strictEqual(r.command, null);
  assert.strictEqual(r.source, 'none');
});

// ── runVerify ───────────────────────────────────────────────────────────

check('runVerify: --skip short-circuits to ok exit 0', () => {
  const r = verify.runVerify('test-run', { skip: true, projectDir: tmpdir() });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.source, 'skip');
});

check('runVerify: no command → warn + ok exit 0 + warning present', () => {
  const d = tmpdir();
  const r = verify.runVerify('test-run', { projectDir: d, silent: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.source, 'none');
  assert.ok(/no test command/i.test(r.warning));
});

check('runVerify: explicit command success → exitCode 0', () => {
  const d = tmpdir();
  const r = verify.runVerify('test-run', {
    projectDir: d,
    override: `node -e "process.exit(0)"`,
    captureOutput: true,
    silent: true,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.source, 'override');
  assert.strictEqual(r.command, `node -e "process.exit(0)"`);
});

check('runVerify: failing command → exitCode propagated, ok=false', () => {
  const d = tmpdir();
  const r = verify.runVerify('test-run', {
    projectDir: d,
    override: `node -e "process.exit(7)"`,
    captureOutput: true,
    silent: true,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.exitCode, 7);
});

check('runVerify: result includes slug', () => {
  const r = verify.runVerify('my-slug-123', { skip: true });
  assert.strictEqual(r.slug, 'my-slug-123');
});

console.log(`\nunit-verify: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
