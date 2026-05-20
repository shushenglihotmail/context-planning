#!/usr/bin/env node
/**
 * Unit tests for lib/merge.js — the v0.5 additive config merge engine.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const { mergeCpDefaults, unionArrays } = require(path.join(REPO, 'lib', 'merge'));
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

try {

// ============================================================
section('unionArrays: basic operations');
{
  eq('union dedupes', unionArrays(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  eq('union empty + items', unionArrays([], ['x']), ['x']);
  eq('union items + empty', unionArrays(['x'], []), ['x']);
  eq('union both empty', unionArrays([], []), []);
  eq('union preserves order', unionArrays(['c', 'a'], ['b', 'a']), ['c', 'a', 'b']);
}

// ============================================================
section('mergeCpDefaults: schema version bump');
{
  const raw = { cp: { version: 1, workflow_provider: 'superpowers', providers: {}, behavior: {} } };
  const def = { cp: { version: 2, workflow_provider: 'superpowers', providers: {}, behavior: {} } };
  const { cfg, changed, summary } = mergeCpDefaults(raw, def);
  eq('version bumped to 2', cfg.cp.version, 2);
  ok('changed is true', changed === true);
  ok('summary mentions schema', summary.includes('schema'));
}

// ============================================================
section('mergeCpDefaults: version stays if user is higher');
{
  const raw = { cp: { version: 3, workflow_provider: 'x', providers: {}, behavior: {} } };
  const def = { cp: { version: 2, workflow_provider: 'x', providers: {}, behavior: {} } };
  const { cfg } = mergeCpDefaults(raw, def);
  eq('version stays at 3', cfg.cp.version, 3);
}

// ============================================================
section('mergeCpDefaults: workflow_provider user wins');
{
  const raw = { cp: { version: 1, workflow_provider: 'custom', providers: {}, behavior: {} } };
  const def = { cp: { version: 1, workflow_provider: 'superpowers', providers: {}, behavior: {} } };
  const { cfg } = mergeCpDefaults(raw, def);
  eq('user provider preserved', cfg.cp.workflow_provider, 'custom');
}

// ============================================================
section('mergeCpDefaults: new harness added');
{
  const raw = { cp: { version: 1, providers: {}, behavior: {} } };
  const def = { cp: { version: 1, harnesses: { copilot: { description: 'test', plugin_roots: ['~/a'] } }, providers: {}, behavior: {} } };
  const { cfg, changed, summary } = mergeCpDefaults(raw, def);
  ok('harnesses block created', !!cfg.cp.harnesses);
  ok('copilot harness added', !!cfg.cp.harnesses.copilot);
  eq('copilot plugin_roots', cfg.cp.harnesses.copilot.plugin_roots, ['~/a']);
  ok('summary mentions harness', summary.includes('copilot'));
  ok('changed', changed);
}

// ============================================================
section('mergeCpDefaults: existing harness plugin_roots union');
{
  const raw = { cp: { version: 1, harnesses: { copilot: { plugin_roots: ['~/a'] } }, providers: {}, behavior: {} } };
  const def = { cp: { version: 1, harnesses: { copilot: { description: 'Copilot', plugin_roots: ['~/a', '~/b'] } }, providers: {}, behavior: {} } };
  const { cfg } = mergeCpDefaults(raw, def);
  eq('plugin_roots unioned', cfg.cp.harnesses.copilot.plugin_roots, ['~/a', '~/b']);
}

// ============================================================
section('mergeCpDefaults: new provider added');
{
  const raw = { cp: { version: 1, providers: { manual: { detect: { always: true } } }, behavior: {} } };
  const def = { cp: { version: 1, providers: { manual: { detect: { always: true } }, echo: { skills: { plan: 'x' } } }, behavior: {} } };
  const { cfg, changed, summary } = mergeCpDefaults(raw, def);
  ok('echo provider added', !!cfg.cp.providers.echo);
  eq('echo skills preserved', cfg.cp.providers.echo.skills.plan, 'x');
  ok('changed', changed);
  ok('summary mentions echo', summary.includes('echo'));
}

// ============================================================
section('mergeCpDefaults: detect.any_of union');
{
  const raw = { cp: { version: 1, providers: { sp: { detect: { any_of: ['a', 'b'] }, skills: {} } }, behavior: {} } };
  const def = { cp: { version: 1, providers: { sp: { detect: { any_of: ['b', 'c', 'd'] }, skills: {} } }, behavior: {} } };
  const { cfg, changed, summary } = mergeCpDefaults(raw, def);
  eq('any_of unioned', cfg.cp.providers.sp.detect.any_of, ['a', 'b', 'c', 'd']);
  ok('changed', changed);
  ok('summary mentions sentinel', summary.includes('sentinel'));
}

// ============================================================
section('mergeCpDefaults: plugin_shape added when missing');
{
  const raw = { cp: { version: 1, providers: { sp: { detect: { any_of: [] }, skills: {} } }, behavior: {} } };
  const def = { cp: { version: 1, providers: { sp: { detect: { any_of: [] }, plugin_shape: { dir_name: 'sp', required_subdirs: ['x'] }, skills: {} } }, behavior: {} } };
  const { cfg, changed } = mergeCpDefaults(raw, def);
  ok('plugin_shape added', !!cfg.cp.providers.sp.plugin_shape);
  eq('dir_name', cfg.cp.providers.sp.plugin_shape.dir_name, 'sp');
  ok('changed', changed);
}

// ============================================================
section('mergeCpDefaults: plugin_shape NOT overwritten when present');
{
  const raw = { cp: { version: 1, providers: { sp: { plugin_shape: { dir_name: 'custom' }, detect: { any_of: [] }, skills: {} } }, behavior: {} } };
  const def = { cp: { version: 1, providers: { sp: { plugin_shape: { dir_name: 'default' }, detect: { any_of: [] }, skills: {} } }, behavior: {} } };
  const { cfg } = mergeCpDefaults(raw, def);
  eq('plugin_shape preserved', cfg.cp.providers.sp.plugin_shape.dir_name, 'custom');
}

// ============================================================
section('mergeCpDefaults: skills fill missing, user wins conflict');
{
  const raw = { cp: { version: 1, providers: { sp: { skills: { plan: 'my-plan' }, detect: {} } }, behavior: {} } };
  const def = { cp: { version: 1, providers: { sp: { skills: { plan: 'default-plan', execute: 'default-exec' }, detect: {} } }, behavior: {} } };
  const { cfg } = mergeCpDefaults(raw, def);
  eq('user plan preserved', cfg.cp.providers.sp.skills.plan, 'my-plan');
  eq('default execute added', cfg.cp.providers.sp.skills.execute, 'default-exec');
}

// ============================================================
section('mergeCpDefaults: behavior fill missing, user wins');
{
  const raw = { cp: { version: 1, providers: {}, behavior: { atomic_commits: false } } };
  const def = { cp: { version: 1, providers: {}, behavior: { atomic_commits: true, new_flag: true } } };
  const { cfg } = mergeCpDefaults(raw, def);
  eq('user atomic_commits preserved', cfg.cp.behavior.atomic_commits, false);
  eq('new_flag added', cfg.cp.behavior.new_flag, true);
}

// ============================================================
section('mergeCpDefaults: idempotency');
{
  const defaults = provider.loadDefaults();
  const raw = JSON.parse(JSON.stringify(defaults)); // clone defaults as "user config"
  const { changed } = mergeCpDefaults(raw, defaults);
  ok('merging identical configs -> no change', changed === false);
}

// ============================================================
section('mergeCpDefaults: does not mutate input');
{
  const raw = { cp: { version: 1, providers: {}, behavior: {} } };
  const def = { cp: { version: 2, providers: { echo: { skills: {} } }, behavior: {} } };
  const rawCopy = JSON.stringify(raw);
  mergeCpDefaults(raw, def);
  eq('raw not mutated', JSON.stringify(raw), rawCopy);
}

// ============================================================
section('mergeCpDefaults: full defaults merge against v0.4-style config');
{
  // Simulate a v0.4 config: has cp block with version 1, no harnesses, no echo-provider
  const v04Config = {
    cp: {
      version: 1,
      workflow_provider: 'superpowers',
      providers: {
        superpowers: {
          detect: { any_of: ['.claude/plugins/superpowers', '.github/skills/brainstorming'] },
          skills: { brainstorm: 'brainstorming', plan: 'writing-plans' }
        },
        manual: { detect: { always: true }, skills: { brainstorm: 'cp:manual/brainstorm' } }
      },
      behavior: { atomic_commits: true }
    }
  };
  const defaults = provider.loadDefaults();
  const { cfg, changed, summary } = mergeCpDefaults(v04Config, defaults);
  ok('schema bumped', cfg.cp.version === 2);
  ok('harnesses block added', !!cfg.cp.harnesses && !!cfg.cp.harnesses.copilot);
  ok('echo-provider added', !!cfg.cp.providers['echo-provider']);
  ok('superpowers sentinels grew', cfg.cp.providers.superpowers.detect.any_of.length > 2);
  ok('plugin_shape added to superpowers', !!cfg.cp.providers.superpowers.plugin_shape);
  ok('user workflow_provider preserved', cfg.cp.workflow_provider === 'superpowers');
  ok('user atomic_commits preserved', cfg.cp.behavior.atomic_commits === true);
  ok('changed is true', changed);
  ok('summary is informative', summary.length > 20);
}

} finally {
  // No cleanup needed — no temp dirs
}

// ---------- summary ----------
console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exitCode = 1;
} else {
  console.log('All merge unit checks passed.');
}
