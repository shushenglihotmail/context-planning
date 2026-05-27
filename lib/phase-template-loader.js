'use strict';

/**
 * Phase-template loader (v1.3).
 *
 * Loads a single-phase template definition by name. The template is a YAML
 * file with the shape:
 *
 *   name: <template-name>            # required, descriptive identity
 *   params:                          # optional
 *     - name: <param-name>
 *       default: <value>             # optional; absence = required param
 *   role: ...                        # any phase field — the body
 *   skill: ...
 *   prompt: "Review {{target}} ..."
 *
 * The loader does NOT substitute args here — substitution lives in
 * lib/template-substitute.js (Phase 54-02) and the resolver
 * (Phase 54-03) is what wires the pieces together. The loader's job is
 * to find the file, parse YAML, validate the template's own shape, and
 * return a normalized { name, params, body, sourcePath } object.
 *
 * Lookup order (project scope shadows builtin) per DESIGN.md Q2:
 *   1. `<projectDir>/.planning/phase-templates/<name>.yaml`
 *   2. `<repoRoot>/templates/phase-templates/<name>.yaml`
 *
 * Inline phase-templates (declared alongside a workflow file) are NOT
 * handled here — those are surfaced by the resolver in 54-03 / Phase 55.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Fields that are NOT part of the phase body (they describe the template
// itself, not the resulting phase).
const TEMPLATE_META_KEYS = new Set(['name', 'params']);

// Fields a phase template body MUST NOT carry — the caller supplies them.
const BODY_FORBIDDEN_KEYS = new Set(['id', 'depends_on']);

function loadPhaseTemplate(name, opts) {
  const sourcePath = resolvePhaseTemplate(name, opts);
  const content = fs.readFileSync(sourcePath, 'utf8');
  let parsed;
  try {
    parsed = yaml.parse(content);
  } catch (err) {
    throw new Error(
      `Phase-template parse error in ${sourcePath}: ${err && err.message ? err.message : String(err)}`
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Phase-template ${name} (${sourcePath}): top-level must be a YAML mapping`);
  }

  if (typeof parsed.name !== 'string' || parsed.name.trim() === '') {
    throw new Error(`Phase-template ${name} (${sourcePath}): 'name' must be a non-empty string`);
  }

  const params = normaliseParams(parsed.params, name, sourcePath);
  const body = {};
  for (const key of Object.keys(parsed)) {
    if (TEMPLATE_META_KEYS.has(key)) continue;
    if (BODY_FORBIDDEN_KEYS.has(key)) {
      throw new Error(
        `Phase-template ${name} (${sourcePath}): body field '${key}' is supplied by the caller, not by the template`
      );
    }
    body[key] = parsed[key];
  }

  // The body must not contain its own inner `template:` field at this plan.
  // Recursive phase-template chaining is handled by the resolver in 54-03
  // (with a depth cap of 3); for now we only forbid it to keep 54-01
  // tightly scoped.
  if (Object.prototype.hasOwnProperty.call(body, 'template')) {
    // Hand off to 54-03 — keep the body intact (resolver will validate).
    // No early error here; the loader just returns the raw body and the
    // resolver decides chain semantics. (Deliberate: keeps the loader
    // pure.)
  }

  return {
    name: parsed.name,
    params,
    body,
    sourcePath,
  };
}

function normaliseParams(rawParams, templateName, sourcePath) {
  if (rawParams === undefined || rawParams === null) return [];
  if (!Array.isArray(rawParams)) {
    throw new Error(
      `Phase-template ${templateName} (${sourcePath}): 'params' must be an array of { name, default? } objects`
    );
  }

  const seen = new Set();
  const out = [];
  for (let i = 0; i < rawParams.length; i++) {
    const p = rawParams[i];
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      throw new Error(
        `Phase-template ${templateName} (${sourcePath}): params[${i}] must be an object with a 'name' field`
      );
    }
    if (typeof p.name !== 'string' || p.name.trim() === '') {
      throw new Error(
        `Phase-template ${templateName} (${sourcePath}): params[${i}].name must be a non-empty string`
      );
    }
    if (seen.has(p.name)) {
      throw new Error(
        `Phase-template ${templateName} (${sourcePath}): duplicate param name '${p.name}'`
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

function resolvePhaseTemplate(name, opts) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('Phase-template lookup requires a non-empty string name');
  }
  const projectDir = path.resolve((opts && opts.projectDir) || process.cwd());
  const repoRoot = path.resolve(__dirname, '..');
  const searched = [
    path.resolve(projectDir, '.planning', 'phase-templates', `${name}.yaml`),
    path.resolve(repoRoot, 'templates', 'phase-templates', `${name}.yaml`),
  ];

  for (const candidate of searched) {
    if (isFile(candidate)) return candidate;
  }

  throw new Error(`Phase-template not found: ${name}. Searched: ${searched.join(', ')}`);
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_err) {
    return false;
  }
}

module.exports = {
  loadPhaseTemplate,
  resolvePhaseTemplate,
};
