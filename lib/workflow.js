'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

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

  return {
    meta,
    principles: Object.prototype.hasOwnProperty.call(source, 'principles') ? source.principles : [],
    defaults: Object.prototype.hasOwnProperty.call(source, 'defaults') ? source.defaults : {},
    phases: Array.isArray(source.phases) ? source.phases.map(normalisePhase) : source.phases,
  };
}

function validate(template) {
  const warnings = [];
  const errors = [];
  const safeTemplate = template && typeof template === 'object' ? template : {};
  const meta = safeTemplate.meta && typeof safeTemplate.meta === 'object' ? safeTemplate.meta : {};

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

  for (let i = 0; i < safeTemplate.phases.length; i++) {
    const phase = safeTemplate.phases[i];
    const isObject = phase && typeof phase === 'object' && !Array.isArray(phase);
    const id = isObject ? phase.id : undefined;
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
    });
  }

  for (const info of phaseInfos) {
    if (!info.validId || !info.dependsArray || !info.depsAllStrings) continue;
    for (const dep of info.depends) {
      if (typeof dep === 'string' && !ids.has(dep)) {
        errors.push(`phases[${info.i}] (id: '${info.id}'): depends_on references unknown phase '${dep}'`);
      }
    }
  }

  validateV12Schema(phaseInfos, warnings, errors);

  const canAnalyzeGraph = phaseInfos.every(function (info) {
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

function normalisePhase(phase) {
  if (!phase || typeof phase !== 'object' || Array.isArray(phase)) return phase;
  const copy = Object.assign({}, phase);
  if (!Object.prototype.hasOwnProperty.call(copy, 'depends_on')) {
    copy.depends_on = [];
  }
  return copy;
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
};
