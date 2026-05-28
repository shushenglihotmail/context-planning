'use strict';

/**
 * v1.4 checkpoint helpers — bracket each supervised-workflow phase with
 * snapshot / commit / revert / restart operations on the working tree.
 *
 * Per Option A (DESIGN.md Decision #6) the cp engine owns all git work
 * for supervised runs; sub-agents must not run git themselves. These
 * helpers expose narrow, idempotent operations the supervisor calls
 * between phases.
 *
 * All operations require:
 *   - the run exists at .planning/runs/<slug>/state.json
 *   - the phase has been bootstrapped in state (phases.<id> object)
 *   - the phase declares `outputs` (string array) — except snapshot,
 *     which only records HEAD.
 *
 * Outputs are resolved against the project root. Writes outside
 * declared outputs are NEVER committed or reverted by these helpers.
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const supervisor = require('./supervisor');

// ---------- internal ----------

function _git(args, opts) {
  const o = opts || {};
  const r = spawnSync('git', args, {
    cwd: o.cwd || process.cwd(),
    encoding: 'utf8',
  });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error || null,
  };
}

function _headSha(cwd) {
  const r = _git(['rev-parse', 'HEAD'], {cwd: cwd});
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}

function _ensurePhase(state, phaseId) {
  if (!state.phases || !state.phases[phaseId]) {
    throw new Error(`checkpoint: phase '${phaseId}' not present in state.json`);
  }
  return state.phases[phaseId];
}

// `.planning/` is supervisor bookkeeping (state.json, run metadata).
// We exclude it from user-facing dirty/skip accounting so that supervisor
// writes don't pollute the working-tree contract with sub-agents.
function _isSupervisorPath(p) {
  if (!p) return false;
  const norm = p.replace(/\\/g, '/');
  return norm === '.planning' || norm.startsWith('.planning/');
}

function _userDirty(cwd) {
  // -uall expands untracked directories to individual files so we can
  // do per-file allowed/skip accounting instead of per-directory.
  const r = _git(['status', '--porcelain', '-uall'], {cwd: cwd});
  if (r.status !== 0) {
    throw new Error('checkpoint: git status failed: ' + (r.stderr || '').trim());
  }
  return r.stdout.split(/\r?\n/)
    .filter(l => l.length > 0)
    .map(l => l.slice(3))
    .filter(p => !_isSupervisorPath(p));
}

function _isCleanRepo(cwd) {
  try { return _userDirty(cwd).length === 0; } catch (_) { return false; }
}

/**
 * Resolve declared outputs into safe relative paths anchored at projectDir.
 * Refuses anything that escapes the project root, mirroring isOutputAllowed.
 */
function _resolveDeclaredOutputs(declared, projectDir) {
  if (!Array.isArray(declared) || declared.length === 0) {
    throw new Error('checkpoint: phase has no declared outputs');
  }
  const root = path.resolve(projectDir);
  const out = [];
  for (const d of declared) {
    if (typeof d !== 'string' || d.length === 0) continue;
    const abs = path.resolve(root, d);
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      throw new Error(`checkpoint: declared output escapes project root: ${d}`);
    }
    out.push(path.relative(root, abs) || '.');
  }
  return out;
}

// ---------- public API ----------

/**
 * Record HEAD as the snapshot for a phase. Idempotent — re-snapshotting
 * overwrites the previous record.
 *
 * @param {string} slug
 * @param {string} phaseId
 * @param {{ projectDir?: string, now?: Date }} [opts]
 * @returns {{ phaseId: string, sha: string|null, state: object }}
 */
function snapshot(slug, phaseId, opts) {
  const o = opts || {};
  const projectDir = o.projectDir || process.cwd();
  const state = supervisor.readState(slug, {projectDir: projectDir});
  if (!state.phases || !state.phases[phaseId]) {
    supervisor.setPath(slug, 'phases.' + phaseId, {status: 'pending'}, {projectDir: projectDir, now: o.now});
  }
  const sha = _headSha(projectDir);
  supervisor.setPath(slug, 'phases.' + phaseId + '.snapshot_commit', sha, {projectDir: projectDir, now: o.now});
  supervisor.setPath(slug, 'phases.' + phaseId + '.snapshot_ts', (o.now || new Date()).toISOString(), {projectDir: projectDir, now: o.now});
  return {phaseId: phaseId, sha: sha, state: supervisor.readState(slug, {projectDir: projectDir})};
}

