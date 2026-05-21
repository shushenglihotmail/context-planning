#!/usr/bin/env node
'use strict';

/**
 * bin/cp-hook.js — smart shim invoked from .git/hooks/<event>.
 *
 * Usage (from git hook):
 *   node <pluginRoot>/bin/cp-hook.js pre-commit
 *
 * The shim:
 *   1. Walks the enclosing git root for `.planning/STATE.md` markers
 *      (multi-project / monorepo safe).
 *   2. For each cp project found, dispatches the configured action under
 *      `cp.behavior.pre_commit` (default `audit-high`).
 *   3. Aggregates exit codes. Non-zero from ANY project blocks the commit.
 *
 * Supported pre_commit actions:
 *   - off          : no-op
 *   - audit-high   : cp audit --severity high --quiet (default)
 *   - audit-any    : cp audit --quiet
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { gitRoot, findCpProjects } = require('../lib/hooks');
const { loadConfig, cpGet } = require('../lib/provider');

function actionFor(event, cfg) {
  if (event === 'pre-commit') {
    return cpGet(cfg, 'behavior.pre_commit', 'audit-high');
  }
  if (event === 'post-commit') {
    return cpGet(cfg, 'behavior.post_commit', 'off');
  }
  return 'off';
}

function runAction(action, projectRoot) {
  if (action === 'off' || !action) {
    return { code: 0, stdout: '', stderr: '', skipped: true };
  }
  let args;
  if (action === 'audit-high') {
    args = ['audit', '--severity', 'high', '--quiet'];
  } else if (action === 'audit-any') {
    args = ['audit', '--quiet'];
  } else if (action === 'tick-auto') {
    // Phase 28 will wire this; placeholder so post-commit can route.
    args = ['_unknown-action', action];
  } else {
    return {
      code: 0,
      stdout: '',
      stderr: `cp-hook: unknown action '${action}' — skipping\n`,
      skipped: true,
    };
  }
  // Invoke the cp CLI directly via node + bin/cp.js to avoid PATH lookup
  // (Windows .cmd shims occasionally trip up under `git commit -m`).
  const cpJs = path.join(__dirname, 'cp.js');
  const r = spawnSync(process.execPath, [cpJs, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return {
    code: r.status == null ? 1 : r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    skipped: false,
  };
}

function main() {
  const event = process.argv[2];
  if (!event) {
    process.stderr.write('cp-hook: missing event arg\n');
    process.exit(2);
  }

  const root = gitRoot();
  if (!root) {
    // No git context — nothing to do, exit clean.
    process.exit(0);
  }

  const projects = findCpProjects(root);
  if (projects.length === 0) {
    // No cp projects under git root — nothing to enforce.
    process.exit(0);
  }

  let aggregateCode = 0;
  for (const proj of projects) {
    let cfg;
    try {
      cfg = loadConfig(proj);
    } catch (_) {
      cfg = {};
    }
    const action = actionFor(event, cfg);
    const res = runAction(action, proj);
    if (res.skipped) continue;
    if (res.code !== 0) {
      aggregateCode = res.code;
      const rel = path.relative(root, proj) || '.';
      process.stderr.write(
        `cp-hook(${event}): ${rel}: ${action} failed (exit ${res.code})\n`
      );
      if (res.stdout) process.stderr.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
    }
  }

  process.exit(aggregateCode);
}

if (require.main === module) {
  main();
}

module.exports = { actionFor, runAction };
