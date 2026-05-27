'use strict';

/**
 * Workflow-template loader (v1.3, Phase 55-01).
 *
 * Loads a multi-phase workflow template definition by name. The template
 * is a YAML file with the shape:
 *
 *   name: <template-name>            # required, descriptive identity
 *   params:                          # optional
 *     - name: <param-name>
 *       default: <value>             # optional; absence = required param
 *   phases:                          # required, non-empty
 *     - id: <internal-id>
 *       role: ...
 *       ...
 *     - id: <other-internal-id>
 *       after: [<internal-id>]      # internal edges allowed
 *
 * The template is NOT itself a runnable workflow — top-level `workflow:`
 * and `version:` are forbidden. Internal phase ids must not contain the
 * `--` separator (reserved for the namespace boundary applied by the
 * 55-02 expander).
 *
 * Lookup order (project shadows builtin) per DESIGN.md Q2:
 *   1. `<projectDir>/.planning/workflow-templates/<name>.yaml`
 *   2. `<repoRoot>/templates/workflow-templates/<name>.yaml`
 *
 * Inline workflow templates (declared alongside a workflow file via
 * `workflow_templates:`) are NOT handled here — those are inline-loader
 * territory and currently deferred.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const TEMPLATE_META_KEYS = new Set(['name', 'params', 'phases']);
const FORBIDDEN_TOP_LEVEL = new Set(['workflow', 'version', 'binds_to']);
const NAMESPACE_SEPARATOR = '--';

function loadWorkflowTemplate(name, opts) {
  const sourcePath = resolveWorkflowTemplate(name, opts);
  const content = fs.readFileSync(sourcePath, 'utf8');
  let parsed;
  try {
    parsed = yaml.parse(content);
  } catch (err) {
    throw new Error(
      `Workflow-template parse error in ${sourcePath}: ${err && err.message ? err.message : String(err)}`
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Workflow-template ${name} (${sourcePath}): top-level must be a YAML mapping`);
  }

  if (typeof parsed.name !== 'string' || parsed.name.trim() === '') {
    throw new Error(`Workflow-template ${name} (${sourcePath}): 'name' must be a non-empty string`);
  }

  for (const key of Object.keys(parsed)) {
    if (FORBIDDEN_TOP_LEVEL.has(key)) {
      throw new Error(
        `Workflow-template ${name} (${sourcePath}): top-level '${key}' is forbidden (workflow templates are not runnable on their own)`
      );
    }
  }

  if (!Array.isArray(parsed.phases) || parsed.phases.length === 0) {
    throw new Error(
      `Workflow-template ${name} (${sourcePath}): 'phases' must be a non-empty array`
    );
  }

  const params = normaliseParams(parsed.params, name, sourcePath);
  const phases = validatePhases(parsed.phases, name, sourcePath);

  return {
    name: parsed.name,
    params,
    phases,
    sourcePath,
  };
}

function normaliseParams(rawParams, templateName, sourcePath) {
  if (rawParams === undefined || rawParams === null) return [];
  if (!Array.isArray(rawParams)) {
    throw new Error(
      `Workflow-template ${templateName} (${sourcePath}): 'params' must be an array of { name, default? } objects`
    );
  }
  const seen = new Set();
  const out = [];
  for (let i = 0; i < rawParams.length; i++) {
    const p = rawParams[i];
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      throw new Error(
        `Workflow-template ${templateName} (${sourcePath}): params[${i}] must be an object with a 'name' field`
      );
    }
    if (typeof p.name !== 'string' || p.name.trim() === '') {
      throw new Error(
        `Workflow-template ${templateName} (${sourcePath}): params[${i}].name must be a non-empty string`
      );
    }
    if (seen.has(p.name)) {
      throw new Error(
        `Workflow-template ${templateName} (${sourcePath}): duplicate param name '${p.name}'`
      );
    }
    seen.add(p.name);
    const entry = { name: p.name };
    if (Object.prototype.hasOwnProperty.call(p, 'default')) {
      entry.default = p.default;
    }
    out.push(entry);
  }
  return out;
}

function validatePhases(rawPhases, templateName, sourcePath) {
  const seenIds = new Set();
  const out = [];
  for (let i = 0; i < rawPhases.length; i++) {
    const p = rawPhases[i];
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      throw new Error(
        `Workflow-template ${templateName} (${sourcePath}): phases[${i}] must be an object`
      );
    }
    // Phase entries inside a workflow template may themselves be `phase:`
    // wrappers or bare phase objects. We accept either; downstream
    // expander treats the body uniformly. The exception is `template:`
    // wrappers — nested workflow-template inclusion is supported via the
    // depth-cap-3 chain in 55-02, but ONLY if the body is structurally
    // a workflow-template ref; allow them through here.
    if (typeof p.id !== 'string' || p.id.trim() === '') {
      throw new Error(
        `Workflow-template ${templateName} (${sourcePath}): phases[${i}] must have a non-empty string 'id'`
      );
    }
    if (p.id.indexOf(NAMESPACE_SEPARATOR) !== -1) {
      throw new Error(
        `Workflow-template ${templateName} (${sourcePath}): phases[${i}].id '${p.id}' must not contain the reserved '${NAMESPACE_SEPARATOR}' separator`
      );
    }
    if (seenIds.has(p.id)) {
      throw new Error(
        `Workflow-template ${templateName} (${sourcePath}): duplicate internal phase id '${p.id}'`
      );
    }
    seenIds.add(p.id);
    out.push(p);
  }
  return out;
}

function resolveWorkflowTemplate(name, opts) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('Workflow-template lookup requires a non-empty string name');
  }
  const projectDir = path.resolve((opts && opts.projectDir) || process.cwd());
  const repoRoot = path.resolve(__dirname, '..');
  const searched = [
    path.resolve(projectDir, '.planning', 'workflow-templates', `${name}.yaml`),
    path.resolve(repoRoot, 'templates', 'workflow-templates', `${name}.yaml`),
  ];

  for (const candidate of searched) {
    if (isFile(candidate)) return candidate;
  }

  throw new Error(`Workflow-template not found: ${name}. Searched: ${searched.join(', ')}`);
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_err) {
    return false;
  }
}

module.exports = {
  loadWorkflowTemplate,
  resolveWorkflowTemplate,
  NAMESPACE_SEPARATOR,
};
