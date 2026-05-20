'use strict';

/**
 * Tests for lib/codebase-mapper.js — the cp-native map-codebase state layer.
 *
 * Verifies:
 *   - scaffoldCodebase creates the dir and 7 stub files from templates
 *   - scaffoldCodebase refuses to overwrite existing files by default
 *   - scaffoldCodebase --force overwrites
 *   - scaffoldCodebase --dry-run touches nothing on disk
 *   - all 7 expected GSD-compatible docs are listed in FOCUS_AREAS
 *   - codebaseStatus reports missing dir cleanly
 *   - codebaseStatus marks freshly-scaffolded files as stubs
 *   - codebaseStatus marks filled-in files as non-stub
 *   - templates render the DATE placeholder
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const codebase = require('../lib/codebase-mapper');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function fresh(suffix = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-codebase-${suffix}-`));
  try { execSync('git init -q -b main', { cwd: dir }); } catch {}
  try {
    execSync('git config user.email t@l', { cwd: dir });
    execSync('git config user.name t', { cwd: dir });
  } catch {}
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  return dir;
}

// ---------- FOCUS_AREAS shape ----------

section('FOCUS_AREAS shape (matches GSD map-codebase 4-agent split)');
ok('4 focus areas exposed', codebase.FOCUS_AREAS.length === 4);
ok('focus names are tech/arch/quality/concerns',
  codebase.FOCUS_AREAS.map((f) => f.focus).join(',') === 'tech,arch,quality,concerns');
const totalDocs = codebase.FOCUS_AREAS.reduce((sum, f) => sum + f.docs.length, 0);
ok('7 docs total across focus areas', totalDocs === 7);
ok('DOCS has 7 entries', codebase.DOCS.length === 7);
const expectedFiles = ['STACK.md', 'INTEGRATIONS.md', 'ARCHITECTURE.md', 'STRUCTURE.md',
  'CONVENTIONS.md', 'TESTING.md', 'CONCERNS.md'];
const actualFiles = codebase.DOCS.map((d) => d.file).sort();
ok('DOCS filenames match GSD layout', actualFiles.join(',') === expectedFiles.slice().sort().join(','));

// ---------- scaffoldCodebase happy path ----------

section('scaffoldCodebase happy path');
{
  const root = fresh('happy');
  const r = codebase.scaffoldCodebase(root, { today: '2099-01-15' });
  ok('ok=true', r.ok);
  ok('7 files created', r.created.length === 7);
  ok('codebaseDir exists', fs.existsSync(r.codebaseDir));
  for (const f of expectedFiles) {
    const p = path.join(r.codebaseDir, f);
    ok(`${f} written`, fs.existsSync(p));
  }
  const stackContent = fs.readFileSync(path.join(r.codebaseDir, 'STACK.md'), 'utf8');
  ok('DATE placeholder rendered', stackContent.includes('Generated: 2099-01-15'));
  ok('STACK.md has expected H1', /^# Tech Stack/m.test(stackContent));
  const concernsContent = fs.readFileSync(path.join(r.codebaseDir, 'CONCERNS.md'), 'utf8');
  ok('CONCERNS.md has expected H1', /^# Known Concerns/m.test(concernsContent));
}

// ---------- refuse to overwrite ----------

section('scaffoldCodebase refuses to overwrite without --force');
{
  const root = fresh('overwrite');
  codebase.scaffoldCodebase(root);
  // Modify STACK.md
  const stackPath = path.join(root, '.planning', 'codebase', 'STACK.md');
  fs.writeFileSync(stackPath, '# customised\n');
  const r = codebase.scaffoldCodebase(root);
  ok('second run still ok=true', r.ok);
  ok('0 files created on re-run', r.created.length === 0);
  ok('7 files skipped', r.skipped.length === 7);
  ok('STACK.md preserved', fs.readFileSync(stackPath, 'utf8') === '# customised\n');
}

// ---------- --force overwrites ----------

section('scaffoldCodebase --force overwrites');
{
  const root = fresh('force');
  codebase.scaffoldCodebase(root);
  const stackPath = path.join(root, '.planning', 'codebase', 'STACK.md');
  fs.writeFileSync(stackPath, '# customised\n');
  const r = codebase.scaffoldCodebase(root, { force: true });
  ok('7 files re-created with --force', r.created.length === 7);
  ok('STACK.md overwritten back to template', /^# Tech Stack/m.test(fs.readFileSync(stackPath, 'utf8')));
}

// ---------- --dry-run ----------

section('scaffoldCodebase --dry-run touches nothing');
{
  const root = fresh('dry');
  const r = codebase.scaffoldCodebase(root, { dryRun: true });
  ok('ok=true on dry-run', r.ok);
  ok('dryRun flag echoed', r.dryRun === true);
  ok('7 files in plan', r.created.length === 7);
  ok('codebase dir NOT created', !fs.existsSync(r.codebaseDir));
}

// ---------- errors on missing .planning ----------

section('scaffoldCodebase errors on missing .planning/');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-codebase-noplan-'));
  let threw = false;
  try { codebase.scaffoldCodebase(root); }
  catch (e) { threw = /\.planning\/ not found/.test(e.message); }
  ok('throws with clear message', threw);
}

// ---------- codebaseStatus: missing dir ----------

section('codebaseStatus with no codebase/ dir');
{
  const root = fresh('status-missing');
  const r = codebase.codebaseStatus(root);
  ok('dirExists=false', r.dirExists === false);
  ok('all rows missing', r.rows.every((row) => !row.exists));
  ok('allExist=false', r.allExist === false);
}

// ---------- codebaseStatus: stub detection ----------

section('codebaseStatus marks freshly-scaffolded files as stubs');
{
  const root = fresh('status-stub');
  codebase.scaffoldCodebase(root);
  const r = codebase.codebaseStatus(root);
  ok('dirExists=true', r.dirExists);
  ok('allExist=true', r.allExist);
  ok('allFilled=false (all are stubs)', r.allFilled === false);
  ok('every row looksStub=true', r.rows.every((row) => row.looksStub === true));
  ok('every row has lines > 0', r.rows.every((row) => row.lines > 0));
}

// ---------- codebaseStatus: filled detection ----------

section('codebaseStatus marks long, marker-free file as filled');
{
  const root = fresh('status-filled');
  codebase.scaffoldCodebase(root);
  const stackPath = path.join(root, '.planning', 'codebase', 'STACK.md');
  // 50 lines, no "fill via" marker
  const big = ['# Tech Stack', '', 'Real content.', ''].concat(
    Array.from({ length: 50 }, (_, i) => `- entry ${i + 1}`)).join('\n');
  fs.writeFileSync(stackPath, big);
  const r = codebase.codebaseStatus(root);
  const stackRow = r.rows.find((row) => row.file === 'STACK.md');
  ok('STACK.md no longer looks like a stub', stackRow.looksStub === false);
  ok('allFilled still false (others are stubs)', r.allFilled === false);
}

if (failed > 0) process.exit(1);
console.log(`\nAll codebase-mapper checks passed. (${passed})`);
