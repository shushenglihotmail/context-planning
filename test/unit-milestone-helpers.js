'use strict';

/**
 * Tests for lib/milestone-helpers.js — setupCheck + finalize.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const helpers = require('../lib/milestone-helpers');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function mkdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-mh-')); }
function init(dir) {
  fs.mkdirSync(path.join(dir, '.planning'));
  fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), '# p\n');
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), '# r\n');
  fs.writeFileSync(path.join(dir, '.planning', 'STATE.md'), '# state\n\nbody\n');
}

// ---------- setupCheck ----------

section('setupCheck passes on a properly initialized project');
{
  const dir = mkdir(); init(dir);
  const r = helpers.setupCheck('v1-4-foo', { projectDir: dir });
  ok('ok=true', r.ok, r.error);
  ok('all checks pass', r.checks.every(c => c.ok));
}

section('setupCheck fails when PROJECT.md missing');
{
  const dir = mkdir(); init(dir);
  fs.unlinkSync(path.join(dir, '.planning', 'PROJECT.md'));
  const r = helpers.setupCheck('v1-4-foo', { projectDir: dir });
  ok('ok=false', !r.ok);
  ok('PROJECT.md check failed', r.checks.find(c => c.name.indexOf('PROJECT') !== -1).ok === false);
}

section('setupCheck fails when slug is malformed');
{
  const dir = mkdir(); init(dir);
  const r = helpers.setupCheck('Invalid Slug!', { projectDir: dir });
  ok('ok=false', !r.ok);
  ok('slug check failed', r.checks.find(c => c.name.indexOf('slug') !== -1).ok === false);
}

section('setupCheck fails when slug is missing');
{
  const dir = mkdir(); init(dir);
  const r = helpers.setupCheck('', { projectDir: dir });
  ok('ok=false', !r.ok);
}

// ---------- finalize ----------

section('finalize injects current-focus block when none exists');
{
  const dir = mkdir(); init(dir);
  const r = helpers.finalize('v1-4-foo', { projectDir: dir, milestoneName: 'v1.4 Foo' });
  ok('ok=true', r.ok);
  const txt = fs.readFileSync(path.join(dir, '.planning', 'STATE.md'), 'utf8');
  ok('marker present', txt.indexOf('<!-- cp:current-focus -->') !== -1);
  ok('milestone name present', txt.indexOf('v1.4 Foo') !== -1);
  ok('slug present', txt.indexOf('v1-4-foo') !== -1);
}

section('finalize is idempotent — replaces existing block');
{
  const dir = mkdir(); init(dir);
  helpers.finalize('v1-4-foo', { projectDir: dir, milestoneName: 'v1.4 Foo' });
  helpers.finalize('v1-4-foo', { projectDir: dir, milestoneName: 'v1.4 Foo' });
  const txt = fs.readFileSync(path.join(dir, '.planning', 'STATE.md'), 'utf8');
  // Marker should appear exactly twice (open + close), not 4 times.
  const matches = txt.match(/<!-- cp:current-focus -->/g);
  ok('marker pair appears once', matches && matches.length === 2);
}

section('finalize rejects malformed slug');
{
  const dir = mkdir(); init(dir);
  const r = helpers.finalize('bad slug', { projectDir: dir });
  ok('ok=false', !r.ok);
}

section('finalize fails cleanly when STATE.md missing');
{
  const dir = mkdir();
  fs.mkdirSync(path.join(dir, '.planning'));
  const r = helpers.finalize('v1-4-foo', { projectDir: dir });
  ok('ok=false', !r.ok);
  ok('error mentions STATE', r.error && r.error.indexOf('STATE') !== -1);
}

// ---------- summary ----------

console.log(`\n${failed === 0 ? 'All' : ''} milestone-helpers checks ${failed === 0 ? 'passed' : 'failed'}. (${passed} passed, ${failed} failed)`);
process.exit(failed === 0 ? 0 : 1);