/**
 * Stage and commit declared outputs for a phase. Writes outside the
 * declared paths are left untouched in the working tree and stderr-warned.
 *
 * Engine-controlled message:
 *   cp run <workflow>: <phase-id> ({{slug}})
 *
 * @param {string} slug
 * @param {string} phaseId
 * @param {{ projectDir?: string, now?: Date, message?: string,
 *           allowEmpty?: boolean, outputs?: string[] }} [opts]
 * @returns {{ phaseId: string, commit: string|null, state: object,
 *             skippedOutOfScope: number }}
 */
function commit(slug, phaseId, opts) {
  const o = opts || {};
  const projectDir = o.projectDir || process.cwd();
  const state = supervisor.readState(slug, {projectDir: projectDir});
  const phase = _ensurePhase(state, phaseId);
  const declared = o.outputs || phase.outputs;
  const outputs = _resolveDeclaredOutputs(declared, projectDir);

  // Count out-of-scope dirty files for the audit trail (not committed).
  // Supervisor metadata (.planning/) is filtered out by _userDirty.
  const dirty = _userDirty(projectDir);
  let skippedOutOfScope = 0;
  for (const p of dirty) {
    if (!supervisor.isOutputAllowed(declared, p, projectDir)) skippedOutOfScope++;
  }

  // Stage only declared output paths.
  const addArgs = ['add', '--'].concat(outputs);
  const add = _git(addArgs, {cwd: projectDir});
  if (add.status !== 0) {
    throw new Error('checkpoint commit: git add failed: ' + (add.stderr || '').trim());
  }

  // Detect whether anything is actually staged.
  const cached = _git(['diff', '--cached', '--name-only'], {cwd: projectDir});
  const stagedFiles = (cached.stdout || '').split(/\r?\n/).filter(l => l.length > 0);
  if (stagedFiles.length === 0 && !o.allowEmpty) {
    return {
      phaseId: phaseId,
      commit: null,
      state: supervisor.readState(slug, {projectDir: projectDir}),
      skippedOutOfScope: skippedOutOfScope,
      noChanges: true,
    };
  }

  const workflow = state.workflow || 'workflow';
  const msg = o.message || `cp run ${workflow}: ${phaseId} (${slug})`;
  const commitArgs = ['commit', '-m', msg];
  if (o.allowEmpty) commitArgs.push('--allow-empty');
  const c = _git(commitArgs, {cwd: projectDir});
  if (c.status !== 0) {
    throw new Error('checkpoint commit: git commit failed: ' + (c.stderr || '').trim());
  }

  const sha = _headSha(projectDir);
  const now = o.now instanceof Date ? o.now : new Date();
  supervisor.setPath(slug, 'phases.' + phaseId + '.commit_sha', sha, {projectDir: projectDir, now: now});
  supervisor.setPath(slug, 'phases.' + phaseId + '.completed', now.toISOString(), {projectDir: projectDir, now: now});
  supervisor.setPath(slug, 'phases.' + phaseId + '.status', 'complete', {projectDir: projectDir, now: now});

  return {
    phaseId: phaseId,
    commit: sha,
    state: supervisor.readState(slug, {projectDir: projectDir}),
    skippedOutOfScope: skippedOutOfScope,
  };
}

/**
 * Revert uncommitted writes within the phase's declared outputs.
 * Only touches working-tree files matching declared output prefixes;
 * leaves any other dirty state alone.
 *
 * Uses `git checkout HEAD -- <path>` per declared path, plus
 * `git clean -fd` scoped to declared output directories to remove
 * untracked new files.
 *
 * @param {string} slug
 * @param {string} phaseId
 * @param {{ projectDir?: string, now?: Date, outputs?: string[] }} [opts]
 * @returns {{ phaseId: string, reverted: string[], state: object }}
 */
function revert(slug, phaseId, opts) {
  const o = opts || {};
  const projectDir = o.projectDir || process.cwd();
  const state = supervisor.readState(slug, {projectDir: projectDir});
  const phase = _ensurePhase(state, phaseId);
  const declared = o.outputs || phase.outputs;
  const outputs = _resolveDeclaredOutputs(declared, projectDir);

  const reverted = [];
  for (const p of outputs) {
    // Restore tracked files at HEAD; ignore "did not match any file" exits.
    const co = _git(['checkout', 'HEAD', '--', p], {cwd: projectDir});
    if (co.status === 0) reverted.push(p);
    // Remove untracked files created under p.
    _git(['clean', '-fd', '--', p], {cwd: projectDir});
  }

  const now = o.now instanceof Date ? o.now : new Date();
  supervisor.setPath(slug, 'phases.' + phaseId + '.status', 'failed', {projectDir: projectDir, now: now});
  supervisor.setPath(slug, 'phases.' + phaseId + '.reverted_ts', now.toISOString(), {projectDir: projectDir, now: now});

  return {phaseId: phaseId, reverted: reverted, state: supervisor.readState(slug, {projectDir: projectDir})};
}

