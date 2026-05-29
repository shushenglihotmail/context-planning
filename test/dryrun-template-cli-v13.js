'use strict';

/**
 * Dryrun tests for the `cp phase-template` and `cp workflow-template` CLI
 * commands (Phase 56). Spawns the cp binary and verifies stdout/exit-code
 * contracts. Also verifies that `cp workflow inspect` surfaces templates
 * referenced for workflows that use template inclusion.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const cpBin = path.resolve(__dirname, '..', 'bin', 'cp.js');
const repoRoot = path.resolve(__dirname, '..');
const fixtureWf = path.join(repoRoot, 'templates', 'workflows', '_fixtures-v13', 'uses-workflow-template.yaml');

let passed = 0, failed = 0;
const failures = [];

function ok(label, cond, detail) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + label);
  } else {
    failed++;
    failures.push(label + (detail ? ': ' + detail : ''));
    console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
  }
}

function section(title) { console.log('\n=== ' + title + ' ==='); }

function mkFixture(suffix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-tpl-cli-' + suffix + '-'));
  execSync('git init -q -b main', { cwd: dir });
  execSync('git config user.email t@l', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  return dir;
}

function cp(args, cwd, opts) {
  return spawnSync(process.execPath, [cpBin].concat(args), Object.assign(
    { cwd: cwd || repoRoot, encoding: 'utf8' },
    opts || {}
  ));
}

// ---- phase-template ----
section('cp phase-template ls');
{
  const r = cp(['phase-template', 'ls']);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' stderr=' + r.stderr);
  ok('lists built-in reviewer', /reviewer\s+built-in/.test(r.stdout), r.stdout);
}

section('cp phase-template ls --json');
{
  const r = cp(['phase-template', 'ls', '--json']);
  ok('exit 0', r.status === 0);
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch (_) {}
  ok('valid JSON array', Array.isArray(parsed));
  ok('contains reviewer entry', Array.isArray(parsed) && parsed.some((e) => e.name === 'reviewer' && e.source === 'built-in'));
}

section('cp phase-template show reviewer');
{
  const r = cp(['phase-template', 'show', 'reviewer']);
  ok('exit 0', r.status === 0);
  ok('prints YAML header', /^# phase-template: reviewer/.test(r.stdout));
  ok('contains name: reviewer', /name:\s*reviewer/.test(r.stdout));
}

section('cp phase-template show unknown');
{
  const r = cp(['phase-template', 'show', 'no-such-template']);
  ok('exit 3', r.status === 3, 'status=' + r.status);
  ok('error to stderr', /not found/i.test(r.stderr));
}

section('cp phase-template new');
{
  const dir = mkFixture('pt-new');
  const r = cp(['phase-template', 'new', 'my-pt'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' err=' + r.stderr);
  const dest = path.join(dir, '.planning', 'phase-templates', 'my-pt.yaml');
  ok('file created', fs.existsSync(dest));
  if (fs.existsSync(dest)) {
    const body = fs.readFileSync(dest, 'utf8');
    ok('has name: my-pt', /name:\s*my-pt/.test(body));
  }
  // duplicate without --force
  const r2 = cp(['phase-template', 'new', 'my-pt'], dir);
  ok('duplicate exit 6', r2.status === 6, 'status=' + r2.status);
  // --force succeeds
  const r3 = cp(['phase-template', 'new', 'my-pt', '--force'], dir);
  ok('--force exit 0', r3.status === 0);
}

section('cp phase-template new --from reviewer');
{
  const dir = mkFixture('pt-from');
  const r = cp(['phase-template', 'new', 'my-rev', '--from', 'reviewer'], dir);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' err=' + r.stderr);
  const body = fs.readFileSync(path.join(dir, '.planning', 'phase-templates', 'my-rev.yaml'), 'utf8');
  ok('name rewritten', /name:\s*my-rev/.test(body));
}

// ---- workflow-template ----
section('cp workflow-template ls');
{
  const r = cp(['workflow-template', 'ls']);
  ok('exit 0', r.status === 0);
  ok('lists built-in review-and-address', /review-and-address\s+built-in/.test(r.stdout));
}

section('cp workflow-template ls --json');
{
  const r = cp(['workflow-template', 'ls', '--json']);
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch (_) {}
  ok('valid JSON', Array.isArray(parsed));
  ok('contains review-and-address', Array.isArray(parsed) && parsed.some((e) => e.name === 'review-and-address'));
}

section('cp workflow-template show review-and-address');
{
  const r = cp(['workflow-template', 'show', 'review-and-address']);
  ok('exit 0', r.status === 0);
  ok('prints header', /^# workflow-template: review-and-address/.test(r.stdout));
}

section('cp workflow-template show unknown → exit 3');
{
  const r = cp(['workflow-template', 'show', 'no-such-wt']);
  ok('exit 3', r.status === 3);
}

section('cp workflow-template new');
{
  const dir = mkFixture('wt-new');
  const r = cp(['workflow-template', 'new', 'my-wt'], dir);
  ok('exit 0', r.status === 0, 'err=' + r.stderr);
  const dest = path.join(dir, '.planning', 'workflow-templates', 'my-wt.yaml');
  ok('file created', fs.existsSync(dest));
}

// ---- workflow inspect post-expansion view ----
section('cp workflow inspect surfaces templates_referenced');
{
  const r = cp(['workflow', 'inspect', fixtureWf, '--json']);
  ok('exit 0', r.status === 0, 'status=' + r.status + ' err=' + r.stderr);
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch (_) {}
  ok('templates_referenced present', parsed && Array.isArray(parsed.templates_referenced));
  ok('lists review-and-address', parsed && parsed.templates_referenced.some((t) => t.name === 'review-and-address' && t.kind === 'workflow-template'));
  ok('shows expanded prefixed ids', parsed && JSON.stringify(parsed.waves).indexOf('review--review') >= 0);
}

section('cp workflow inspect human form');
{
  const r = cp(['workflow', 'inspect', fixtureWf]);
  ok('exit 0', r.status === 0);
  ok('shows Templates referenced section', /Templates referenced/.test(r.stdout));
}

// ---- usage / help ----
section('cp help advertises new commands');
{
  const r = cp(['help']);
  ok('exit 0', r.status === 0);
  ok('mentions cp phase-template', /cp phase-template/.test(r.stdout));
  ok('mentions cp workflow-template', /cp workflow-template/.test(r.stdout));
}

section('cp phase-template (no args) prints USAGE');
{
  const r = cp(['phase-template']);
  ok('exit 0', r.status === 0);
  ok('prints subcommand list', /Subcommands:/.test(r.stdout));
}

// ---- summary ----
console.log('\n' + (failed === 0 ? '✓' : '✗') + ' phase-56 template CLI tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
