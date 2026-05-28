'use strict';

/**
 * Helpers for cp abandon / cp list / cp status <run-id>.
 *
 * Soft abandon: only edits state.json (status=abandoned). Never touches
 * git — code revert is the user's decision.
 */

const fs = require('fs');
const path = require('path');
const supervisor = require('./supervisor');

/**
 * Soft-abandon a workflow run.
 * @param {string} slug
 * @param {{ projectDir?: string, reason?: string }} [opts]
 */
function abandon(slug, opts) {
  const o = opts || {};
  let cur;
  try {
    cur = supervisor.readState(slug, { projectDir: o.projectDir });
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (cur.status === 'abandoned') {
    return { ok: true, slug, status: 'abandoned', already: true };
  }
  cur.status = 'abandoned';
  cur.abandoned = new Date().toISOString();
  if (o.reason) cur.abandon_reason = String(o.reason);
  cur.updated = cur.abandoned;
  supervisor.writeState(slug, cur, { projectDir: o.projectDir });
  return { ok: true, slug, status: 'abandoned' };
}

/**
 * Enumerate all workflow runs. Optional filters.
 * @param {{ projectDir?: string, workflow?: string, status?: string }} [opts]
 */
function list(opts) {
  const o = opts || {};
  const root = supervisor.runsRoot(o.projectDir);
  if (!fs.existsSync(root)) return { ok: true, runs: [] };
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const runs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const statePath = path.join(root, e.name, 'state.json');
    if (!fs.existsSync(statePath)) continue;
    let state;
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch (err) {
      runs.push({ slug: e.name, error: `invalid state.json: ${err.message}` });
      continue;
    }
    if (o.workflow && state.workflow !== o.workflow) continue;
    if (o.status && state.status !== o.status) continue;
    runs.push({
      slug: e.name,
      workflow: state.workflow || null,
      milestone: state.milestone || null,
      status: state.status || null,
      current_phase: state.current_phase || null,
      updated: state.updated || null,
    });
  }
  runs.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  return { ok: true, runs };
}

/**
 * Get state for a single run.
 * @param {string} slug
 * @param {{ projectDir?: string }} [opts]
 */
function singleRunStatus(slug, opts) {
  const o = opts || {};
  try {
    const state = supervisor.readState(slug, { projectDir: o.projectDir });
    return { ok: true, slug, state };
  } catch (e) {
    return { ok: false, slug, error: e.message };
  }
}

module.exports = { abandon, list, singleRunStatus };
