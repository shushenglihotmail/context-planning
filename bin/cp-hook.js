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
const { gitRoot, findCpProjects, lastCommitInfo } = require('../lib/hooks');
const { loadConfig, cpGet } = require('../lib/provider');

function actionFor(event, cfg) {
  if (event === 'pre-commit') {
    return cpGet(cfg, 'behavior.pre_commit', 'audit-high');
  }
  if (event === 'post-commit') {
    // Default off: tick-auto subtly mutates history with a follow-up commit.
    return cpGet(cfg, 'behavior.post_commit', 'off');
  }
  return 'off';
}

function _parsePlanIdFromSubject(subject) {
  if (typeof subject !== 'string') return null;
  // Match: cp(NN-MM): ... or cp(NN-MM-anything): ...
  // Explicitly REJECT cp(reconcile):, cp(supersede):, cp(deviate):, cp: ...
  // by requiring the first capture to start with a digit.
  const m = subject.match(/^cp\((\d+-\d+)(?:-[^)]*)?\):/);
  if (!m) return null;
  return m[1];
}

function runAction(action, projectRoot, event) {
  if (action === 'off' || !action) {
    return { code: 0, stdout: '', stderr: '', skipped: true };
  }
  // Pre-commit actions go through cp CLI as a child process.
  if (action === 'audit-high' || action === 'audit-any') {
    const args =
      action === 'audit-high'
        ? ['audit', '--severity', 'high', '--quiet']
        : ['audit', '--quiet'];
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
  // Post-commit tick-auto runs in-process (no recursive commit needed yet —
  // tickPlan handles the follow-up commit via state regeneration).
  if (action === 'tick-auto' && event === 'post-commit') {
    return _runTickAuto(projectRoot);
  }
  return {
    code: 0,
    stdout: '',
    stderr: `cp-hook: unknown action '${action}' for ${event} — skipping\n`,
    skipped: true,
  };
}

/**
 * Post-commit tick-auto: parse the last commit subject, look up the plan's
 * expected-key-files, tick the plan if coverage matches.
 *
 * Runs lifecycle.tickPlan + commits the tick in a follow-up commit so the
 * user's original commit stays untouched.
 */
function _runTickAuto(projectRoot) {
  const info = lastCommitInfo(projectRoot);
  if (!info) return { code: 0, stdout: '', stderr: '', skipped: true };

  const planId = _parsePlanIdFromSubject(info.subject);
  if (!planId) return { code: 0, stdout: '', stderr: '', skipped: true };

  // If the commit was already a tick commit (`cp: tick plan NN-MM`), no-op.
  if (/^cp:\s+tick\s+plan\s+/.test(info.subject)) {
    return { code: 0, stdout: '', stderr: '', skipped: true };
  }

  const lifecycle = require('../lib/lifecycle');
  let decision;
  try {
    decision = lifecycle.tryAutoTick(projectRoot, planId, info.files);
  } catch (e) {
    return {
      code: 0,
      stdout: '',
      stderr: `cp-hook(post-commit): tryAutoTick error: ${e.message}\n`,
      skipped: true,
    };
  }

  if (decision.decision !== 'tick') {
    return { code: 0, stdout: '', stderr: '', skipped: true };
  }

  // Run cp tick NN-MM via the CLI so it goes through the normal commit
  // path (audit-clean state regen + atomic commit message).
  const cpJs = path.join(__dirname, 'cp.js');
  const r = spawnSync(process.execPath, [cpJs, 'tick', planId], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return {
    code: r.status == null ? 0 : r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    skipped: false,
    autoTicked: planId,
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
    const res = runAction(action, proj, event);
    if (res.skipped) continue;
    if (res.autoTicked) {
      process.stderr.write(
        `cp-hook(post-commit): auto-ticked plan ${res.autoTicked}\n`
      );
    }
    if (res.code !== 0) {
      // post-commit failures don't block (commit already happened) but
      // are still reported on stderr and surface as non-zero so CI can
      // notice. Pre-commit failures DO block.
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

module.exports = { actionFor, runAction, _parsePlanIdFromSubject, _runTickAuto };
