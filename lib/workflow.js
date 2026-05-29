'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { resolvePhaseTemplateRef } = require('./phase-template-resolver');
const { expandWorkflowTemplate, interpolateConfigTokens } = require('./workflow-template-expand');
const { NAMESPACE_SEPARATOR } = require('./workflow-template-loader');
const { substituteArgs } = require('./template-substitute');

const ALLOWED_BINDS = ['milestone', 'phase', 'custom', 'quick'];
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

// Lazily-computed set of routing-key names (e.g. 'plan', 'execute',
// 'brainstorm'). Sourced from the default superpowers provider's skill
// map in templates/config.json so this stays in sync with the canonical
// vocabulary as new keys are added there.
let _knownRoutingKeys = null;
function getKnownRoutingKeys() {
  if (_knownRoutingKeys !== null) return _knownRoutingKeys;
  const keys = new Set();
  try {
    const provider = require('./provider');
    const defaults = provider.loadDefaults();
    const providers = (defaults && defaults.cp && defaults.cp.providers) || {};
    for (const provName of Object.keys(providers)) {
      const skills = (providers[provName] && providers[provName].skills) || {};
      for (const k of Object.keys(skills)) keys.add(k);
    }
  } catch (_e) {
    // If defaults can't load (corrupt install), fall back to the known
    // set so validation still works.
    [
      'brainstorm', 'plan', 'execute', 'execute_simple',
      'review', 'receive_review', 'finish', 'worktree',
      'tdd', 'debug', 'verify',
    ].forEach((k) => keys.add(k));
  }
  _knownRoutingKeys = keys;
  return keys;
}

