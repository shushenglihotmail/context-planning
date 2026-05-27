'use strict';

/**
 * `{{name}}` substitution engine (Phase 54-02).
 *
 * Recursively walks any JSON-like value (string, number, boolean, null,
 * array, plain object). In every string it finds, replaces `{{name}}`
 * tokens with the corresponding value from `args`.
 *
 * Substitution rules per DESIGN.md Q1:
 *   - Strings: in-place replacement; multiple tokens supported per string.
 *   - Whole-string match (e.g. `"{{count}}"`) returns the raw `args` value
 *     when it is a non-string (so the caller can cast to number/boolean
 *     at the field boundary). Partial matches (e.g. `"x={{count}}"`) always
 *     coerce non-string values to their `String(...)` form.
 *   - Tokens accept whitespace inside the braces: `{{ name }}` is equivalent
 *     to `{{name}}`.
 *   - Arrays and plain objects: recursed.
 *   - Functions / non-plain objects: returned unchanged.
 *
 * Error / warning contract:
 *   - Undeclared reference (token not in args) → throws Error citing the
 *     template name (when provided via opts.templateName) and the token.
 *   - The walk tracks which args were referenced and exposes them via
 *     opts.usedArgs (a Set the caller may pre-allocate). The caller
 *     computes "unused args" by diffing the keys of args against the Set.
 */

const TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function substituteArgs(value, args, opts) {
  const safeArgs = (args && typeof args === 'object' && !Array.isArray(args)) ? args : {};
  const usedArgs = (opts && opts.usedArgs instanceof Set) ? opts.usedArgs : new Set();
  const templateName = (opts && opts.templateName) || '(anonymous template)';
  const ctx = { args: safeArgs, usedArgs, templateName };
  return walk(value, ctx);
}

function walk(value, ctx) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return substituteString(value, ctx);
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      out[i] = walk(value[i], ctx);
    }
    return out;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = walk(value[key], ctx);
    }
    return out;
  }
  // Numbers, booleans, dates, class instances, functions — leave alone.
  return value;
}

function substituteString(str, ctx) {
  // Whole-string match shortcut: preserve the raw `args` value so callers
  // (the resolver) can cast at the field boundary without re-parsing.
  TOKEN_RE.lastIndex = 0;
  const whole = TOKEN_RE.exec(str);
  if (whole && whole.index === 0 && whole[0].length === str.length) {
    const name = whole[1];
    if (!Object.prototype.hasOwnProperty.call(ctx.args, name)) {
      throw new Error(
        `Template '${ctx.templateName}': undeclared substitution {{${name}}}`
      );
    }
    ctx.usedArgs.add(name);
    return ctx.args[name];
  }

  // Mixed string — coerce every token value to its String() form. Resets
  // the regex's internal cursor because String.replace re-walks.
  return str.replace(TOKEN_RE, function (match, name) {
    if (!Object.prototype.hasOwnProperty.call(ctx.args, name)) {
      throw new Error(
        `Template '${ctx.templateName}': undeclared substitution {{${name}}}`
      );
    }
    ctx.usedArgs.add(name);
    const v = ctx.args[name];
    if (v === null || v === undefined) return '';
    return String(v);
  });
}

module.exports = {
  substituteArgs,
};
