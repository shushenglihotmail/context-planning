#!/usr/bin/env node
/**
 * Dry-run-style CLI tests for `cp complete-milestone` audit gate flags
 * (--no-audit, --audit-warn). v0.8 Phase 23 (P7).
 *
 * Tests spawn the actual cp binary to verify stderr/exit-code behaviour,
 * complementing the unit-level coverage in unit-lifecycle.js.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const CP = path.join(REPO, 'bin', 'cp.js');

let passed = 0, failed = 0;
function ok(label, cond, detail = '') {
  if (cond) { passed++; console.log(`  \u2713 ${label}`); }
  else { failed++; console.log(`  \u2717 ${label}${detail ? ' :: ' + detail : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function runCp(cwd, args, opts = {}) {
  const r = spawnSync(process.execPath, [CP, ...args], { cwd, encoding: 'utf8', ...opts });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function makeCompletable(suffix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cp-cm-cli-${suffix}-`));
  execSync('git init -q -b main', { cwd: root });
  execSync('git config user.email t@l', { cwd: root });
  execSync('git config user.name t', { cwd: root });

  fs.mkdirSync(path.join(root, '.planning', 'phases', '01-greet'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), '// a\n');
  fs.writeFileSync(path.join(root, 'src', 'b.js'), '// b\n');

  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    `# demo\n\n## Phases\n\n### 🚧 v0.1 Hi (In Progress)\n\n### Phase 1: Greet\n\n- [x] 01-01: hello\n- [x] 01-02: bye\n`);
  fs.writeFileSync(path.join(root, '.planning', 'phases', '01-greet', 'PLAN.md'),
    `---\nphase: "1"\nname: Greet\n---\n# Phase 1\n\n## Plans\n- [x] 01-01: hello\n- [x] 01-02: bye\n`);
  fs.writeFileSync(path.join(root, '.planning', 'phases', '01-greet', '01-01-SUMMARY.md'),
    `---\nplan: 01-01\nphase: 1\nsubsystem: g\nkey-files:\n  created: [src/a.js]\n  modified: []\nkey-decisions: [seed]\n---\n# Plan 01-01\nDone.\n`);
  fs.writeFileSync(path.join(root, '.planning', 'phases', '01-greet', '01-02-SUMMARY.md'),
    `---\nplan: 01-02\nphase: 1\nsubsystem: g\nkey-files:\n  created: [src/b.js]\n  modified: []\nkey-decisions: [seed]\n---\n# Plan 01-02\nDone.\n`);
  fs.writeFileSync(path.join(root, '.planning', 'STATE.md'),
    `# Project State\n\n## Current Position\n\nPhase: 1\nPlan: 01-02\nStatus: Ready\nCurrent focus: Greet\nLast activity: -\n\nProgress: [██████████] 0%\n\n## Decisions\n\n(none)\n`);
  execSync('git add -A && git commit -q -m seed', { cwd: root });
  return root;
}

section('cp complete-milestone (default) refuses MEDIUM');
{
  const root = makeCompletable('default');
  const r = runCp(root, ['complete-milestone', '--no-commit']);
  ok('exit 2', r.code === 2, `code=${r.code} stderr=${r.stderr.slice(0,200)}`);
  ok('stderr mentions audit-failed', /audit-failed/.test(r.stderr));
  ok('stderr mentions blocking on MEDIUM', /MEDIUM/.test(r.stderr));
  ok('stderr suggests --audit-warn', /--audit-warn/.test(r.stderr));
}

section('cp complete-milestone --audit-warn ships on MEDIUM');
{
  const root = makeCompletable('warn');
  const r = runCp(root, ['complete-milestone', '--no-commit', '--audit-warn']);
  ok('exit 0', r.code === 0, `code=${r.code} stderr=${r.stderr.slice(0,300)}`);
  ok('stdout shows Audit line', /Audit:\s+\d+\s+HIGH/.test(r.stdout));
}

section('cp complete-milestone --no-audit bypasses + emits override notice');
{
  const root = makeCompletable('noaudit');
  const r = runCp(root, ['complete-milestone', '--no-commit', '--no-audit']);
  ok('exit 0', r.code === 0, `code=${r.code} stderr=${r.stderr.slice(0,200)}`);
  ok('stderr has override notice', /--no-audit override/i.test(r.stderr));
  ok('stdout Audit: SKIPPED', /Audit:\s+SKIPPED/.test(r.stdout));
}

section('cp complete-milestone --json on MEDIUM block returns audit object + exit 2');
{
  const root = makeCompletable('jsonblock');
  const r = runCp(root, ['complete-milestone', '--no-commit', '--json']);
  ok('exit 2', r.code === 2, `code=${r.code}`);
  let obj;
  try { obj = JSON.parse(r.stdout); } catch (_) {}
  ok('valid JSON', !!obj);
  if (obj) {
    ok('reason audit-failed', obj.reason === 'audit-failed');
    ok('audit summary present', obj.audit && obj.audit.summary && typeof obj.audit.summary.medium === 'number');
    ok('blockingSeverity MEDIUM', obj.blockingSeverity === 'MEDIUM');
  }
}

console.log('\n----------------------------------------');
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
