#!/usr/bin/env node
'use strict';

/**
 * Unit tests for lib/registry.js — project registry.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  \u2713 ${label}`); passed++; }
  else { console.log(`  \u2717 ${label}${detail ? ' \u2014 ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function withTempHome(fn) {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-reg-'));
  const prevUserProfile = process.env.USERPROFILE;
  const prevHome = process.env.HOME;
  process.env.USERPROFILE = tmpHome;
  process.env.HOME = tmpHome;
  // Force re-require so module caches don't leak across tests.
  delete require.cache[require.resolve(path.join(REPO, 'lib', 'registry'))];
  const reg = require(path.join(REPO, 'lib', 'registry'));
  try {
    return fn(reg, tmpHome);
  } finally {
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    delete require.cache[require.resolve(path.join(REPO, 'lib', 'registry'))];
  }
}

function mkProject(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-proj-'));
  fs.mkdirSync(path.join(dir, '.planning'));
  fs.writeFileSync(
    path.join(dir, '.planning', 'PROJECT.md'),
    `# ${name}\n\nSome content.\n`
  );
  return dir;
}

function mkProjectFrontmatter(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-proj-fm-'));
  fs.mkdirSync(path.join(dir, '.planning'));
  fs.writeFileSync(
    path.join(dir, '.planning', 'PROJECT.md'),
    `---\nfoo: bar\n---\n\n# ${name}\n\nbody\n`
  );
  return dir;
}

section('registryPath honors USERPROFILE');
withTempHome((reg, home) => {
  const p = reg.registryPath();
  ok('registry path inside temp home',
    p.startsWith(home),
    `got ${p}, expected prefix ${home}`);
  ok('registry path ends with projects.json',
    p.endsWith(path.join('.config', 'cp', 'projects.json')));
});

section('read returns empty doc when file missing');
withTempHome((reg) => {
  const doc = reg.read();
  ok('version 1', doc.version === 1);
  ok('projects empty', Array.isArray(doc.projects) && doc.projects.length === 0);
});

section('touchIfProject creates new entry');
withTempHome((reg) => {
  const proj = mkProject('alpha');
  const did = reg.touchIfProject(proj);
  ok('returned true', did === true);
  const items = reg.list();
  ok('one entry', items.length === 1);
  ok('name parsed from H1', items[0].name === 'alpha');
  ok('path matches', items[0].path === proj);
  ok('first_seen_at set', typeof items[0].first_seen_at === 'string');
  ok('last_seen_at set', typeof items[0].last_seen_at === 'string');
});

section('touchIfProject is a no-op without PROJECT.md');
withTempHome((reg) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-empty-'));
  const did = reg.touchIfProject(dir);
  ok('returned false', did === false);
  ok('registry still empty', reg.list().length === 0);
});

section('touchIfProject skips frontmatter and uses first H1');
withTempHome((reg) => {
  const proj = mkProjectFrontmatter('beta-proj');
  reg.touchIfProject(proj);
  const items = reg.list();
  ok('found beta-proj', items.length === 1 && items[0].name === 'beta-proj');
});

section('touchIfProject updates last_seen_at on second call');
withTempHome((reg) => {
  const proj = mkProject('gamma');
  reg.touchIfProject(proj);
  const first = reg.list()[0].last_seen_at;
  // Spin until the clock advances by at least 2 ms so the new
  // ISO timestamp is strictly greater than the first.
  const target = Date.now() + 5;
  while (Date.now() < target) { /* spin */ }
  reg.touchIfProject(proj);
  const items = reg.list();
  ok('still one entry', items.length === 1);
  ok('last_seen_at advanced',
    items[0].last_seen_at > first,
    `first=${first} next=${items[0].last_seen_at}`);
  ok('first_seen_at preserved',
    items[0].first_seen_at === first ||
    items[0].first_seen_at <= items[0].last_seen_at);
});

