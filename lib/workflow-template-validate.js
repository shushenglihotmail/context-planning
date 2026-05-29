'use strict';

/**
 * Workflow / phase template parameterization validator (v1.7).
 *
 * Locked design (see .planning/milestones/template-parameterization-whitelist/DESIGN.md):
 *
 *   ALLOW tokens (${...} and {{...}}) in:
 *     skill, prompt, description, max_children, min_children
 *
 *   FORBID tokens in:
 *     id, parent, after, depends_on, optimizable, runner, outputs, title,
 *     require, invoke, config_fallback, completion
 *
 *   HARD BAN anywhere:
 *     {{x.y}} style "dotted" tokens (e.g. {{item.id}} — per-item identity is
 *     supplied by the supervisor's runtime context, not by template
 *     substitution).
 *     Any unresolved {{...}} after expansion.
 *
 * This module exports pure functions. It performs no I/O and has no side
 * effects.
 */

const ALLOWED_PARAM_FIELDS = Object.freeze([
  'skill',
  'role',
  'prompt',
  'description',
  'command',
  'outputs',
  'max_children',
  'min_children',
]);

const FORBIDDEN_PARAM_FIELDS = Object.freeze([
  'id',
  'parent',
  'after',
  'depends_on',
  'optimizable',
  'runner',
  'title',
  'require',
  'invoke',
  'config_fallback',
  'completion',
]);

// Simple token: {{name}} — single identifier, matches existing substituter.
const SIMPLE_TOKEN_RE = /\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/;

// Dotted token: {{foo.bar}} / {{x.y.z}} — never expandable, always forbidden.
const DOTTED_TOKEN_RE = /\{\{\s*[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+\s*\}\}/;

// Any {{...}} token (used post-expand to detect leftovers of either shape).
const ANY_BRACE_TOKEN_RE = /\{\{[^{}]*\}\}/;

// ${anything} config token.
const CONFIG_TOKEN_RE = /\$\{[^}]+\}/;

class TemplateValidationError extends Error {
  constructor({ filePath, phaseId, fieldPath, rule, token, message } = {}) {
    const msg = message || formatMessage({ filePath, phaseId, fieldPath, rule, token });
    super(msg);
    this.name = 'TemplateValidationError';
    this.filePath = filePath || null;
    this.phaseId = phaseId || null;
    this.fieldPath = fieldPath || null;
    this.rule = rule || null;
    this.token = token || null;
  }
}

function formatMessage({ filePath, phaseId, fieldPath, rule, token }) {
  const parts = ['Template validation failed'];
  if (filePath) parts.push(`in ${filePath}`);
  if (phaseId) parts.push(`(phase '${phaseId}')`);
  if (fieldPath) parts.push(`at '${fieldPath}'`);
  if (rule) parts.push(`[rule: ${rule}]`);
  if (token) parts.push(`token: ${token}`);
  return parts.join(' ');
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
}

/**
 * Walk a value (string / array / object). For each LEAF string, call
 * `visit(str, fieldPath)`. `visit` may throw to abort the walk.
 */
function walkLeaves(value, fieldPath, visit) {
  if (typeof value === 'string') {
    visit(value, fieldPath);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walkLeaves(value[i], `${fieldPath}[${i}]`, visit);
    }
    return;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      walkLeaves(value[key], fieldPath ? `${fieldPath}.${key}` : key, visit);
    }
  }
  // numbers, booleans, null, class instances → leave alone.
}

function findToken(str, re) {
  const m = re.exec(str);
  return m ? m[0] : null;
}

/**
 * Pre-expansion validation. Pass each phase body (the resolved YAML node:
 * `{id, prompt, after, ...}`) through this BEFORE substituting tokens.
 *
 * Throws TemplateValidationError on violation. Returns undefined on pass.
 *
 * opts:
 *   filePath:    source file path (for error context)
 *   phaseId:     explicit phase id (falls back to phase.id)
 *   skipFields:  array of top-level field names to skip entirely (e.g.
 *                engine-internal markers prefixed with '_')
 */
