'use strict';

/**
 * Unit tests for lib/persist.js — DESIGN.md folding + persist alias normalization.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { foldIntoDesign, mergePersistAlias } = require('../lib/persist');

let passed = 0;
let failed = 0;
const failures = [];
const tracked = [];

function check(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
    passed++;
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err && err.message ? err.message : String(err)}`);
    console.log('  ✗', name);
  }
}

function sandbox(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-persist-${prefix}-`));
  tracked.push(dir);
  return dir;
}

function designFile(prefix, content) {
  const dir = sandbox(prefix);
  const file = path.join(dir, 'DESIGN.md');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function sectionCount(content, phaseId) {
  const escaped = phaseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (content.match(new RegExp(`^## ${escaped}(?=$|[ :])`, 'gm')) || []).length;
}

console.log('unit-persist');

check('foldIntoDesign throws if DESIGN.md is missing', () => {
  const file = path.join(sandbox('missing'), 'DESIGN.md');
  assert.throws(
    () => foldIntoDesign(file, 'brainstorm', 'Body'),
    /DESIGN\.md not found/,
  );
});

check('foldIntoDesign appends a new section when no matching section exists', () => {
  const file = designFile('append', '# Design\n\n## Status\n\nDraft\n');
  foldIntoDesign(file, 'brainstorm', 'Brainstorm notes');
  assert.match(read(file), /## brainstorm\n\nBrainstorm notes\n$/);
});

check('foldIntoDesign replaces an existing section in place', () => {
  const file = designFile('replace', '# Design\n\n## brainstorm\n\nOld notes\n');
  foldIntoDesign(file, 'brainstorm', 'New notes');
  const content = read(file);
  assert.ok(content.includes('New notes'));
  assert.ok(!content.includes('Old notes'));
});

check('foldIntoDesign replacement preserves neighboring content', () => {
  const file = designFile('neighbors', '# Design\n\n## before\n\nKeep before\n\n## brainstorm\n\nOld\n\n## after\n\nKeep after\n');
  foldIntoDesign(file, 'brainstorm', 'New');
  const content = read(file);
  assert.ok(content.includes('## before\n\nKeep before'));
  assert.ok(content.includes('## after\n\nKeep after'));
});

check('foldIntoDesign title option produces colon heading form', () => {
  const file = designFile('title', '# Design\n');
  foldIntoDesign(file, '49-04', 'Body', { title: 'Persist primitives' });
  assert.match(read(file), /^## 49-04: Persist primitives$/m);
});

check('foldIntoDesign without title produces plain phase heading', () => {
  const file = designFile('no-title', '# Design\n');
  foldIntoDesign(file, '49-04', 'Body');
  assert.match(read(file), /^## 49-04$/m);
});

check('foldIntoDesign timestamp option emits italic persisted line', () => {
  const file = designFile('timestamp', '# Design\n');
  foldIntoDesign(file, '49-04', 'Body', { timestamp: '2026-05-25T10:00:00Z' });
  assert.ok(read(file).includes('_persisted: 2026-05-25T10:00:00Z_'));
});

check('foldIntoDesign without timestamp omits persisted line', () => {
  const file = designFile('no-timestamp', '# Design\n');
  foldIntoDesign(file, '49-04', 'Body');
  assert.ok(!read(file).includes('_persisted:'));
});

check('foldIntoDesign writes exactly one trailing newline', () => {
  const file = designFile('newline', '# Design\n');
  foldIntoDesign(file, 'brainstorm', 'Body\n\n');
  const content = read(file);
  assert.ok(content.endsWith('\n'));
  assert.ok(!content.endsWith('\n\n'));
});

check('foldIntoDesign is idempotent for successive calls with same phaseId', () => {
  const file = designFile('idempotent', '# Design\n');
  foldIntoDesign(file, 'brainstorm', 'First');
  foldIntoDesign(file, 'brainstorm', 'Second');
  const content = read(file);
  assert.strictEqual(sectionCount(content, 'brainstorm'), 1);
  assert.ok(!content.includes('First'));
  assert.ok(content.includes('Second'));
});

check('foldIntoDesign preserves an immediate next section boundary', () => {
  const file = designFile('boundary', '# Design\n\n## brainstorm\nOld\n## next-section\nKeep\n');
  foldIntoDesign(file, 'brainstorm', 'New');
  assert.ok(read(file).includes('## next-section\nKeep'));
});

check('foldIntoDesign matches hyphenated phaseId exactly, without prefix false positives', () => {
  const file = designFile('hyphen', '# Design\n\n## 49-0\nShort phase\n');
  foldIntoDesign(file, '49-04', 'Exact phase');
  const content = read(file);
  assert.strictEqual(sectionCount(content, '49-04'), 1);
  assert.ok(content.includes('## 49-0\nShort phase'));
});

check('mergePersistAlias keeps persist true and drops persist_output', () => {
  assert.deepStrictEqual(mergePersistAlias({ persist: true }), { persist: true });
});

check('mergePersistAlias keeps persist false', () => {
  assert.deepStrictEqual(mergePersistAlias({ persist: false }), { persist: false });
});

check('mergePersistAlias maps persist_output true to persist true', () => {
  const output = mergePersistAlias({ persist_output: true });
  assert.deepStrictEqual(output, { persist: true });
  assert.ok(!Object.prototype.hasOwnProperty.call(output, 'persist_output'));
});

check('mergePersistAlias maps persist_output false to persist false', () => {
  const output = mergePersistAlias({ persist_output: false });
  assert.deepStrictEqual(output, { persist: false });
});

check('mergePersistAlias lets persist win over persist_output', () => {
  assert.deepStrictEqual(mergePersistAlias({ persist: true, persist_output: false }), { persist: true });
});

check('mergePersistAlias leaves persist undefined when both fields are absent', () => {
  assert.deepStrictEqual(mergePersistAlias({}), {});
});

check('mergePersistAlias passes through other fields verbatim', () => {
  const input = { id: '49-04', parent: '49', after: ['49-03'], max_children: 3, persist_output: true };
  assert.deepStrictEqual(mergePersistAlias(input), {
    id: '49-04',
    parent: '49',
    after: ['49-03'],
    max_children: 3,
    persist: true,
  });
});

check('mergePersistAlias does not mutate input and returns a new object', () => {
  const input = { persist_output: true };
  const output = mergePersistAlias(input);
  assert.notStrictEqual(output, input);
  assert.deepStrictEqual(input, { persist_output: true });
});

for (const dir of tracked) fs.rmSync(dir, { recursive: true, force: true });

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exitCode = 1;
}
