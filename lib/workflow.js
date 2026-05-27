'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { resolvePhaseTemplateRef } = require('./phase-template-resolver');
const { expandWorkflowTemplate } = require('./workflow-template-expand');
const { NAMESPACE_SEPARATOR } = require('./workflow-template-loader');

const ALLOWED_BINDS = ['milestone', 'phase', 'custom', 'quick'];
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

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
  if (Array.isArray(phases)) {
    const projectDir = (opts && opts.projectDir) ? opts.projectDir : process.cwd();
    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i];
      if (!ph || typeof ph !== 'object' || Array.isArray(ph)) continue;
      if (ph._wrapperKind === 'template') continue; // workflow-template inclusion → pass 2 below
      if (!Object.prototype.hasOwnProperty.call(ph, 'template')) continue;
      try {
        const result = resolvePhaseTemplateRef(ph, { projectDir });
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
        const result = expandWorkflowTemplate(ph, { projectDir });
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
    phases,
    _resolverWarnings: resolverWarnings,
    _resolverErrors: resolverErrors,
  };
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

      const allowedPhaseRef = new Set(['id', 'template', 'after', 'depends_on']);
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
      const max = hasMax ? phase.max_children : 20;
      const min = hasMin ? phase.min_children : 1;
      if (max < min) {
        errors.push(`phase '${info.id}' has max_children (${max}) < min_children (${min})`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(phase, 'persist') && typeof phase.persist !== 'boolean') {
      errors.push(`phase '${info.id}' persist must be boolean (got ${typeof phase.persist})`);
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
  if (kind === 'template') {
    Object.defineProperty(copy, '_wrapperKind', {
      value: 'template',
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
  if (!Object.prototype.hasOwnProperty.call(copy, 'depends_on')) {
    copy.depends_on = [];
  }
  return copy;
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
    return { kind: 'phase', body: entry };
  }
  const keys = Object.keys(entry);
  if (keys.length === 1 && (keys[0] === 'phase' || keys[0] === 'template')) {
    return { kind: keys[0], body: entry[keys[0]] };
  }
  return { kind: 'phase', body: entry };
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
      out.max_children = 20;
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

function copyArrayValue(value) {
  return Array.isArray(value) ? value.slice() : value;
}

module.exports = {
  loadTemplate,
  validate,
  computeWaves,
  resolveTemplate,
  phasesFromTemplate,
  unwrapPhaseEntry,
};