function loadTemplate(nameOrPath, opts) {
  const templatePath = isPathLike(nameOrPath)
    ? path.resolve(process.cwd(), nameOrPath)
    : resolveTemplate(nameOrPath, opts);

  const content = fs.readFileSync(templatePath, 'utf8');
  let parsed;
  try {
    parsed = yaml.parse(content);
  } catch (err) {
    throw new Error(`Template parse error in ${templatePath}: ${err.message || String(err)}`);
  }

  const source = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const meta = {};
  for (const key of Object.keys(source)) {
    if (key === 'principles' || key === 'defaults' || key === 'phases') continue;
    if (key === 'workflow' || key === 'version' || key === 'binds_to' || isScalar(source[key])) {
      meta[key] = source[key];
    }
  }
  if (!Object.prototype.hasOwnProperty.call(meta, 'binds_to')) {
    meta.binds_to = 'quick';
  } else if (meta.binds_to === 'custom') {
    // 51-03: 'custom' is the legacy alias for 'quick'. Normalize silently
    // so downstream code only sees 'quick'. The user-facing deprecation
    // warning is emitted by lib/custom.js when legacy .planning/custom/
    // directories are actually read.
    meta.binds_to = 'quick';
  }

  const phases = Array.isArray(source.phases) ? source.phases.map(normalisePhase) : source.phases;
  const resolverWarnings = [];
  const resolverErrors = [];

  // Phase 70: top-level workflow params. The template author can declare
  // a `params:` array (same shape as workflow-template params: {name,
  // default}). For each entry we interpolate `${config.<path>}` tokens
  // in the default, then substitute `{{name}}` tokens throughout every
  // top-level phase body. Tokens declared but unused are silently
  // tolerated; tokens used but undeclared throw a clear error citing
  // the template name. Caller-supplied overrides are NOT supported at
  // this layer (a top-level run has no caller); use workflow-template
  // inclusion if you need override capability.
  const topLevelParams = Array.isArray(source.params) ? source.params : [];
  const topLevelDefaults = {};
  if (topLevelParams.length > 0) {
    const projectDir = (opts && opts.projectDir) ? opts.projectDir : process.cwd();
    const cfg = (opts && opts.cfg !== undefined) ? opts.cfg : loadConfigSafe(projectDir);
    const templateName = isPathLike(nameOrPath) ? path.basename(nameOrPath, path.extname(nameOrPath)) : String(nameOrPath);
    for (const p of topLevelParams) {
      if (!p || typeof p !== 'object' || typeof p.name !== 'string') continue;
      if (Object.prototype.hasOwnProperty.call(p, 'default')) {
        try {
          topLevelDefaults[p.name] = interpolateConfigTokens(p.default, cfg, { templateName });
        } catch (err) {
          resolverErrors.push(
            `top-level params: '${p.name}': ${err && err.message ? err.message : String(err)}`
          );
        }
      } else {
        resolverErrors.push(
          `top-level params: '${p.name}' has no default (top-level params must supply defaults; required params are only meaningful for workflow-templates)`
        );
      }
    }
    if (Array.isArray(phases) && resolverErrors.length === 0) {
      for (let i = 0; i < phases.length; i++) {
        try {
          phases[i] = substituteArgs(phases[i], topLevelDefaults, {
            templateName,
            allowUndeclared: true,
          });
        } catch (err) {
          resolverErrors.push(
            `phases[${i}]: top-level param substitution failed: ${err && err.message ? err.message : String(err)}`
          );
        }
      }
    }
  }

  // v1.4 Decision #1: inline phase_templates: / workflow_templates: blocks.
  // Build name→definition maps; the resolver consults these before falling
  // back to project/builtin disk lookups.
  const inlinePhaseTemplates = parseInlinePhaseTemplates(
    source.phase_templates, resolverErrors
  );
  const inlineWorkflowTemplates = parseInlineWorkflowTemplates(
    source.workflow_templates, resolverErrors
  );

  if (Array.isArray(phases)) {
    const projectDir = (opts && opts.projectDir) ? opts.projectDir : process.cwd();
    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i];
      if (!ph || typeof ph !== 'object' || Array.isArray(ph)) continue;
      if (ph._wrapperKind === 'template') continue; // workflow-template inclusion → pass 2 below
      if (!Object.prototype.hasOwnProperty.call(ph, 'template')) continue;
      try {
        const result = resolvePhaseTemplateRef(ph, { projectDir, inlinePhaseTemplates });
        // Preserve the wrapper-kind marker: the entry was a `phase:`
        // wrapper carrying a `template:` ref; the resolved body inherits
        // that classification so description-required checks still apply.
        Object.defineProperty(result.phase, '_wrapperKind', {
          value: 'phase',
          enumerable: false,
          writable: false,
          configurable: false,
        });
        phases[i] = result.phase;
        if (Array.isArray(result.warnings)) {
          for (const w of result.warnings) resolverWarnings.push(w);
        }
      } catch (err) {
        // Leave the wrapper unresolved; validate()'s phase-template-ref
        // branch will surface field-rules / shape errors. The resolution
        // failure itself is captured as a validate-level error so the
        // caller still sees the root cause.
        resolverErrors.push(
          `phases[${i}] (id: '${ph.id}'): phase-template resolution failed: ${err && err.message ? err.message : String(err)}`
        );
      }
    }

    // Pass 2 (Phase 55-03): expand workflow-template inclusion entries.
    // We walk in order and splice expanded phase lists in place. Track
    // group-handle → exit ids so the third pass can rewrite outside
    // `after: <groupId>` refs into `after: [<every exit phase>]`.
    const groupExits = new Map(); // groupId → exitIds[]
    const collisionIds = new Set();
    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i];
      if (!ph || typeof ph !== 'object' || Array.isArray(ph)) continue;
      if (ph._wrapperKind !== 'template') continue;
      try {
        const result = expandWorkflowTemplate(ph, { projectDir, inlineWorkflowTemplates });
        // Collision: group handle id colliding with any sibling id, or any
        // produced prefixed id colliding with any existing id.
        const otherIds = new Set();
        for (let j = 0; j < phases.length; j++) {
          if (j === i) continue;
          const other = phases[j];
          if (other && typeof other === 'object' && typeof other.id === 'string') {
            otherIds.add(other.id);
          }
        }
        if (otherIds.has(ph.id)) {
          collisionIds.add(ph.id);
          resolverErrors.push(
            `phases[${i}] (id: '${ph.id}'): workflow-template group-handle id collides with another phase id`
          );
        }
        for (const np of result.phases) {
          if (otherIds.has(np.id)) {
            collisionIds.add(np.id);
            resolverErrors.push(
              `phases[${i}] (id: '${ph.id}'): expanded phase id '${np.id}' collides with another phase id`
            );
          }
          // Mark expanded phases as `phase:` kind so validate() enforces
          // description: on them (Decision #2 applies to every phase).
          if (!Object.getOwnPropertyDescriptor(np, '_wrapperKind')) {
            Object.defineProperty(np, '_wrapperKind', {
              value: 'phase',
              enumerable: false,
              writable: false,
              configurable: false,
            });
          }
        }
        groupExits.set(ph.id, result.exitIds);
        if (Array.isArray(result.warnings)) {
          for (const w of result.warnings) resolverWarnings.push(w);
        }
        // Splice in place (replace the wrapper with the expanded list).
        phases.splice(i, 1, ...result.phases);
        i += result.phases.length - 1;
      } catch (err) {
        resolverErrors.push(
          `phases[${i}] (id: '${ph.id}'): workflow-template expansion failed: ${err && err.message ? err.message : String(err)}`
        );
      }
    }

    // Pass 3: rewrite outside refs to group handles. Any `after:` or
    // `depends_on:` element that matches a known group id is replaced
    // by that group's exit-phase id list (flatten + dedup).
    if (groupExits.size > 0) {
      for (let i = 0; i < phases.length; i++) {
        const ph = phases[i];
        if (!ph || typeof ph !== 'object' || Array.isArray(ph)) continue;
        if (Array.isArray(ph.after)) {
          ph.after = rewriteGroupRefs(ph.after, groupExits);
        }
        if (Array.isArray(ph.depends_on)) {
          ph.depends_on = rewriteGroupRefs(ph.depends_on, groupExits);
        }
      }
    }
  }

  return {
    meta,
    principles: Object.prototype.hasOwnProperty.call(source, 'principles') ? source.principles : [],
    defaults: Object.prototype.hasOwnProperty.call(source, 'defaults') ? source.defaults : {},
    params: topLevelParams,
    phases,
    _resolverWarnings: resolverWarnings,
    _resolverErrors: resolverErrors,
  };
}

