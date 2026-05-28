'use strict';

/**
 * Tests for lib/project-update.js — declarative PROJECT.md mutations.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const pu = require('../lib/project-update');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-pu-'));
  fs.mkdirSync(path.join(dir, '.planning'));
  const sample = [
    '# proj', '', '## Requirements', '',
    '### Validated',
    '- ✓ Item A — v1.0',
    '- ✓ Item B — v1.1',
    '',
    '### Active',
    '- **New feature X**: foo bar baz — v1.2',
    '- **Migration task Y**: details — v1.2',
    '',
    '### Out of Scope',
    '- nothing',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), sample);
  return dir;
}

// ---------- validation ----------

section('validateUpdate accepts well-formed input');
{
  const v = pu.validateUpdate({version: 1, ops: [{op: 'add-active', text: 'Z'}]});
  ok('ok=true', v.ok);
  ok('no errors', v.errors.length === 0);
}

section('validateUpdate rejects unknown op');
{
  const v = pu.validateUpdate({version: 1, ops: [{op: 'nope'}]});
  ok('ok=false', !v.ok);
  ok('error mentions op', v.errors.some(e => e.indexOf('not in') !== -1));
}

section('validateUpdate rejects wrong version');
{
  const v = pu.validateUpdate({version: 2, ops: []});
  ok('ok=false', !v.ok);
}

section('validateUpdate rejects missing match on mark-validated');
{
  const v = pu.validateUpdate({version: 1, ops: [{op: 'mark-validated'}]});
  ok('ok=false', !v.ok);
}

// ---------- apply: mark-validated ----------

section('mark-validated moves matched bullet from Active to Validated');
{
  const dir = mkProject();
  const r = pu.applyUpdates(dir, {
    version: 1,
    ops: [{op: 'mark-validated', match: 'New feature X', version: 'v1.3'}],
  });
  ok('applied=1', r.applied.length === 1);
  const txt = fs.readFileSync(path.join(dir, '.planning', 'PROJECT.md'), 'utf8');
  ok('Active no longer has X', !/### Active[\s\S]*New feature X/.test(txt));
  ok('Validated has X with v1.3', /### Validated[\s\S]*New feature X[\s\S]*v1\.3/.test(txt));
}

section('mark-validated is idempotent for non-matches');
{
  const dir = mkProject();
  const r = pu.applyUpdates(dir, {
    version: 1,
    ops: [{op: 'mark-validated', match: 'NONEXISTENT', version: 'v1.3'}],
  });
  ok('applied=0', r.applied.length === 0);
  ok('skipped=1', r.skipped.length === 1);
}

// ---------- apply: add-active ----------

section('add-active appends a new bullet to Active');
{
  const dir = mkProject();
  const r = pu.applyUpdates(dir, {
    version: 1,
    ops: [{op: 'add-active', text: 'Brand new initiative', version: 'v1.5'}],
  });
  ok('applied=1', r.applied.length === 1);
  const txt = fs.readFileSync(path.join(dir, '.planning', 'PROJECT.md'), 'utf8');
  ok('Active mentions new bullet', /### Active[\s\S]*Brand new initiative[\s\S]*v1\.5/.test(txt));
}

section('add-active is idempotent when text already present');
{
  const dir = mkProject();
  pu.applyUpdates(dir, {version: 1, ops: [{op: 'add-active', text: 'Once', version: 'v2'}]});
  const r2 = pu.applyUpdates(dir, {version: 1, ops: [{op: 'add-active', text: 'Once', version: 'v2'}]});
  ok('second apply skipped', r2.skipped.length === 1);
}

// ---------- apply: add-validated ----------

section('add-validated appends a new bullet to Validated');
{
  const dir = mkProject();
  const r = pu.applyUpdates(dir, {
    version: 1,
    ops: [{op: 'add-validated', text: 'Already done thing', version: 'v0.9'}],
  });
  ok('applied=1', r.applied.length === 1);
  const txt = fs.readFileSync(path.join(dir, '.planning', 'PROJECT.md'), 'utf8');
  ok('Validated bullet present', txt.indexOf('- ✓ Already done thing — v0.9') !== -1);
}

// ---------- apply: remove-active ----------

section('remove-active removes a matched bullet');
{
  const dir = mkProject();
  const r = pu.applyUpdates(dir, {
    version: 1,
    ops: [{op: 'remove-active', match: 'Migration task Y'}],
  });
  ok('applied=1', r.applied.length === 1);
  const txt = fs.readFileSync(path.join(dir, '.planning', 'PROJECT.md'), 'utf8');
  ok('bullet gone', txt.indexOf('Migration task Y') === -1);
}

// ---------- applyUpdates rejects invalid input ----------

section('applyUpdates rejects invalid input with helpful error');
{
  const dir = mkProject();
  let msg = null;
  try { pu.applyUpdates(dir, {version: 9, ops: []}); }
  catch (e) { msg = e.message; }
  ok('threw', msg !== null);
  ok('mentions version', msg && msg.indexOf('version') !== -1);
}

// ---------- summary ----------

console.log(`\n${failed === 0 ? 'All' : ''} project-update checks ${failed === 0 ? 'passed' : 'failed'}. (${passed} passed, ${failed} failed)`);
process.exit(failed === 0 ? 0 : 1);
