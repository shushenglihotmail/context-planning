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
  // v1.4 Decision #1: inline workflow-templates (declared in
  // `workflow_templates:` at the top of the workflow file) shadow project +
  // builtin disk lookups.
  const inline = opts && opts.inlineWorkflowTemplates;
  if (inline && typeof inline === 'object' && inline.has && inline.has(name)) {
    return inline.get(name);
  }

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
    // Workflow-template phase entries may take three shapes (mirroring the
    // top-level workflow grammar):
    //   - bare:       { id, role, ... }
    //   - phase:      { phase: { id, ... } }
    //   - template:   { template: { id, name, args?, after? } }   (nested chain)
    // We extract a canonical "internal id" for uniqueness + separator
    // checks but preserve the raw entry so the 55-02 expander can apply
    // substitution / unwrapping / recursion.
    const kind = detectEntryKind(p);
    const inner = (kind === 'bare') ? p : p[kind];
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) {
      throw new Error(
        `Workflow-template ${templateName} (${sourcePath}): phases[${i}].${kind} must be an object`
      );
    }
    if (typeof inner.id !== 'string' || inner.id.trim() === '') {
      throw new Error(
        `Workflow-template ${templateName} (${sourcePath}): phases[${i}] must have a non-empty string 'id'`
      );
    }
    if (inner.id.indexOf(NAMESPACE_SEPARATOR) !== -1) {
      throw new Error(
        `Workflow-template ${templateName} (${sourcePath}): phases[${i}].id '${inner.id}' must not contain the reserved '${NAMESPACE_SEPARATOR}' separator`
      );
    }
    if (seenIds.has(inner.id)) {
      throw new Error(
        `Workflow-template ${templateName} (${sourcePath}): duplicate internal phase id '${inner.id}'`
      );
    }
    seenIds.add(inner.id);
    out.push(p);
  }
  return out;
}

function detectEntryKind(p) {
  if (Object.prototype.hasOwnProperty.call(p, 'phase')) return 'phase';
  if (Object.prototype.hasOwnProperty.call(p, 'template')) return 'template';
  return 'bare';
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
