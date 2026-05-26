'use strict';

/**
 * Shared JSDoc types and runtime validators for unified phase objects.
 * The base Phase shape is shared by milestone and workflow layers.
 */

/**
 * @typedef {Object} Phase
 * @property {string} id Required. e.g. "47" (milestone) or "brainstorm" (workflow)
 * @property {string[]} depends_on Required. Other phase ids in the same DAG. Empty for roots.
 * @property {"pending"|"in-progress"|"complete"|"failed"} status Required.
 *
 * Milestone-layer extension fields (all optional on the base type):
 * @property {string[]} [plans]       e.g. ["47-01", "47-02"]
 * @property {string} [workflow]      Workflow template to use (Phase 50)
 * @property {string} [summary]       Path to phase SUMMARY.md
 * @property {string} [base_commit]   SHA at phase start
 *
 * Workflow-layer extension fields (all optional on the base type):
 * @property {string} [role]          Role name resolved via cp doctor
 * @property {string} [model]         Optional model override
 * @property {boolean} [persist_output]
 */

const VALID_STATUSES = ['pending', 'in-progress', 'complete', 'failed'];

/**
 * Validate that an object satisfies the Phase contract.
 *
 * Checks required fields only (id, depends_on, status). Layer-specific
 * extension fields are NOT enforced — they are documented in the typedef
 * for IDE help but optional at the type level.
 *
 * @param {unknown} obj
 * @returns {{ok: boolean, errors: string[]}}
 *   ok=true with errors=[] means valid.
 *   ok=false with errors=[...] means invalid; each error is a human-readable
 *   string describing one specific problem.
 */
function validatePhase(obj) {
  const errors = [];

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    errors.push('phase must be a non-null object');
    return { ok: false, errors };
  }

  if (typeof obj.id !== 'string' || obj.id.trim().length === 0) {
    errors.push('id must be a non-empty string');
  }

  if (!Array.isArray(obj.depends_on)) {
    errors.push('depends_on must be an array');
  } else {
    for (let i = 0; i < obj.depends_on.length; i++) {
      if (typeof obj.depends_on[i] !== 'string') {
        errors.push(`depends_on[${i}] must be a string`);
      }
    }
  }

  if (!VALID_STATUSES.includes(obj.status)) {
    errors.push(`status must be one of ${VALID_STATUSES.join('|')}, got: ${String(obj.status)}`);
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { validatePhase };