/**
 * Restart a phase: roll the working tree back to the recorded snapshot
 * (only if doing so does not lose commits made AFTER the snapshot beyond
 * the phase's own auto-commit), then reset the phase entry in state.json
 * to `pending`.
 *
 * Safety rules:
 *   - Refuses if snapshot_commit is null.
 *   - Refuses if any commits exist after the phase's commit_sha (would
 *     lose work). Caller must restart later phases first.
 *   - Refuses if working tree is dirty (caller must revert first).
 *   - If commit_sha is HEAD or HEAD~1..commit_sha is a fast-forward only
 *     containing the phase's own commits, `git reset --hard snapshot_commit`.
 *
 * @param {string} slug
 * @param {string} phaseId
 * @param {{ projectDir?: string, now?: Date, force?: boolean }} [opts]
 * @returns {{ phaseId: string, restartedTo: string|null, state: object }}
 */
function restart(slug, phaseId, opts) {
  const o = opts || {};
  const projectDir = o.projectDir || process.cwd();
  const state = supervisor.readState(slug, {projectDir: projectDir});
  const phase = _ensurePhase(state, phaseId);
  const snap = phase.snapshot_commit;
  if (!snap) {
    throw new Error(`checkpoint restart: phase '${phaseId}' has no snapshot_commit`);
  }
  if (!o.force && !_isCleanRepo(projectDir)) {
    throw new Error('checkpoint restart: working tree is dirty; run revert first or pass --force');
  }
  const head = _headSha(projectDir);
  if (!head) {
    throw new Error('checkpoint restart: cannot resolve HEAD');
  }
  if (head !== snap) {
    // Verify the only commits between snap..head are the phase's own commit_sha.
    const range = snap + '..' + head;
    const r = _git(['rev-list', range], {cwd: projectDir});
    if (r.status !== 0) {
      throw new Error('checkpoint restart: git rev-list failed: ' + (r.stderr || '').trim());
    }
    const commits = r.stdout.split(/\r?\n/).filter(l => l.length > 0);
    const allowed = phase.commit_sha ? [phase.commit_sha] : [];
    const unexpected = commits.filter(c => allowed.indexOf(c) === -1);
    if (unexpected.length > 0 && !o.force) {
      throw new Error(
        'checkpoint restart: snapshot..HEAD contains ' + unexpected.length +
        ' unexpected commit(s); restart later phases first or pass --force'
      );
    }
    // Preserve supervisor state across the reset: if state.json was
    // inadvertently committed after snap, `git reset --hard` would wipe
    // it. Snapshot the current state in-memory, run the reset, then
    // re-materialize state.json on disk.
    const preserved = JSON.parse(JSON.stringify(state));
    const reset = _git(['reset', '--hard', snap], {cwd: projectDir});
    if (reset.status !== 0) {
      throw new Error('checkpoint restart: git reset failed: ' + (reset.stderr || '').trim());
    }
    // Always re-write state.json so it survives reset regardless of
    // whether it was tracked at snap.
    const stPath = supervisor.stateFilePath(slug, projectDir);
    fs.mkdirSync(path.dirname(stPath), {recursive: true});
    fs.writeFileSync(stPath, JSON.stringify(preserved, null, 2) + '\n');
  }

  const stateAfter = supervisor.readState(slug, {projectDir: projectDir});
  const phaseAfter = _ensurePhase(stateAfter, phaseId);

  const now = o.now instanceof Date ? o.now : new Date();
  // Re-pend the phase but preserve audit-trail fields (classifier_history,
  // sub_agent_calls, etc.). Only mutate the lifecycle fields.
  const merged = Object.assign({}, phaseAfter, {
    status: 'pending',
    outputs: phaseAfter.outputs || phase.outputs || [],
    snapshot_commit: snap,
    commit_sha: null,
    completed: null,
    restart_history: (phaseAfter.restart_history || phase.restart_history || []).concat([{
      ts: now.toISOString(),
      prior_commit_sha: phaseAfter.commit_sha || phase.commit_sha || null,
    }]),
  });
  supervisor.setPath(slug, 'phases.' + phaseId, merged, {projectDir: projectDir, now: now});

  return {
    phaseId: phaseId,
    restartedTo: snap,
    state: supervisor.readState(slug, {projectDir: projectDir}),
  };
}

module.exports = {
  snapshot,
  commit,
  revert,
  restart,
};
