'use strict';

/**
 * Unit tests for install/common.js drift-defense helpers.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  buildDriftDefenseBlock,
  stripDriftBlock,
  DRIFT_BLOCK_BEGIN,
  DRIFT_BLOCK_END,
} = require('../install/common');

const pluginRoot = path.resolve(__dirname, '..');

let passed = 0;
function t(name, fn) {
  fn();
  console.log('  ✓', name);
  passed++;
}

console.log('unit-drift-block');

t('templates/agent-instructions.md exists', () => {
  const p = path.join(pluginRoot, 'templates', 'agent-instructions.md');
  assert.ok(fs.existsSync(p), `expected ${p} to exist`);
});

t('buildDriftDefenseBlock returns sentinels', () => {
  const out = buildDriftDefenseBlock(pluginRoot);
  assert.ok(out.startsWith(DRIFT_BLOCK_BEGIN + '\n'));
  assert.ok(out.endsWith(DRIFT_BLOCK_END + '\n'));
});

t('buildDriftDefenseBlock includes core verbs', () => {
  const out = buildDriftDefenseBlock(pluginRoot);
  for (const verb of ['cp audit', 'cp audit --fix', 'cp reconcile', 'cp supersede', 'cp deviate', 'cp install --hooks', 'cp install --ci']) {
    assert.ok(out.includes(verb), `expected drift block to mention '${verb}'`);
  }
});

t('buildDriftDefenseBlock includes finding-id table', () => {
  const out = buildDriftDefenseBlock(pluginRoot);
  for (const id of ['state-stale', 'summary-without-tick', 'missing-base-commit', 'missing-end-commit', 'ticked-without-summary', 'expected-vs-actual-drift']) {
    assert.ok(out.includes(id), `expected finding id '${id}' in drift block`);
  }
});

t('buildDriftDefenseBlock is deterministic', () => {
  const a = buildDriftDefenseBlock(pluginRoot);
  const b = buildDriftDefenseBlock(pluginRoot);
  assert.equal(a, b);
});

t('buildDriftDefenseBlock throws when template missing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-drift-'));
  assert.throws(() => buildDriftDefenseBlock(tmp), /missing/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

t('stripDriftBlock removes a block cleanly', () => {
  const block = buildDriftDefenseBlock(pluginRoot);
  const before = '# CLAUDE.md\n\nSome user stuff.\n\n';
  const after = '\n\nMore stuff after.\n';
  const merged = before + block + after;
  const stripped = stripDriftBlock(merged);
  assert.equal(stripped, before + '\n\nMore stuff after.\n');
});

t('stripDriftBlock is a no-op when no block present', () => {
  const text = '# CLAUDE.md\n\nNo cp drift block here.\n';
  assert.equal(stripDriftBlock(text), text);
});

t('stripDriftBlock removes multiple blocks (defensive)', () => {
  const block = buildDriftDefenseBlock(pluginRoot);
  const merged = block + 'middle\n' + block;
  const stripped = stripDriftBlock(merged);
  assert.equal(stripped, 'middle\n');
});

t('stripDriftBlock handles empty input', () => {
  assert.equal(stripDriftBlock(''), '');
  assert.equal(stripDriftBlock(null), null);
});

t('round-trip strip+append is idempotent', () => {
  const block = buildDriftDefenseBlock(pluginRoot);
  const base = '# CLAUDE.md\n\nUser content.\n';
  const once = base + '\n' + block;
  const twice = stripDriftBlock(once) + block;
  assert.equal(twice, base + '\n' + block);
});

console.log(`unit-drift-block: ${passed} passed`);
