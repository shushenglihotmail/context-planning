#!/usr/bin/env node
'use strict';

/**
 * Integration tests for `cp quick-setup --project <name> --milestone <name>`.
 *
 * Builds a fake project tree under a tempdir, registers it via
 * lib/registry, then runs `node bin/cp.js quick-setup ...` and asserts
 * the right scaffolding lands at the right place.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const CP_JS = path.join(REPO, 'bin', 'cp.js');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  \u2713 ${label}`); passed++; }
  else { console.log(`  \u2717 ${label}${detail ? ' \u2014 ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function mkProject(home, projectName, milestones) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-q-proj-'));
  fs.mkdirSync(path.join(dir, '.planning', 'milestones'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.planning', 'PROJECT.md'),
    `# ${projectName}\n\nFake project.\n`
  );
  for (const m of (milestones || [])) {
    const mdir = path.join(dir, '.planning', 'milestones', m.slug);
    fs.mkdirSync(mdir, { recursive: true });
    fs.writeFileSync(
      path.join(mdir, 'DESIGN.md'),
      `# ${m.name}\n\nA milestone.\n`
    );
  }
  // Register via registry write
  const regPath = path.join(home, '.config', 'cp', 'projects.json');
  fs.mkdirSync(path.dirname(regPath), { recursive: true });
  let reg = { version: 1, projects: [] };
  if (fs.existsSync(regPath)) {
    try { reg = JSON.parse(fs.readFileSync(regPath, 'utf8')); } catch (_e) {}
  }
  reg.projects.push({ name: projectName, path: dir, last_seen_at: new Date().toISOString() });
  fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
  return dir;
}

function runCp(args, home) {
  const env = Object.assign({}, process.env, {
    USERPROFILE: home,
    HOME: home,
  });
  return spawnSync(process.execPath, [CP_JS, ...args], { env, encoding: 'utf8' });
}

console.log('=== quick-attach integration tests ===');

// Setup a fresh tempHome for the whole suite
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-q-home-'));

section('--project resolves by name and scaffolds in resolved dir');
{
  const projDir = mkProject(tmpHome, 'alpha-app', [
    { slug: 'first-milestone', name: 'First Milestone' },
  ]);
  const r = runCp(
    ['quick-setup', '--task', 'fix a thing', '--slug', 't1', '--project', 'alpha-app', '--json'],
    tmpHome
  );
  ok('exit 0', r.status === 0, `stderr=${r.stderr} stdout=${r.stdout}`);
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch (_e) {}
  ok('json parses', !!parsed);
  ok('scaffold ok', parsed && parsed.ok === true, JSON.stringify(parsed));
  ok('dir is under the resolved project', parsed && parsed.dir &&
    parsed.dir.startsWith(projDir), `dir=${parsed && parsed.dir} expected under ${projDir}`);
  const designPath = parsed && path.join(parsed.dir, 'DESIGN.md');
  ok('DESIGN.md exists', designPath && fs.existsSync(designPath));
  const txt = fs.readFileSync(designPath, 'utf8');
  ok('no frontmatter when no --milestone', !txt.startsWith('---'));
}

section('--milestone writes slug into frontmatter');
{
  const r = runCp(
    ['quick-setup', '--task', 'fix b', '--slug', 't2',
      '--project', 'alpha-app', '--milestone', 'First Milestone', '--json'],
    tmpHome
  );
  ok('exit 0', r.status === 0, `stderr=${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  ok('scaffold ok', parsed.ok === true);
  const txt = fs.readFileSync(path.join(parsed.dir, 'DESIGN.md'), 'utf8');
  ok('has frontmatter', txt.startsWith('---\n'));
  ok('frontmatter contains milestone slug',
    /^milestone:\s*first-milestone\s*$/m.test(txt), `txt head=${txt.slice(0, 200)}`);
}

section('--milestone resolves by case-insensitive substring');
{
  const r = runCp(
    ['quick-setup', '--task', 'fix c', '--slug', 't3',
      '--project', 'ALPHA-APP', '--milestone', 'first', '--json'],
    tmpHome
  );
  ok('exit 0', r.status === 0, `stderr=${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  ok('scaffold ok', parsed.ok);
  const txt = fs.readFileSync(path.join(parsed.dir, 'DESIGN.md'), 'utf8');
  ok('frontmatter resolved to first-milestone',
    /milestone:\s*first-milestone/.test(txt));
}

section('unknown --project errors with friendly message');
{
  const r = runCp(
    ['quick-setup', '--task', 'x', '--slug', 't4', '--project', 'no-such-thing'],
    tmpHome
  );
  ok('exit non-zero', r.status !== 0);
  ok('error mentions "no project named"', r.stderr.includes('no project named'),
    `stderr=${r.stderr}`);
  ok('lists at least one available project',
    r.stderr.includes('alpha-app'), `stderr=${r.stderr}`);
}

section('unknown --milestone errors with friendly message');
{
  const r = runCp(
    ['quick-setup', '--task', 'x', '--slug', 't5',
      '--project', 'alpha-app', '--milestone', 'no-such-milestone'],
    tmpHome
  );
  ok('exit non-zero', r.status !== 0);
  ok('error mentions "no milestone named"', r.stderr.includes('no milestone named'),
    `stderr=${r.stderr}`);
}

section('ambiguous --project errors with all candidates');
{
  mkProject(tmpHome, 'alpha-x', []);
  // Now there are two projects with "alpha" in the name.
  const r = runCp(
    ['quick-setup', '--task', 'x', '--slug', 't6', '--project', 'alpha'],
    tmpHome
  );
  ok('exit non-zero', r.status !== 0);
  ok('error mentions count', /\d+ projects? match/.test(r.stderr),
    `stderr=${r.stderr}`);
  ok('lists alpha-app', r.stderr.includes('alpha-app'));
  ok('lists alpha-x', r.stderr.includes('alpha-x'));
}

section('regression: omit both flags → byte-identical DESIGN.md as before');
{
  // Use cwd as project; pre-existing behavior. Create a tempdir with .planning
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-q-cwd-'));
  fs.mkdirSync(path.join(proj, '.planning'));
  fs.writeFileSync(path.join(proj, '.planning', 'PROJECT.md'), '# baseline\n');
  const env = Object.assign({}, process.env, {
    USERPROFILE: tmpHome, HOME: tmpHome,
  });
  const r = spawnSync(process.execPath,
    [CP_JS, 'quick-setup', '--task', 'plain task', '--slug', 't7', '--json'],
    { env, encoding: 'utf8', cwd: proj });
  ok('exit 0', r.status === 0, `stderr=${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  const txt = fs.readFileSync(path.join(parsed.dir, 'DESIGN.md'), 'utf8');
  ok('no frontmatter at all', !txt.startsWith('---'));
  ok('starts with # Quick task:', txt.startsWith('# Quick task: plain task'));
}

console.log(`\nResults: passed=${passed} failed=${failed}`);
process.exit(failed === 0 ? 0 : 1);
