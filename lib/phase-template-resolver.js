'use strict';

/**
 * Phase-template resolver (v1.3, Phase 54-03).
 *
 * Given a normalised phase entry that references a phase template
 * (i.e. carries an inner `template: { name, args? }` field), this module
 * loads the template, merges declared params with caller args, substitutes
 * `{{name}}` tokens throughout the body, splices in the caller-supplied
 * `id:` + `after:`, and returns the resolved phase.
 *
 * The resolver is pure — it does not mutate the input. Numeric/boolean
 * casts at the field boundary are handled here (DESIGN.md Q1).
 *
 * Chaining: if the resolved body itself carries an inner `template:`
 * (i.e. the phase template references another phase template), the
 * resolver recurses, up to MAX_DEPTH = 3 (DESIGN.md §"Depth cap").
 *
 * Warnings (unused caller args) are returned in the result envelope so
 * the caller can decide where to surface them. Errors throw.
 */

const { loadPhaseTemplate } = require('./phase-template-loader');
const { substituteArgs } = require('./template-substitute');

const MAX_DEPTH = 3;

// Phase fields whose post-substitution value should be cast away from a
// string when it originated as a whole-string `{{token}}`. The substitution
// engine already preserves the raw arg value for whole-string tokens; we
// only need to apply explicit numeric/boolean casts on the field shape.
const NUMERIC_FIELDS = new Set(['max_children', 'min_children']);
const BOOLEAN_FIELDS = new Set(['persist']);

function resolvePhaseTemplateRef(phaseEntry, opts) {
  if (!phaseEntry || typeof phaseEntry !== 'object' || Array.isArray(phaseEntry)) {
    throw new Error('resolvePhaseTemplateRef: phaseEntry must be an object');
  }
  const ref = phaseEntry.template;
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
    throw new Error(`resolvePhaseTemplateRef: phase '${phaseEntry.id}': inner 'template' must be an object`);
  }
  if (typeof ref.name !== 'string' || ref.name.trim() === '') {
    throw new Error(`resolvePhaseTemplateRef: phase '${phaseEntry.id}': template.name must be a non-empty string`);
  }

  const warnings = [];
  const resolvedBody = resolveBody(ref.name, ref.args, {
    projectDir: opts && opts.projectDir,
    inlinePhaseTemplates: opts && opts.inlinePhaseTemplates,
    depth: 1,
    chain: [ref.name],
    warningsOut: warnings,
    callerId: phaseEntry.id,
  });

  // Caller-supplied fields are spliced in AFTER resolution so they can
  // never be overridden by the template body.
  const out = Object.assign({}, resolvedBody);
  if (Object.prototype.hasOwnProperty.call(out, 'template')) {
    delete out.template;
  }
  if (Object.prototype.hasOwnProperty.call(out, 'id')) {
    delete out.id;
  }
  out.id = phaseEntry.id;
  if (Object.prototype.hasOwnProperty.call(phaseEntry, 'after') && Array.isArray(phaseEntry.after)) {
    out.after = phaseEntry.after.slice();
  }
  // depends_on is the canonical normalised-phase field (auto-added in
  // normalisePhase). Preserve whatever was on the wrapper (typically []).
  if (Object.prototype.hasOwnProperty.call(phaseEntry, 'depends_on')) {
    out.depends_on = Array.isArray(phaseEntry.depends_on)
      ? phaseEntry.depends_on.slice()
      : phaseEntry.depends_on;
  }

  applyFieldCasts(out);

  return { phase: out, warnings };
}

function resolveBody(templateName, callerArgs, ctx) {
  if (ctx.depth > MAX_DEPTH) {
    throw new Error(
      `Phase-template chain depth exceeds ${MAX_DEPTH}: ${ctx.chain.join(' -> ')}`
    );
  }
  const def = loadPhaseTemplate(templateName, {
    projectDir: ctx.projectDir,
    inlinePhaseTemplates: ctx.inlinePhaseTemplates,
  });

  const mergedArgs = mergeArgs(def, callerArgs, templateName);

  const usedArgs = new Set();
  const substituted = substituteArgs(def.body, mergedArgs, {
    templateName,
    usedArgs,
  });

  // Unused-arg warnings: keys in callerArgs that the body never referenced
  // AND that don't override a declared param's default (a caller passing
  // a value for a declared param is intentional, even if unused — that's
  // a template authoring smell, not a caller smell, so we still warn).
  const callerKeys = (callerArgs && typeof callerArgs === 'object' && !Array.isArray(callerArgs))
    ? Object.keys(callerArgs)
    : [];
  for (const k of callerKeys) {
    if (!usedArgs.has(k)) {
      ctx.warningsOut.push(
        `Phase-template '${templateName}' (caller phase '${ctx.callerId}'): arg '${k}' supplied but not referenced by the template body`
      );
    }
  }

  // Chained reference: the substituted body itself carries `template:`.
  if (substituted && typeof substituted === 'object' && !Array.isArray(substituted)
      && Object.prototype.hasOwnProperty.call(substituted, 'template')) {
    const innerRef = substituted.template;
    if (!innerRef || typeof innerRef !== 'object' || Array.isArray(innerRef)) {
      throw new Error(
        `Phase-template '${templateName}': inner 'template' must be an object`
      );
    }
    if (typeof innerRef.name !== 'string' || innerRef.name.trim() === '') {
      throw new Error(
        `Phase-template '${templateName}': inner template.name must be a non-empty string`
      );
    }
    const nextChain = ctx.chain.concat([innerRef.name]);
    return resolveBody(innerRef.name, innerRef.args, {
      projectDir: ctx.projectDir,
      inlinePhaseTemplates: ctx.inlinePhaseTemplates,
      depth: ctx.depth + 1,
      chain: nextChain,
      warningsOut: ctx.warningsOut,
      callerId: ctx.callerId,
    });
  }

  return substituted;
}

function mergeArgs(def, callerArgs, templateName) {
  const out = {};
  const params = Array.isArray(def.params) ? def.params : [];
  const caller = (callerArgs && typeof callerArgs === 'object' && !Array.isArray(callerArgs))
    ? callerArgs
    : {};

  // First, defaults from declared params.
  for (const p of params) {
    if (Object.prototype.hasOwnProperty.call(p, 'default')) {
      out[p.name] = p.default;
    }
  }
  // Then, caller args win — but only for declared params. Undeclared
  // args are still passed through (the substitution engine will surface
  // genuine `{{var}}` issues at the token level; unused-arg warnings
  // catch the cosmetic case).
  for (const k of Object.keys(caller)) {
    out[k] = caller[k];
  }

  // Missing required (no default + not in caller) → error.
  for (const p of params) {
    const hasDefault = Object.prototype.hasOwnProperty.call(p, 'default');
    const supplied = Object.prototype.hasOwnProperty.call(caller, p.name);
    if (!hasDefault && !supplied) {
      throw new Error(
        `Phase-template '${templateName}': required param '${p.name}' has no default and was not supplied by caller`
      );
    }
  }

  return out;
}

function applyFieldCasts(phase) {
  for (const k of Object.keys(phase)) {
    if (NUMERIC_FIELDS.has(k) && typeof phase[k] === 'string') {
      const n = Number(phase[k]);
      if (Number.isFinite(n)) phase[k] = n;
    } else if (BOOLEAN_FIELDS.has(k) && typeof phase[k] === 'string') {
      const s = phase[k].trim().toLowerCase();
      if (s === 'true') phase[k] = true;
      else if (s === 'false') phase[k] = false;
    }
  }
}

module.exports = {
  resolvePhaseTemplateRef,
  MAX_DEPTH,
};