function validatePreExpand(phase, opts) {
  opts = opts || {};
  if (!isPlainObject(phase)) {
    // Nothing to validate; let the loader handle shape errors elsewhere.
    return;
  }
  const filePath = opts.filePath || null;
  const phaseId = opts.phaseId || (typeof phase.id === 'string' ? phase.id : null);
  const skipFields = new Set(opts.skipFields || []);

  for (const fieldName of Object.keys(phase)) {
    if (skipFields.has(fieldName)) continue;
    const value = phase[fieldName];

    walkLeaves(value, fieldName, (str, fieldPath) => {
      // 1. Hard ban on dotted tokens, regardless of field.
      const dotted = findToken(str, DOTTED_TOKEN_RE);
      if (dotted) {
        throw new TemplateValidationError({
          filePath,
          phaseId,
          fieldPath,
          rule: 'dotted-token-forbidden',
          token: dotted,
        });
      }
      // 2. Whitelist enforcement: tokens in non-allowed fields are rejected.
      if (!ALLOWED_PARAM_FIELDS.includes(fieldName)) {
        const simple = findToken(str, SIMPLE_TOKEN_RE);
        if (simple) {
          throw new TemplateValidationError({
            filePath,
            phaseId,
            fieldPath,
            rule: 'field-not-parameterizable',
            token: simple,
          });
        }
        const config = findToken(str, CONFIG_TOKEN_RE);
        if (config) {
          throw new TemplateValidationError({
            filePath,
            phaseId,
            fieldPath,
            rule: 'field-not-parameterizable',
            token: config,
          });
        }
      }
    });
  }
}

/**
 * Post-expansion validation. Pass each phase body through this AFTER all
 * substitution has run. Catches any leftover {{...}} token — including
 * undeclared simple tokens that survived `allowUndeclared: true` and any
 * dotted tokens that slipped through.
 *
 * `opts.allowedTokenNames` (Set<string> or Array<string>): names of
 * "supervisor-supplied" tokens that are allowed to remain after
 * expansion (the workflow author declared them in `params:` without
 * a default). Dotted tokens are NEVER allowed, regardless.
 *
 * Throws TemplateValidationError on violation. Returns undefined on pass.
 */
function validatePostExpand(phase, opts) {
  opts = opts || {};
  if (!isPlainObject(phase)) return;
  const filePath = opts.filePath || null;
  const phaseId = opts.phaseId || (typeof phase.id === 'string' ? phase.id : null);
  const skipFields = new Set(opts.skipFields || []);
  const allowedTokenNames =
    opts.allowedTokenNames instanceof Set
      ? opts.allowedTokenNames
      : new Set(Array.isArray(opts.allowedTokenNames) ? opts.allowedTokenNames : []);

  // Pattern to extract token name from "{{ name }}" — captures the name
  // for the allow-list check. Returns null for dotted tokens (those are
  // never allowed).
  const nameRe = /^\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/;

  for (const fieldName of Object.keys(phase)) {
    if (skipFields.has(fieldName)) continue;
    walkLeaves(phase[fieldName], fieldName, (str, fieldPath) => {
      // Find ALL leftover tokens; flag the first that isn't allow-listed.
      const re = /\{\{[^{}]*\}\}/g;
      let m;
      while ((m = re.exec(str)) !== null) {
        const token = m[0];
        const named = nameRe.exec(token);
        if (named && allowedTokenNames.has(named[1])) continue;
        throw new TemplateValidationError({
          filePath,
          phaseId,
          fieldPath,
          rule: 'unresolved-token',
          token,
        });
      }
    });
  }
}

module.exports = {
  validatePreExpand,
  validatePostExpand,
  TemplateValidationError,
  ALLOWED_PARAM_FIELDS,
  FORBIDDEN_PARAM_FIELDS,
  // Exported for advanced callers / tests:
  _internal: {
    SIMPLE_TOKEN_RE,
    DOTTED_TOKEN_RE,
    ANY_BRACE_TOKEN_RE,
    CONFIG_TOKEN_RE,
  },
};