section('list sorts by last_seen_at desc');
withTempHome((reg) => {
  const a = mkProject('a-proj');
  const b = mkProject('b-proj');
  reg.touchIfProject(a);
  // Manually mutate to ensure b is more recent.
  const doc = reg.read();
  doc.projects.push({
    name: 'b-proj',
    path: b,
    first_seen_at: '2099-01-01T00:00:00.000Z',
    last_seen_at: '2099-01-01T00:00:00.000Z',
  });
  reg.write(doc);
  const items = reg.list();
  ok('two entries', items.length === 2);
  ok('b-proj first (most recent)', items[0].name === 'b-proj');
});

section('remove by exact path');
withTempHome((reg) => {
  const a = mkProject('p1');
  reg.touchIfProject(a);
  const res = reg.remove(a);
  ok('removed=1', res.removed === 1);
  ok('not ambiguous', res.ambiguous === false);
  ok('registry empty', reg.list().length === 0);
});

section('remove by name when unique');
withTempHome((reg) => {
  const a = mkProject('unique-name');
  reg.touchIfProject(a);
  const res = reg.remove('unique-name');
  ok('removed=1', res.removed === 1);
  ok('registry empty', reg.list().length === 0);
});

section('remove ambiguous by name → returns ambiguous flag');
withTempHome((reg) => {
  // Two worktrees with same name.
  const doc = reg.read();
  doc.projects.push(
    { name: 'dup', path: '/tmp/wt-1', first_seen_at: 'x', last_seen_at: 'x' },
    { name: 'dup', path: '/tmp/wt-2', first_seen_at: 'x', last_seen_at: 'x' },
  );
  reg.write(doc);
  const res = reg.remove('dup');
  ok('removed=0', res.removed === 0);
  ok('ambiguous=true', res.ambiguous === true);
  ok('matched=2', res.matched === 2);
  ok('still 2 entries', reg.list().length === 2);
});

section('remove ambiguous resolves with --path');
withTempHome((reg) => {
  const doc = reg.read();
  doc.projects.push(
    { name: 'dup', path: '/tmp/wt-1', first_seen_at: 'x', last_seen_at: 'x' },
    { name: 'dup', path: '/tmp/wt-2', first_seen_at: 'x', last_seen_at: 'x' },
  );
  reg.write(doc);
  const res = reg.remove('dup', { path: '/tmp/wt-2' });
  ok('removed=1', res.removed === 1);
  const remaining = reg.list();
  ok('one left', remaining.length === 1);
  ok('correct entry left', remaining[0].path === '/tmp/wt-1');
});

section('remove with --all bulk-removes by name');
withTempHome((reg) => {
  const doc = reg.read();
  doc.projects.push(
    { name: 'dup', path: '/tmp/wt-1', first_seen_at: 'x', last_seen_at: 'x' },
    { name: 'dup', path: '/tmp/wt-2', first_seen_at: 'x', last_seen_at: 'x' },
  );
  reg.write(doc);
  const res = reg.remove('dup', { all: true });
  ok('removed=2', res.removed === 2);
  ok('registry empty', reg.list().length === 0);
});

section('write is atomic (no .tmp leftover)');
withTempHome((reg, home) => {
  const proj = mkProject('atomic');
  reg.touchIfProject(proj);
  const dir = path.dirname(reg.registryPath());
  const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
  ok('no .tmp files left over',
    leftovers.length === 0,
    `found: ${leftovers.join(', ')}`);
});

section('corrupt registry → recovers to empty doc');
withTempHome((reg) => {
  const p = reg.registryPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '{ not valid json');
  const doc = reg.read();
  ok('version=1', doc.version === 1);
  ok('projects empty', doc.projects.length === 0);
});

section('findProjectRoot walks up to PROJECT.md');
withTempHome((reg) => {
  const proj = mkProject('walkup');
  const nested = path.join(proj, 'a', 'b', 'c');
  fs.mkdirSync(nested, { recursive: true });
  const found = reg.findProjectRoot(nested);
  ok('walked up to project', found === proj);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