function loadConfigSafe(projectDir) {
  try {
    const p = path.join(projectDir, '.planning', 'config.json');
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

function validate(template) {
  const warnings = [];
  const errors = [];
  const safeTemplate = template && typeof template === 'object' ? template : {};
  const meta = safeTemplate.meta && typeof safeTemplate.meta === 'object' ? safeTemplate.meta : {};

  if (Array.isArray(safeTemplate._resolverWarnings)) {
    for (const w of safeTemplate._resolverWarnings) warnings.push(w);
  }
  if (Array.isArray(safeTemplate._resolverErrors)) {
    for (const e of safeTemplate._resolverErrors) errors.push(e);
  }

  if (!isNonEmptyString(meta.workflow)) {
    errors.push('meta.workflow must be a non-empty string');
  }

  if (!Number.isInteger(meta.version)) {
    errors.push('meta.version must be an integer');
  }

  if (
    Object.prototype.hasOwnProperty.call(meta, 'binds_to') &&
    !ALLOWED_BINDS.includes(meta.binds_to)
  ) {
    errors.push('meta.binds_to must be one of: milestone, phase, quick (custom is a deprecated alias for quick)');
  }

  // v1.4 Decision #6: opt-in agentic supervisor.
  if (Object.prototype.hasOwnProperty.call(meta, 'supervised')) {
    if (typeof meta.supervised !== 'boolean') {
      errors.push(`meta.supervised must be a boolean (got ${typeof meta.supervised})`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(safeTemplate, 'principles')) {
    if (!Array.isArray(safeTemplate.principles)) {
      errors.push('principles must be an array');
    } else {
      for (let i = 0; i < safeTemplate.principles.length; i++) {
        if (typeof safeTemplate.principles[i] !== 'string') {
          errors.push(`principles[${i}] must be a string`);
        }
      }
      if (safeTemplate.principles.length > 10) {
        warnings.push(`principles: ${safeTemplate.principles.length} entries (>10 risks cognitive overload)`);
      }
    }
  }

  if (!Array.isArray(safeTemplate.phases) || safeTemplate.phases.length === 0) {
    errors.push('phases must be a non-empty array');
    return { ok: errors.length === 0, warnings, errors };
  }

  const ids = new Map();
  const phaseInfos = [];
  let templatesPresent = false;

  for (let i = 0; i < safeTemplate.phases.length; i++) {
    const phase = safeTemplate.phases[i];
    const isObject = phase && typeof phase === 'object' && !Array.isArray(phase);
    const id = isObject ? phase.id : undefined;
    const isTemplateEntry = isObject && phase._wrapperKind === 'template';
    let validId = false;
    let dependsArray = true;
    let depends = [];
    let depsAllStrings = true;
    let parentSet = false;
    let parent;
    let afterSet = false;
    let after = [];

    if (!isNonEmptyString(id)) {
      errors.push(`phases[${i}] must have a non-empty string id`);
    } else {
      validId = true;
      if (ids.has(id)) {
        errors.push(`Duplicate phase id: '${id}' at indices ${ids.get(id)} and ${i}`);
      } else {
        ids.set(id, i);
      }
    }

    // v1.4 Decision #1: top-level phases:[] entries must be wrapped in
    // `phase:` or `template:`. Bare-form entries (the v1.3 shape) are
    // rejected. `_wrapperKind` is set by normalisePhase during YAML
    // load; entries supplied programmatically (no _wrapperKind) are
    // accepted for back-compat with lib callers and tests.
    if (isObject && phase._wrapperKind === 'bare') {
      errors.push(
        `phases[${i}]${validId ? ` (id: '${id}')` : ''}: bare-form phase entry no longer accepted in v1.4 — wrap in 'phase:' (see MIGRATION-v1.4.md)`
      );
    }

    // v1.4 Decision #2: description: is required on every phase entry
    // (workflow-template inclusion entries are exempt — the description
    // belongs to the template's own phases). Enforced only on YAML-loaded
    // entries (_wrapperKind === 'phase'); programmatic callers stay
    // back-compat.
    if (isObject && phase._wrapperKind === 'phase' && !isNonEmptyString(phase.description)) {
      errors.push(
        `phases[${i}]${validId ? ` (id: '${id}')` : ''}: missing required 'description' (non-empty string)`
      );
    }

    if (isTemplateEntry) {
      // v1.3: workflow-template inclusion. Successful expansion replaces
      // the wrapper before validate() runs (see Pass 2 in loadTemplate).
      // If we still see a template entry here, expansion failed —
      // _resolverErrors already carries the root cause; field-rules
      // below help diagnose why.
      templatesPresent = true;

      // 53-03: field-rules for workflow-template inclusion.
      // Allowed keys: id, name, args, after. depends_on is auto-added by
      // normalisePhase and is only flagged when user-populated.
      const allowedTpl = new Set(['id', 'name', 'args', 'after', 'depends_on']);
      if (!isNonEmptyString(phase.name)) {
        errors.push(
          `phases[${i}] (id: '${id}'): workflow-template inclusion requires a non-empty string 'name'`
        );
      }
      if (Object.prototype.hasOwnProperty.call(phase, 'args')) {
        const args = phase.args;
        if (args === null || typeof args !== 'object' || Array.isArray(args)) {
          errors.push(`phases[${i}] (id: '${id}'): args must be an object`);
        }
      }
      for (const key of Object.keys(phase)) {
        if (!allowedTpl.has(key)) {
          errors.push(
            `phases[${i}] (id: '${id}'): '${key}' not allowed on workflow-template inclusion (allowed: id, name, args, after)`
          );
        }
      }
      if (Array.isArray(phase.depends_on) && phase.depends_on.length > 0) {
        errors.push(
          `phases[${i}] (id: '${id}'): 'depends_on' not allowed on workflow-template inclusion (use 'after')`
        );
      }

      if (isObject && Object.prototype.hasOwnProperty.call(phase, 'after') && Array.isArray(phase.after)) {
        afterSet = true;
        after = phase.after;
      }

      phaseInfos.push({
        i,
        id,
        validId,
        phase,
        depends,
        dependsArray,
        depsAllStrings,
        parentSet,
        parent,
        afterSet,
        after,
        isTemplateEntry: true,
      });
      continue;
    }

    // 53-03: phase-template reference detection.
    // A `phase:` wrapper (kind='phase') with an inner `template:` field
    // references a phase template (Phase 54 will resolve it). Field-rules
    // restrict the phase to id/template/after only — no inline overrides.
    const isPhaseTemplateRef = isObject &&
      Object.prototype.hasOwnProperty.call(phase, 'template') &&
      !isTemplateEntry;
    if (isPhaseTemplateRef) {
      // Successful phase-template resolution replaces the wrapper before
      // validate() runs (see Pass 1 in loadTemplate). If we still see a
      // phase-template ref here, resolution failed — _resolverErrors
      // carries the root cause; field-rules below help diagnose why.
      templatesPresent = true;

      const t = phase.template;
      if (t === null || typeof t !== 'object' || Array.isArray(t)) {
        errors.push(`phases[${i}] (id: '${id}'): inner 'template' must be an object`);
      } else {
        if (!isNonEmptyString(t.name)) {
          errors.push(`phases[${i}] (id: '${id}'): template.name must be a non-empty string`);
        }
        if (Object.prototype.hasOwnProperty.call(t, 'args')) {
          const args = t.args;
          if (args === null || typeof args !== 'object' || Array.isArray(args)) {
            errors.push(`phases[${i}] (id: '${id}'): template.args must be an object`);
          }
        }
        for (const tk of Object.keys(t)) {
          if (tk !== 'name' && tk !== 'args') {
            errors.push(
              `phases[${i}] (id: '${id}'): template.${tk} not allowed (only name, args)`
            );
          }
        }
      }

      const allowedPhaseRef = new Set(['id', 'description', 'template', 'after', 'depends_on']);
      for (const key of Object.keys(phase)) {
        if (!allowedPhaseRef.has(key)) {
          errors.push(
            `phases[${i}] (id: '${id}'): '${key}' not allowed on a phase that references a template; fork the template instead`
          );
        }
      }
      if (Array.isArray(phase.depends_on) && phase.depends_on.length > 0) {
        errors.push(
          `phases[${i}] (id: '${id}'): 'depends_on' not allowed on a phase that references a template (use 'after')`
        );
      }

      if (Object.prototype.hasOwnProperty.call(phase, 'after') && Array.isArray(phase.after)) {
        afterSet = true;
        after = phase.after;
      }

      phaseInfos.push({
        i,
        id,
        validId,
        phase,
        depends,
        dependsArray,
        depsAllStrings,
        parentSet,
        parent,
        afterSet,
        after,
        isTemplateEntry: true,
      });
      continue;
    }

    if (isObject && Object.prototype.hasOwnProperty.call(phase, 'depends_on')) {
      if (!Array.isArray(phase.depends_on)) {
        dependsArray = false;
        errors.push(`phases[${i}] (id: '${id}'): depends_on must be an array`);
      } else {
        depends = phase.depends_on;
        for (let j = 0; j < depends.length; j++) {
          if (typeof depends[j] !== 'string') {
            depsAllStrings = false;
            errors.push(`phases[${i}] (id: '${id}'): depends_on[${j}] must be a string`);
          }
        }
      }
    }

    if (isObject && Object.prototype.hasOwnProperty.call(phase, 'parent')) {
      parentSet = true;
      parent = phase.parent;
    }

    if (isObject && Object.prototype.hasOwnProperty.call(phase, 'after') && Array.isArray(phase.after)) {
      afterSet = true;
      after = phase.after;
    }

    phaseInfos.push({
      i,
      id,
      validId,
      phase: isObject ? phase : {},
      depends,
      dependsArray,
      depsAllStrings,
      parentSet,
      parent,
      afterSet,
      after,
      isTemplateEntry: false,
    });
  }

  for (const info of phaseInfos) {
    if (info.isTemplateEntry) continue;
    if (!info.validId || !info.dependsArray || !info.depsAllStrings) continue;
    for (const dep of info.depends) {
      if (typeof dep === 'string' && !ids.has(dep)) {
        errors.push(`phases[${info.i}] (id: '${info.id}'): depends_on references unknown phase '${dep}'`);
      }
    }
  }

  validateV12Schema(phaseInfos.filter(function (info) { return !info.isTemplateEntry; }), warnings, errors);

  const canAnalyzeGraph = !templatesPresent && phaseInfos.every(function (info) {
    return info.validId && info.dependsArray && info.depsAllStrings &&
      info.depends.every(function (dep) { return ids.has(dep); });
  }) && ids.size === phaseInfos.length;

  if (canAnalyzeGraph) {
    const cycle = findCycle(phaseInfos);
    if (cycle) {
      errors.push(`Cycle detected: ${cycle.join(' → ')}`);
    }

    const topo = topoSortIds(phaseInfos);
    if (topo.length === phaseInfos.length) {
      const fileOrder = phaseInfos.map(function (info) { return info.id; });
      if (!deepEquals(topo, fileOrder)) {
        warnings.push(`Phases not in topological order; suggested order: ${topo.join(', ')}`);
      }
    }
  }

  return { ok: errors.length === 0, warnings, errors };
}

function validateV12Schema(phaseInfos, warnings, errors) {
  const infosById = new Map();
  const referencedParentIds = new Set();

  for (const info of phaseInfos) {
    if (info.validId && !infosById.has(info.id)) infosById.set(info.id, info);
    if (info.parentSet) referencedParentIds.add(info.parent);
  }

  for (const info of phaseInfos) {
    const phase = info.phase;
    const hasMax = Object.prototype.hasOwnProperty.call(phase, 'max_children');
    const hasMin = Object.prototype.hasOwnProperty.call(phase, 'min_children');
    const isParentPhase = info.validId && referencedParentIds.has(info.id);
    const maxValid = !hasMax || isPositiveInteger(phase.max_children);
    const minValid = !hasMin || isPositiveInteger(phase.min_children);

    if (info.parentSet) {
      const parentInfo = infosById.get(info.parent);
      if (!parentInfo) {
        errors.push(`phase '${info.id}' has unknown parent '${info.parent}'`);
      } else if (parentInfo.parentSet) {
        errors.push(`phase '${info.id}' is a grandchild of '${parentInfo.parent}' via '${info.parent}'; v1.2 allows only one level of nesting`);
      }
    }

    if ((hasMax || hasMin) && !isParentPhase) {
      warnings.push(`phase '${info.id}' sets max_children/min_children but is not a parent phase`);
    }

    if (hasMax && !maxValid) {
      errors.push(`phase '${info.id}' max_children must be a positive integer (got ${String(phase.max_children)})`);
    }
    if (hasMin && !minValid) {
      errors.push(`phase '${info.id}' min_children must be a positive integer (got ${String(phase.min_children)})`);
    }

    if (isParentPhase && maxValid && minValid) {
      const max = hasMax ? phase.max_children : 10;
      const min = hasMin ? phase.min_children : 1;
      if (max < min) {
        errors.push(`phase '${info.id}' has max_children (${max}) < min_children (${min})`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(phase, 'persist') && typeof phase.persist !== 'boolean') {
      errors.push(`phase '${info.id}' persist must be boolean (got ${typeof phase.persist})`);
    }

    // v1.4 Decision #1/#3: phase `kind:` field. Default 'skill' (legacy
    // behavior — delegate to a provider skill). 'scaffold' means the engine
    // runs a deterministic command instead of an LLM skill; in that mode
    // `command:` is required and `role:`/`skill:` are meaningless. Any other
    // value is rejected.
    if (Object.prototype.hasOwnProperty.call(phase, 'kind')) {
      const k = phase.kind;
      if (k !== 'skill' && k !== 'scaffold') {
        errors.push(
          `phase '${info.id}' kind must be 'skill' or 'scaffold' (got ${JSON.stringify(k)})`
        );
      } else if (k === 'scaffold') {
        if (!Object.prototype.hasOwnProperty.call(phase, 'command')
            || typeof phase.command !== 'string'
            || phase.command.trim() === '') {
          errors.push(
            `phase '${info.id}' kind=scaffold requires a non-empty command: string`
          );
        }
        if (Object.prototype.hasOwnProperty.call(phase, 'skill')) {
          warnings.push(
            `phase '${info.id}' has both kind=scaffold and skill:; skill is ignored when kind=scaffold`
          );
        }
        if (Object.prototype.hasOwnProperty.call(phase, 'role')) {
          warnings.push(
            `phase '${info.id}' has both kind=scaffold and role:; role is ignored when kind=scaffold`
          );
        }
      } else if (k === 'skill') {
        // skill kind: command: is meaningless
        if (Object.prototype.hasOwnProperty.call(phase, 'command')) {
          warnings.push(
            `phase '${info.id}' has command: but kind=skill; command is ignored unless kind=scaffold`
          );
        }
      }
    } else if (Object.prototype.hasOwnProperty.call(phase, 'command')) {
      // No kind set, but command present → infer scaffold? No — require
      // explicit kind. Warn so the user catches it.
      warnings.push(
        `phase '${info.id}' has command: but no kind: — set kind: scaffold to use it`
      );
    }

    // v1.5: role/skill orthogonality (runs whenever phase is skill-kind,
    // including the default no-kind case). role is persona-only; skill is
    // the routing/literal selector. Skip when kind=scaffold.
    if (!Object.prototype.hasOwnProperty.call(phase, 'kind') || phase.kind === 'skill') {
      const routingKeys = getKnownRoutingKeys();
      const roleVal = (typeof phase.role === 'string') ? phase.role : null;
      const skillVal = (typeof phase.skill === 'string') ? phase.skill : null;
      if (roleVal && routingKeys.has(roleVal)) {
        if (skillVal && routingKeys.has(skillVal) && skillVal !== roleVal) {
          errors.push(
            `phase '${info.id}' has role '${roleVal}' and skill '${skillVal}' both as routing keys — they must agree (drop one or set role to a persona like 'developer')`
          );
        } else {
          warnings.push(
            `phase '${info.id}' role '${roleVal}' looks like a routing key — role is persona only; use skill: ${roleVal} instead and set role to a persona (e.g. developer, tech-writer)`
          );
        }
      }
    }

    // v1.4 Decision #3: materialize directive (parent-phase only).
    if (Object.prototype.hasOwnProperty.call(phase, 'materialize')) {
      const m = phase.materialize;
      if (m !== 'inline' && m !== 'roadmap-phases') {
        errors.push(
          `phase '${info.id}' materialize must be 'inline' or 'roadmap-phases' (got ${JSON.stringify(m)})`
        );
      } else if (!isParentPhase) {
        warnings.push(`phase '${info.id}' sets materialize but is not a parent phase`);
      }
    }

    // v1.4 Decision #8: declared writable output paths (under supervised:).
    if (Object.prototype.hasOwnProperty.call(phase, 'outputs')) {
      if (!Array.isArray(phase.outputs)) {
        errors.push(`phase '${info.id}' outputs must be an array of strings`);
      } else {
        for (let oi = 0; oi < phase.outputs.length; oi++) {
          if (typeof phase.outputs[oi] !== 'string' || phase.outputs[oi].length === 0) {
            errors.push(`phase '${info.id}' outputs[${oi}] must be a non-empty string`);
          }
        }
      }
    }
  }

  for (const info of phaseInfos) {
    if (!info.afterSet) continue;
    for (const dep of info.after) {
      const depInfo = infosById.get(dep);
      if (info.parentSet) {
        if (!depInfo || !depInfo.parentSet || depInfo.parent !== info.parent) {
          errors.push(`phase '${info.id}' after-dep '${dep}' is not a sibling under parent '${info.parent}'`);
        }
      } else if (depInfo && depInfo.parentSet) {
        errors.push(`phase '${info.id}' after-dep '${dep}' is a child phase; top-level after must reference top-level phases`);
      }
    }
  }
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function computeWaves(template) {
  const result = validate(template);
  if (result.errors.length > 0) {
    throw new Error(`Invalid workflow template: ${result.errors.join('; ')}`);
  }

  const phases = template.phases;
  const ids = phases.map(function (phase) { return phase.id; });
  const idToPhase = new Map();
  const indegree = new Map();
  const dependents = new Map();

  for (const phase of phases) {
    idToPhase.set(phase.id, phase);
    indegree.set(phase.id, 0);
    dependents.set(phase.id, []);
  }

  for (const phase of phases) {
    const deps = Array.isArray(phase.depends_on) ? phase.depends_on : [];
    for (const dep of deps) {
      indegree.set(phase.id, indegree.get(phase.id) + 1);
      dependents.get(dep).push(phase.id);
    }
  }

  const remaining = new Set(ids);
  const waves = [];

  while (remaining.size > 0) {
    const waveIds = ids.filter(function (id) {
      return remaining.has(id) && indegree.get(id) === 0;
    });

    if (waveIds.length === 0) {
      throw new Error('Cycle detected while computing workflow waves');
    }

    waves.push(waveIds.map(function (id) { return idToPhase.get(id); }));

    for (const id of waveIds) {
      remaining.delete(id);
      for (const next of dependents.get(id)) {
        indegree.set(next, indegree.get(next) - 1);
      }
    }
  }

  return waves;
}

function resolveTemplate(name, opts) {
  const projectDir = path.resolve((opts && opts.projectDir) || process.cwd());
  const repoRoot = path.resolve(__dirname, '..');
  const searched = [
    path.resolve(projectDir, '.planning', 'workflows', `${name}.yaml`),
    path.resolve(repoRoot, 'templates', 'workflows', `${name}.yaml`),
  ];

  for (const candidate of searched) {
    if (isFile(candidate)) return candidate;
  }

  throw new Error(`Template not found: ${name}. Searched: ${searched.join(', ')}`);
}

function isPathLike(nameOrPath) {
  return /[\\/]/.test(nameOrPath) || /\.ya?ml$/i.test(nameOrPath);
}

function isScalar(value) {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function rewriteGroupRefs(edges, groupExits) {
  if (!Array.isArray(edges)) return edges;
  const out = [];
  const seen = new Set();
  for (const e of edges) {
    if (typeof e === 'string' && groupExits.has(e)) {
      for (const t of groupExits.get(e)) {
        if (!seen.has(t)) { seen.add(t); out.push(t); }
      }
    } else if (!seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out;
}

function normalisePhase(phase, index) {
  const { kind, body } = unwrapPhaseEntry(phase);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return phase;
  const copy = Object.assign({}, body);
  // v1.4 Decision #1: every parsed phase entry carries its wrapper kind
  // so validate() can reject bare-form entries and enforce description:.
  Object.defineProperty(copy, '_wrapperKind', {
    value: kind,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  if (!Object.prototype.hasOwnProperty.call(copy, 'depends_on')) {
    copy.depends_on = [];
  }
  return copy;
}

// v1.4 Decision #1: parse the top-level `phase_templates:` block into a
// name→{name, params, body, sourcePath} map for the resolver to consult.
// On any structural problem, push an error and return an empty Map (the
// resolver then falls back to disk lookup).
function parseInlinePhaseTemplates(raw, errors) {
  const out = new Map();
  if (raw === undefined || raw === null) return out;
  if (!Array.isArray(raw)) {
    errors.push("phase_templates: must be an array of { name, ... } objects");
    return out;
  }
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      errors.push(`phase_templates[${i}]: must be an object`);
      continue;
    }
    if (typeof t.name !== 'string' || t.name.trim() === '') {
      errors.push(`phase_templates[${i}]: 'name' must be a non-empty string`);
      continue;
    }
    if (out.has(t.name)) {
      errors.push(`phase_templates: duplicate inline phase-template name '${t.name}'`);
      continue;
    }
    const params = Array.isArray(t.params) ? t.params.slice() : [];
    const body = {};
    for (const key of Object.keys(t)) {
      if (key === 'name' || key === 'params') continue;
      if (key === 'id' || key === 'depends_on') {
        errors.push(
          `phase_templates[${i}] (name='${t.name}'): body field '${key}' is supplied by the caller, not by the template`
        );
        continue;
      }
      body[key] = t[key];
    }
    out.set(t.name, {
      name: t.name,
      params,
      body,
      sourcePath: '<inline:phase_templates>',
    });
  }
  return out;
}

// v1.4 Decision #1: parse the top-level `workflow_templates:` block into a
// name→{name, params, phases, sourcePath} map for the expander to consult.
function parseInlineWorkflowTemplates(raw, errors) {
  const out = new Map();
  if (raw === undefined || raw === null) return out;
  if (!Array.isArray(raw)) {
    errors.push("workflow_templates: must be an array of { name, phases, ... } objects");
    return out;
  }
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      errors.push(`workflow_templates[${i}]: must be an object`);
      continue;
    }
    if (typeof t.name !== 'string' || t.name.trim() === '') {
      errors.push(`workflow_templates[${i}]: 'name' must be a non-empty string`);
      continue;
    }
    if (out.has(t.name)) {
      errors.push(`workflow_templates: duplicate inline workflow-template name '${t.name}'`);
      continue;
    }
    if (!Array.isArray(t.phases) || t.phases.length === 0) {
      errors.push(`workflow_templates[${i}] (name='${t.name}'): 'phases' must be a non-empty array`);
      continue;
    }
    const params = Array.isArray(t.params) ? t.params.slice() : [];
    out.set(t.name, {
      name: t.name,
      params,
      phases: t.phases.slice(),
      sourcePath: '<inline:workflow_templates>',
    });
  }
  return out;
}

// v1.3: detect the YAML wrapper shape of a single phases[] entry.
// Returns { kind, body } where:
//   kind = 'phase'    → entry was `{ phase: {...} }` or a bare v1.2 phase object
//   kind = 'template' → entry was `{ template: {...} }` (workflow-template inclusion)
// The bare and `phase:`-wrapped shapes produce structurally identical bodies so
// downstream code (validate/computeWaves/phasesFromTemplate) does not need to
// distinguish them. The `_wrapperKind` non-enumerable marker on the returned
// object signals the original wrapper kind for the validator + Phase-55
// expansion logic.
function unwrapPhaseEntry(entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { kind: 'bare', body: entry };
  }
  const keys = Object.keys(entry);
  if (keys.length === 1 && (keys[0] === 'phase' || keys[0] === 'template')) {
    return { kind: keys[0], body: entry[keys[0]] };
  }
  return { kind: 'bare', body: entry };
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    if (err && err.code === 'ENOTDIR') return false;
    throw err;
  }
}

function findCycle(phaseInfos) {
  const colors = new Map();
  const parents = new Map();
  const depsById = new Map();

  for (const info of phaseInfos) {
    colors.set(info.id, WHITE);
    depsById.set(info.id, info.depends);
  }

  for (const info of phaseInfos) {
    if (colors.get(info.id) === WHITE) {
      const cycle = dfsCycle(info.id, colors, parents, depsById);
      if (cycle) return cycle;
    }
  }

  return null;
}

function dfsCycle(id, colors, parents, depsById) {
  colors.set(id, GRAY);

  for (const dep of depsById.get(id)) {
    if (colors.get(dep) === WHITE) {
      parents.set(dep, id);
      const childCycle = dfsCycle(dep, colors, parents, depsById);
      if (childCycle) return childCycle;
    } else if (colors.get(dep) === GRAY) {
      return reconstructCycle(id, dep, parents);
    }
  }

  colors.set(id, BLACK);
  return null;
}

function reconstructCycle(from, to, parents) {
  const cycle = [to];
  let cursor = from;
  while (cursor !== to && cursor !== undefined) {
    cycle.push(cursor);
    cursor = parents.get(cursor);
  }
  cycle.push(to);
  return cycle.reverse();
}

function topoSortIds(phaseInfos) {
  const ids = phaseInfos.map(function (info) { return info.id; });
  const indegree = new Map();
  const dependents = new Map();

  for (const id of ids) {
    indegree.set(id, 0);
    dependents.set(id, []);
  }

  for (const info of phaseInfos) {
    for (const dep of info.depends) {
      indegree.set(info.id, indegree.get(info.id) + 1);
      dependents.get(dep).push(info.id);
    }
  }

  const queue = ids.filter(function (id) { return indegree.get(id) === 0; });
  const order = [];

  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const next of dependents.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  return order;
}

function deepEquals(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const persistOutputWarningWorkflows = new Set();

function phasesFromTemplate(template) {
  const safeTemplate = template && typeof template === 'object' ? template : {};
  const meta = safeTemplate.meta && typeof safeTemplate.meta === 'object' ? safeTemplate.meta : {};
  const workflowName = Object.prototype.hasOwnProperty.call(meta, 'workflow') ? String(meta.workflow) : 'unknown';
  const phases = Array.isArray(safeTemplate.phases) ? safeTemplate.phases : [];
  const parentIds = new Set();

  for (const phase of phases) {
    if (!phase || typeof phase !== 'object' || Array.isArray(phase)) continue;
    if (Object.prototype.hasOwnProperty.call(phase, 'parent') && phase.parent !== phase.id) {
      parentIds.add(phase.parent);
    }
  }

  return phases.map(function (phase) {
    const out = {
      id: phase.id,
      depends_on: Object.prototype.hasOwnProperty.call(phase, 'depends_on')
        ? copyArrayValue(phase.depends_on)
        : [],
      status: 'pending',
      persist: false,
    };
    const isParent = parentIds.has(phase.id);

    if (Object.prototype.hasOwnProperty.call(phase, 'persist_output')) {
      warnPersistOutputOnce(workflowName);
    }

    if (Object.prototype.hasOwnProperty.call(phase, 'persist')) {
      out.persist = phase.persist;
    } else if (Object.prototype.hasOwnProperty.call(phase, 'persist_output')) {
      out.persist = phase.persist_output;
    }

    if (Object.prototype.hasOwnProperty.call(phase, 'parent')) out.parent = phase.parent;
    if (Object.prototype.hasOwnProperty.call(phase, 'after')) out.after = copyArrayValue(phase.after);
    if (Object.prototype.hasOwnProperty.call(phase, 'role')) out.role = phase.role;
    if (Object.prototype.hasOwnProperty.call(phase, 'model')) out.model = phase.model;

    if (Object.prototype.hasOwnProperty.call(phase, 'max_children')) {
      out.max_children = phase.max_children;
    } else if (isParent) {
      out.max_children = 10;
    }

    if (Object.prototype.hasOwnProperty.call(phase, 'min_children')) {
      out.min_children = phase.min_children;
    } else if (isParent) {
      out.min_children = 1;
    }

    return out;
  });
}

function warnPersistOutputOnce(workflowName) {
  if (persistOutputWarningWorkflows.has(workflowName)) return;
  persistOutputWarningWorkflows.add(workflowName);
  console.warn(`[cp v1.2] persist_output: is deprecated in template ${workflowName}; use persist: instead`);
}

function copyArrayValue(value) {  return Array.isArray(value) ? value.slice() : value;
}

/**
 * v1.6 D1: Auto-inject a synthetic `finalize` scaffold phase when a loaded
 * template omits one. Mutates `template.phases` in place. Idempotent: a
 * second call is a no-op once a `finalize` phase exists. The injected
 * phase carries non-enumerable `_autoInjected` and `_wrapperKind` markers
 * so callers (e.g. `cp workflow inspect`) can surface its provenance.
 *
 * Callers must invoke this AFTER `loadTemplate` and BEFORE `validate` /
 * `computeWaves`. We do not invoke it from inside `loadTemplate` because
 * many tests and downstream tools rely on the raw template shape.
 *
 * @param {object} template Result of `loadTemplate`.
 * @returns {object} The same template (for chaining).
 */
function applyAutoInjectFinalize(template) {
  if (!template || typeof template !== 'object') return template;
  const phases = template.phases;
  if (!Array.isArray(phases) || phases.length === 0) return template;
  for (const p of phases) {
    if (p && typeof p === 'object' && !Array.isArray(p) && p.id === 'finalize') {
      return template;
    }
  }
  let lastId = null;
  for (let i = phases.length - 1; i >= 0; i--) {
    const p = phases[i];
    if (p && typeof p === 'object' && !Array.isArray(p) && typeof p.id === 'string') {
      lastId = p.id;
      break;
    }
  }
  const meta = template.meta || {};
  let command;
  switch (meta.binds_to) {
    case 'milestone':
      command = 'cp milestone-finalize {{milestone_slug}}';
      break;
    case 'quick':
      command = 'cp quick-finalize {{slug_with_date}}';
      break;
    default:
      command = 'cp run-finalize {{slug_with_date}}';
  }
  const injected = {
    id: 'finalize',
    description:
      'Auto-injected finalize phase. Closes the run by flipping STATE status '
      + 'to complete and writing the standard SUMMARY artifact for this '
      + 'workflow kind. The framework injects this automatically when the '
      + 'workflow YAML does not declare its own finalize phase.',
    depends_on: lastId ? [lastId] : [],
    kind: 'scaffold',
    command,
  };
  Object.defineProperty(injected, '_autoInjected', {
    value: true, enumerable: false, writable: false, configurable: false,
  });
  Object.defineProperty(injected, '_wrapperKind', {
    value: 'phase', enumerable: false, writable: false, configurable: false,
  });
  phases.push(injected);
  return template;
}

module.exports = {
  loadTemplate,
  validate,
  computeWaves,
  resolveTemplate,
  phasesFromTemplate,
  unwrapPhaseEntry,
  applyAutoInjectFinalize,
};
