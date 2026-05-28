'use strict';

/**
 * v1.4 message-broker classifier helpers.
 *
 * Per Option A (DESIGN.md Decision #6), cp does NOT classify messages
 * itself — there is no embedded LLM. These helpers:
 *   - print the rubric (so the harness LLM can read it)
 *   - validate the shape of a classification produced by the harness
 *   - persist classifications to state.json (via lib/supervisor)
 *
 * Source of the rubric prose: commands/cp/classify.md
 */

const fs = require('fs');
const path = require('path');

const CLASSES = ['in-flow', 'side', 'control'];
const CONFIDENCES = ['L1', 'L2', 'L3'];

/**
 * Validate the shape of a classification object produced by the harness.
 *
 * @param {object} obj
 * @returns {{ok: boolean, errors: string[]}}
 */
function validateClassification(obj) {
  const errors = [];
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['classification must be a plain object'] };
  }
  if (typeof obj.user_message !== 'string' || obj.user_message.length === 0) {
    errors.push('user_message must be a non-empty string');
  }
  if (CLASSES.indexOf(obj.class) === -1) {
    errors.push(`class must be one of: ${CLASSES.join(', ')}`);
  }
  if (CONFIDENCES.indexOf(obj.confidence) === -1) {
    errors.push(`confidence must be one of: ${CONFIDENCES.join(', ')}`);
  }
  if (obj.rationale != null && typeof obj.rationale !== 'string') {
    errors.push('rationale, if present, must be a string');
  }
  if (obj.intent != null && typeof obj.intent !== 'string') {
    errors.push('intent, if present, must be a string');
  }
  if (obj.class === 'control' && (obj.intent == null || obj.intent === '')) {
    errors.push('intent is required when class=control');
  }
  if (obj.ts != null && typeof obj.ts !== 'string') {
    errors.push('ts, if present, must be an ISO timestamp string');
  }
  return { ok: errors.length === 0, errors: errors };
}

/**
 * Load the rubric prose from commands/cp/classify.md, falling back to a
 * short inline summary if the file is not present (e.g. fresh checkout
 * before cp init).
 *
 * @param {string} [projectDir]
 * @returns {string}
 */
function rubric(projectDir) {
  const root = projectDir || process.cwd();
  const p = path.join(root, 'commands', 'cp', 'classify.md');
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (_) {
    return [
      '# cp classify — rubric (fallback)',
      '',
      'class:       in-flow | side | control',
      'confidence:  L1 (act) | L2 (confirm) | L3 (menu)',
      '',
      'See commands/cp/classify.md for the full rubric.',
    ].join('\n');
  }
}

/**
 * Persist a classification entry to state.json under
 * phases.<phaseId>.classifier_history. Stamps `ts` if missing.
 *
 * @param {string} slug
 * @param {string} phaseId
 * @param {object} classification
 * @param {{ projectDir?: string, now?: Date }} [opts]
 * @returns {object} updated state
 */
function recordClassification(slug, phaseId, classification, opts) {
  const supervisor = require('./supervisor');
  const o = opts || {};
  const now = o.now instanceof Date ? o.now : new Date();
  if (typeof phaseId !== 'string' || phaseId.length === 0) {
    throw new Error('recordClassification: phaseId must be a non-empty string');
  }
  if (!/^[a-z0-9._-]+$/i.test(phaseId)) {
    throw new Error(`recordClassification: invalid phaseId: ${phaseId}`);
  }
  const v = validateClassification(classification);
  if (!v.ok) {
    throw new Error('invalid classification: ' + v.errors.join('; '));
  }
  const entry = Object.assign({}, classification);
  if (!entry.ts) entry.ts = now.toISOString();
  return supervisor.appendPath(
    slug,
    'phases.' + phaseId + '.classifier_history',
    entry,
    { projectDir: o.projectDir, now: now },
  );
}

module.exports = {
  CLASSES,
  CONFIDENCES,
  validateClassification,
  rubric,
  recordClassification,
};
