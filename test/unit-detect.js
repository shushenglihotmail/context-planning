#!/usr/bin/env node
/**
 * Unit tests for lib/detect.js — the v0.5 harness × provider detection engine.
 *
 * Tests use the same tiny-test-runner pattern as test/unit-libs.js.
 * All tests monkey-patch os.homedir() to a temp dir so host machine
 * state doesn't leak (same isolation pattern established in v0.4.5).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const detect = require(path.join(REPO, 'lib', 'detect'));
const provider = require(path.join(REPO, 'lib', 'provider'));

// ---------- tiny test runner ----------
let passed = 0;
let failed = 0;
const failures = [];
function ok(label, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ' :: ' + detail : ''}`);
    console.log(`  \u2717 ${label}${detail ? ' :: ' + detail : ''}`);
  }
}
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(label + ` (=${e})`, a === e, `got ${a}`);
}
function section(name) { console.log(`\n=== ${name} ===`); }
function mktmp(n) { return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-detect-' + n + '-')); }
function writeFile(p, c) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c || ''); }
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

const created = [];
function track(d) { created.push(d); return d; }

const realHomedir = os.homedir;

try {

// ============================================================
section('expandRoot: literal path (no glob)');
{
  const tmp = track(mktmp('literal'));
  const existing = path.join(tmp, 'foo', 'bar');
  fs.mkdirSync(existing, { recursive: true });

  const r1 = detect.expandRoot(existing);
  eq('existing literal returns [abs]', r1, [existing]);

  const r2 = detect.expandRoot(path.join(tmp, 'nonexistent'));
  eq('missing literal returns []', r2, []);
}

// ============================================================
section('expandRoot: tilde expansion');
{
  const tmpHome = track(mktmp('tilde'));
  os.homedir = () => tmpHome;
  try {
    const target = path.join(tmpHome, 'some', 'dir');
    fs.mkdirSync(target, { recursive: true });

    const r = detect.expandRoot('~/some/dir');
    eq('tilde expands to homedir', r.length, 1);
    ok('expanded path ends with some/dir',
      r[0].endsWith(path.join('some', 'dir')));
  } finally {
    os.homedir = realHomedir;
  }
}

// ============================================================
section('expandRoot: trailing-* segment');
{
  const tmp = track(mktmp('glob'));
  const parent = path.join(tmp, 'plugins');
  fs.mkdirSync(path.join(parent, 'alpha-mkt', 'inner'), { recursive: true });
  fs.mkdirSync(path.join(parent, 'beta-mkt', 'inner'), { recursive: true });
  // Create a file (not dir) to ensure it's filtered out
  fs.writeFileSync(path.join(parent, 'not-a-dir'), 'file');

  const r = detect.expandRoot(path.join(parent, '*', 'inner'));
  eq('glob expands to 2 dirs', r.length, 2);
  ok('results include alpha-mkt',
    r.some((p) => p.includes('alpha-mkt')));
  ok('results include beta-mkt',
    r.some((p) => p.includes('beta-mkt')));
  ok('results exclude not-a-dir file',
    !r.some((p) => p.includes('not-a-dir')));
}

// ============================================================
section('expandRoot: missing parent');
{
  const r = detect.expandRoot(path.join(os.tmpdir(), 'nonexistent-parent-' + Date.now(), '*'));
  eq('missing parent returns []', r, []);
}

// ============================================================
section('matchSegment: pattern matching');
{
  ok('* matches any', detect.matchSegment('anything', '*'));
  ok('sp-* matches sp-foo', detect.matchSegment('sp-foo', 'sp-*'));
  ok('sp-* does not match other-foo', !detect.matchSegment('other-foo', 'sp-*'));
  ok('*-mkt matches abc-mkt', detect.matchSegment('abc-mkt', '*-mkt'));
  ok('exact matches exact', detect.matchSegment('hello', 'hello'));
  ok('exact rejects mismatch', !detect.matchSegment('hello', 'world'));
}

// ============================================================
section('detectProviderAtAnyHarness: copilot marketplace layout');
{
  const tmpHome = track(mktmp('copilot'));
  os.homedir = () => tmpHome;
  try {
    // Create marketplace layout: ~/.copilot/installed-plugins/sp-mkt/superpowers/skills/writing-plans/
    const spDir = path.join(tmpHome, '.copilot', 'installed-plugins', 'sp-mkt', 'superpowers');
    fs.mkdirSync(path.join(spDir, 'skills', 'writing-plans'), { recursive: true });
    fs.mkdirSync(path.join(spDir, 'skills', 'subagent-driven-development'), { recursive: true });

    const cfg = provider.loadDefaults();
    const r = detect.detectProviderAtAnyHarness(cfg, 'superpowers');
    ok('installed is true', r.installed === true);
    eq('via is copilot', r.via, 'copilot');
    eq('source is plugin_shape', r.source, 'plugin_shape');
    ok('evidence points at superpowers dir', r.evidence.includes('superpowers'));
  } finally {
    os.homedir = realHomedir;
  }
}

// ============================================================
section('detectProviderAtAnyHarness: claude plugin layout');
{
  const tmpHome = track(mktmp('claude'));
  os.homedir = () => tmpHome;
  try {
    // Create Claude layout: ~/.claude/plugins/superpowers/skills/writing-plans/
    const spDir = path.join(tmpHome, '.claude', 'plugins', 'superpowers');
    fs.mkdirSync(path.join(spDir, 'skills', 'writing-plans'), { recursive: true });
    fs.mkdirSync(path.join(spDir, 'skills', 'subagent-driven-development'), { recursive: true });

    const cfg = provider.loadDefaults();
    const r = detect.detectProviderAtAnyHarness(cfg, 'superpowers');
    ok('installed is true', r.installed === true);
    eq('via is claude', r.via, 'claude');
    eq('source is plugin_shape', r.source, 'plugin_shape');
  } finally {
    os.homedir = realHomedir;
  }
}

// ============================================================
section('detectProviderAtAnyHarness: no match → not installed');
{
  const tmpHome = track(mktmp('empty'));
  os.homedir = () => tmpHome;
  try {
    const cfg = provider.loadDefaults();
    const r = detect.detectProviderAtAnyHarness(cfg, 'superpowers');
    ok('installed is false', r.installed === false);
    eq('reason is no sentinel matched', r.reason, 'no sentinel matched');
  } finally {
    os.homedir = realHomedir;
  }
}

// ============================================================
section('detectProviderAtAnyHarness: legacy any_of back-compat');
{
  const tmpHome = track(mktmp('legacy'));
  os.homedir = () => tmpHome;
  try {
    // Create only a legacy sentinel: ~/.github/skills/brainstorming
    fs.mkdirSync(path.join(tmpHome, '.github', 'skills', 'brainstorming'), { recursive: true });

    const cfg = provider.loadDefaults();
    const r = detect.detectProviderAtAnyHarness(cfg, 'superpowers');
    ok('installed is true (legacy path)', r.installed === true);
    eq('via is _anywhere', r.via, '_anywhere');
    eq('source is literal', r.source, 'literal');
  } finally {
    os.homedir = realHomedir;
  }
}

// ============================================================
section('detectProviderAtAnyHarness: always:true (manual)');
{
  const cfg = provider.loadDefaults();
  const r = detect.detectProviderAtAnyHarness(cfg, 'manual');
  ok('manual is always installed', r.installed === true);
  eq('source is always', r.source, 'always');
  eq('via is _builtin', r.via, '_builtin');
}

// ============================================================
section('detectProviderAtAnyHarness: unknown provider');
{
  const cfg = provider.loadDefaults();
  const r = detect.detectProviderAtAnyHarness(cfg, 'nonexistent');
  ok('unknown is not installed', r.installed === false);
  eq('reason is unknown provider', r.reason, 'unknown provider');
}

// ============================================================
section('detectAllInstalled: full report shape');
{
  const tmpHome = track(mktmp('full'));
  const tmpRepo = track(mktmp('full-repo'));
  fs.mkdirSync(path.join(tmpRepo, '.git'), { recursive: true });
  os.homedir = () => tmpHome;
  const oldCwd = process.cwd();
  process.chdir(tmpRepo);
  try {
    // Create copilot marketplace layout for superpowers
    const spDir = path.join(tmpHome, '.copilot', 'installed-plugins', 'sp-mkt', 'superpowers');
    fs.mkdirSync(path.join(spDir, 'skills', 'writing-plans'), { recursive: true });
    fs.mkdirSync(path.join(spDir, 'skills', 'subagent-driven-development'), { recursive: true });

    const cfg = provider.loadDefaults();
    const report = detect.detectAllInstalled(cfg);

    ok('report has harnesses array', Array.isArray(report.harnesses));
    ok('report has providers array', Array.isArray(report.providers));

    // Check harness count matches config
    const harnessCount = Object.keys(cfg.cp.harnesses).length;
    eq('harness count matches config', report.harnesses.length, harnessCount);

    // Check copilot harness found the marketplace
    const copilot = report.harnesses.find((h) => h.name === 'copilot');
    ok('copilot harness found', !!copilot);
    ok('copilot has pluginCount >= 1', copilot && copilot.pluginCount >= 1);

    // Check superpowers detected
    const sp = report.providers.find((p) => p.name === 'superpowers');
    ok('superpowers in providers', !!sp);
    ok('superpowers is installed', sp && sp.installed === true);
    ok('superpowers has at least 1 hit', sp && sp.hits.length >= 1);

    // Check manual is always installed
    const manual = report.providers.find((p) => p.name === 'manual');
    ok('manual is installed', manual && manual.installed === true);

    // Check echo-provider is NOT installed (no local files in sandboxed env)
    const echo = report.providers.find((p) => p.name === 'echo-provider');
    ok('echo-provider in report', !!echo);
    ok('echo-provider is not installed', echo && echo.installed === false);
  } finally {
    process.chdir(oldCwd);
    os.homedir = realHomedir;
  }
}

// ============================================================
section('detectProviderAtAnyHarness: required_subdirs missing → not installed');
{
  const tmpHome = track(mktmp('subdirs'));
  os.homedir = () => tmpHome;
  try {
    // Create marketplace dir but WITHOUT required subdirs
    const spDir = path.join(tmpHome, '.copilot', 'installed-plugins', 'sp-mkt', 'superpowers');
    fs.mkdirSync(spDir, { recursive: true });
    // No skills/ subdirs — plugin_shape should fail

    const cfg = provider.loadDefaults();
    const r = detect.detectProviderAtAnyHarness(cfg, 'superpowers');
    // Should NOT match via plugin_shape (missing subdirs)
    // May still match via legacy sentinels if they happen to exist — but in empty home they won't
    ok('not installed when required_subdirs missing', r.installed === false);
  } finally {
    os.homedir = realHomedir;
  }
}

// ============================================================
section('back-compat: provider.detectProvider still works');
{
  const tmpHome = track(mktmp('backcompat'));
  os.homedir = () => tmpHome;
  try {
    const cfg = provider.loadDefaults();
    // Manual should work through old API
    const d = provider.detectProvider(cfg, 'manual');
    ok('detectProvider(manual) still works', d.installed === true);

    const d2 = provider.detectProvider(cfg, 'unknown-provider');
    ok('detectProvider(unknown) still works', d2.installed === false);
    eq('unknown reason preserved', d2.reason, 'unknown provider');
  } finally {
    os.homedir = realHomedir;
  }
}

} finally {
  // Clean up
  os.homedir = realHomedir;
  for (const d of created) rmrf(d);
}

// ---------- summary ----------
console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exitCode = 1;
} else {
  console.log('All detect unit checks passed.');
}
