'use strict';

/**
 * Workflow-template expander (v1.3, Phase 55-02).
 *
 * Given a normalised workflow-template wrapper entry (the `_wrapperKind ===
 * 'template'` entry seen at the top level of a workflow), this module:
 *
 *   1. Loads the workflow template via 55-01 loader.
 *   2. Merges declared params with caller args (missing-required → error,
 *      unused arg → warning).
 *   3. Substitutes `{{name}}` tokens throughout each phase body.
 *   4. Unwraps `phase:` wrappers inside the template body.
 *   5. Recurses into any nested `template:` entries (workflow-template
 *      chain), bounded by MAX_DEPTH = 3.
 *   6. Prefixes every materialised internal id with `<groupId>--` and
 *      rewrites every internal `after:` / `depends_on:` reference that
 *      matches another internal id. References that DON'T match any
 *      internal id are left alone (external refs to phases outside the
 *      group), which 55-03 may further rewrite if they happen to refer
 *      to another group's handle.
 *   7. Identifies entry phases (no inbound internal edge) and prepends
 *      the wrapper's `after:` to each entry phase's `after:` (dedup).
 *   8. Identifies exit phases (no outbound internal edge) — these are
 *      returned so 55-03 can rewrite outside `after: <groupId>` refs.
 *   9. Empty group (zero materialised phases) → error.
 *
 * Returns: { phases, warnings, exitIds, groupId }.
 *
 * Pure — does not mutate the input. The caller is responsible for
 * splicing `phases` into the workflow's phase array in place of the
 * wrapper entry.
 */

const { loadWorkflowTemplate, NAMESPACE_SEPARATOR } = require('./workflow-template-loader');
const { substituteArgs } = require('./template-substitute');

const MAX_DEPTH = 3;

/**
 * Hard-coded fallback table for `${config.<path>}` references that the
 * user's `config.json` doesn't define. The values are the corresponding
 * superpowers skill names — per v1.5 DESIGN.md, missing config keys
 * "assume using the corresponding superpowers skill", so that workflows
 * work out of the box without any config tweaks.
 *
 * Keep this table small and explicit. Adding a new path here is a
 * conscious schema decision (every workflow can now use it as a
 * `${config.path}` default).
 */
const CONFIG_FALLBACKS = Object.freeze({
  'provider.quick_design_skill': 'writing-plans',
  'provider.plan_skill': 'writing-plans',
  'provider.execute_skill': 'subagent-driven-development',
  'provider.brainstorm_skill': 'brainstorming',
  'provider.review_skill': 'requesting-code-review',
});

const CONFIG_TOKEN_RE = /\$\{config\.([A-Za-z0-9_.]+)\}/g;

/**
 * Resolve a dot-path like 'provider.quick_design_skill' against cfg.
 * Returns undefined when any segment is missing or non-traversable.
 */
function dotLookup(cfg, dotPath) {
  if (!cfg || typeof cfg !== 'object') return undefined;
  const parts = dotPath.split('.');
  let cur = cfg;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Recursively walk `value` (string / array / plain object) and replace
 * every `${config.<dot.path>}` token. Resolution order per Phase 70:
 *   1. Look up `<dot.path>` in `cfg`. If found and not undefined → use it.
 *   2. Else look up `<dot.path>` in CONFIG_FALLBACKS → use that.
 *   3. Else throw, citing `<dot.path>` and `opts.templateName`.
 *
 * Whole-string matches preserve the raw resolved value (so non-string
 * cfg values pass through unchanged). Mixed strings coerce to String().
 *
 * @param {*} value
 * @param {object} cfg - loaded config.json
 * @param {{templateName?: string}} [opts]
 * @returns {*} value with `${config.…}` tokens resolved
 */
function interpolateConfigTokens(value, cfg, opts) {
  const templateName = (opts && opts.templateName) || '(anonymous template)';
  const ctx = { cfg, templateName };
  return walkConfigTokens(value, ctx);
}

function walkConfigTokens(value, ctx) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return interpolateStringConfigTokens(value, ctx);
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      out[i] = walkConfigTokens(value[i], ctx);
    }
    return out;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = walkConfigTokens(value[key], ctx);
    }
    return out;
  }
  return value;
}

function resolveConfigPath(dotPath, ctx) {
  const fromCfg = dotLookup(ctx.cfg, dotPath);
  if (fromCfg !== undefined && fromCfg !== null) return fromCfg;
  if (Object.prototype.hasOwnProperty.call(CONFIG_FALLBACKS, dotPath)) {
    return CONFIG_FALLBACKS[dotPath];
  }
  throw new Error(
    `Workflow template '${ctx.templateName}': unresolved \${config.${dotPath}} ` +
    `(no value in config.json and no superpowers-skill fallback for this path)`
  );
}

function interpolateStringConfigTokens(str, ctx) {
  CONFIG_TOKEN_RE.lastIndex = 0;
  const whole = CONFIG_TOKEN_RE.exec(str);
  if (whole && whole.index === 0 && whole[0].length === str.length) {
    // Whole-string match → preserve raw resolved value.
    return resolveConfigPath(whole[1], ctx);
  }
  return str.replace(CONFIG_TOKEN_RE, function (_match, dotPath) {
    const v = resolveConfigPath(dotPath, ctx);
    if (v === null || v === undefined) return '';
    return String(v);
  });
}

function expandWorkflowTemplate(wrapperEntry, opts) {
  if (!wrapperEntry || typeof wrapperEntry !== 'object' || Array.isArray(wrapperEntry)) {
    throw new Error('expandWorkflowTemplate: wrapperEntry must be an object');
  }
  if (typeof wrapperEntry.id !== 'string' || wrapperEntry.id.trim() === '') {
    throw new Error("expandWorkflowTemplate: wrapper entry must carry a non-empty 'id' (group handle)");
  }
  if (typeof wrapperEntry.name !== 'string' || wrapperEntry.name.trim() === '') {
    throw new Error(`expandWorkflowTemplate: wrapper entry (id='${wrapperEntry.id}') must carry a non-empty 'name' (template name)`);
  }
  if (wrapperEntry.id.indexOf(NAMESPACE_SEPARATOR) !== -1) {
    throw new Error(
      `expandWorkflowTemplate: group-handle id '${wrapperEntry.id}' must not contain the reserved '${NAMESPACE_SEPARATOR}' separator`
    );
  }

  const warnings = [];
  const projectDir = (opts && opts.projectDir) || process.cwd();
  const wrapperAfter = Array.isArray(wrapperEntry.after) ? wrapperEntry.after.slice() : [];

  // Phase 70: load config once per top-level expansion so mergeArgs
  // can interpolate `${config.<path>}` tokens in param defaults.
  // Tests may pass an explicit `cfg` to skip disk I/O.
  const cfg = (opts && opts.cfg !== undefined)
    ? opts.cfg
    : loadConfigSafe(projectDir);

  const phases = expandGroup({
    groupId: wrapperEntry.id,
    templateName: wrapperEntry.name,
    callerArgs: wrapperEntry.args,
    projectDir,
    inlineWorkflowTemplates: opts && opts.inlineWorkflowTemplates,
    depth: 1,
    chain: [wrapperEntry.name],
    callerLabel: `wrapper '${wrapperEntry.id}'`,
    warningsOut: warnings,
    cfg,
  });

  if (phases.length === 0) {
    throw new Error(
      `Workflow template '${wrapperEntry.name}' (group '${wrapperEntry.id}') expanded to zero phases (empty group)`
    );
  }

  // Identify entry phases (no inbound internal edge) and exit phases
  // (no outbound internal edge). Edges are the union of `after` and
  // `depends_on` since both express ordering.
  const idSet = new Set(phases.map((p) => p.id));
  const hasInboundInternal = new Map();
  const hasOutboundInternal = new Map();
  for (const p of phases) {
    hasInboundInternal.set(p.id, false);
    hasOutboundInternal.set(p.id, false);
  }
  for (const p of phases) {
    const edges = collectEdges(p);
    for (const target of edges) {
      if (idSet.has(target)) {
        // p depends on target → target has outbound to p, p has inbound from target.
        hasInboundInternal.set(p.id, true);
        hasOutboundInternal.set(target, true);
      }
    }
  }
  const entryIds = phases.filter((p) => !hasInboundInternal.get(p.id)).map((p) => p.id);
  const exitIds = phases.filter((p) => !hasOutboundInternal.get(p.id)).map((p) => p.id);

  // Prepend wrapper.after to every entry phase's after (dedup).
  if (wrapperAfter.length > 0) {
    const entrySet = new Set(entryIds);
    for (const p of phases) {
      if (!entrySet.has(p.id)) continue;
      const existing = Array.isArray(p.after) ? p.after.slice() : [];
      const merged = [];
      const seen = new Set();
      for (const a of wrapperAfter) {
        if (!seen.has(a)) { seen.add(a); merged.push(a); }
      }
      for (const a of existing) {
        if (!seen.has(a)) { seen.add(a); merged.push(a); }
      }
      p.after = merged;
    }
  }

  return {
    phases,
    warnings,
    exitIds,
    groupId: wrapperEntry.id,
  };
}

/**
 * Expand a workflow template into a list of fully-prefixed, fully-substituted
 * raw phase objects. Recurses for nested `template:` entries.
 *
 * @returns array of plain phase objects (no wrapper). Caller may mutate.
 */
function expandGroup(ctx) {
  if (ctx.depth > MAX_DEPTH) {
    throw new Error(
      `Workflow-template chain depth exceeds ${MAX_DEPTH}: ${ctx.chain.join(' -> ')}`
    );
  }

  const def = loadWorkflowTemplate(ctx.templateName, {
    projectDir: ctx.projectDir,
    inlineWorkflowTemplates: ctx.inlineWorkflowTemplates,
  });

  const mergedArgs = mergeArgs(def, ctx.callerArgs, ctx.templateName, ctx.callerLabel, ctx.cfg);
  const usedArgs = new Set();

  // Pass 1: walk each entry, substitute, classify (phase vs nested template),
  // and produce raw phase objects keyed by their UN-prefixed internal id.
  const collected = []; // [{ internalId, body, isNested, nestedExitInternalIds?, source: 'phase'|'nested' }]
  for (let i = 0; i < def.phases.length; i++) {
    const raw = def.phases[i];
    const kind = detectEntryKind(raw);
    if (kind === 'template') {
      // Nested workflow-template ref. Recurse, but the recursion's group
      // id is the nested wrapper's id — which itself must be prefixed
      // for this outer group's namespace BEFORE recursion (so the
      // recursed expansion produces ids prefixed `<outer>--<inner>--...`).
      // We model this by expanding with a temporary outerPrefixedGroupId
      // and a temporary "outer wrapper" that uses the prefixed id.
      const nested = raw.template;
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
        throw new Error(
          `Workflow-template '${ctx.templateName}': phases[${i}].template must be an object`
        );
      }
      if (typeof nested.id !== 'string' || nested.id.trim() === '') {
        throw new Error(
          `Workflow-template '${ctx.templateName}': phases[${i}].template must carry a non-empty 'id'`
        );
      }
      if (typeof nested.name !== 'string' || nested.name.trim() === '') {
        throw new Error(
          `Workflow-template '${ctx.templateName}': phases[${i}].template (id='${nested.id}') must carry a non-empty 'name'`
        );
      }
      // Substitute the wrapper's args/after with caller-level args (the
      // nested wrapper's `args` is the value to pass DOWN; substitute
      // tokens within it that reference THIS template's params).
      const substitutedNestedArgs = substituteArgs(nested.args || {}, mergedArgs, {
        templateName: ctx.templateName,
        usedArgs,
      });
      const substitutedNestedAfter = Array.isArray(nested.after)
        ? substituteArgs(nested.after.slice(), mergedArgs, { templateName: ctx.templateName, usedArgs })
        : [];

      // Recurse: produces phases already prefixed with `<nested.id>--`.
      const nestedPhases = expandGroup({
        groupId: nested.id,
        templateName: nested.name,
        callerArgs: substitutedNestedArgs,
        projectDir: ctx.projectDir,
        inlineWorkflowTemplates: ctx.inlineWorkflowTemplates,
        depth: ctx.depth + 1,
        chain: ctx.chain.concat([nested.name]),
        callerLabel: `${ctx.callerLabel} -> nested '${nested.id}'`,
        warningsOut: ctx.warningsOut,
        cfg: ctx.cfg,
      });
      if (nestedPhases.length === 0) {
        throw new Error(
          `Workflow template '${nested.name}' (nested in '${ctx.templateName}', group '${nested.id}') expanded to zero phases (empty group)`
        );
      }
      // Apply the nested wrapper's `after:` to the nested expansion's
      // entry phases (so external refs to the nested group via outer
      // resolution still resolve).
      if (substitutedNestedAfter.length > 0) {
        const nestedIdSet = new Set(nestedPhases.map((p) => p.id));
        const nestedHasInbound = new Map(nestedPhases.map((p) => [p.id, false]));
        for (const p of nestedPhases) {
          for (const t of collectEdges(p)) {
            if (nestedIdSet.has(t)) nestedHasInbound.set(p.id, true);
          }
        }
        for (const p of nestedPhases) {
          if (nestedHasInbound.get(p.id)) continue;
          const existing = Array.isArray(p.after) ? p.after.slice() : [];
          const merged = [];
          const seen = new Set();
          for (const a of substitutedNestedAfter) {
            if (!seen.has(a)) { seen.add(a); merged.push(a); }
          }
          for (const a of existing) {
            if (!seen.has(a)) { seen.add(a); merged.push(a); }
          }
          p.after = merged;
        }
      }
      collected.push({
        internalId: nested.id,
        nestedPhases,
        kind: 'nested',
      });
    } else {
      // v1.4 Decision #1: bare-form phase entries no longer accepted.
      if (kind === 'bare') {
        throw new Error(
          `Workflow-template '${ctx.templateName}': phases[${i}] is a bare-form phase entry — wrap in 'phase:' (see MIGRATION-v1.4.md)`
        );
      }
      const innerRaw = raw.phase;
      const body = substituteArgs(innerRaw, mergedArgs, {
        templateName: ctx.templateName,
        usedArgs,
      });
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error(
          `Workflow-template '${ctx.templateName}': phases[${i}] body resolved to a non-object`
        );
      }
      if (typeof body.id !== 'string' || body.id.trim() === '') {
        throw new Error(
          `Workflow-template '${ctx.templateName}': phases[${i}] body resolved without a string 'id'`
        );
      }
      collected.push({
        internalId: body.id,
        body,
        kind: 'phase',
      });
    }
  }

  // Compute prefix map (UN-prefixed internal id → prefixed id) for THIS
  // group. For nested-group children, the child phases are already
  // prefixed with the nested group's id; we still need to prefix those
  // with THIS group's id on top. The nested group's HANDLE itself
  // (collected[i].internalId for kind==='nested') becomes a virtual
  // reference target for sibling entries' `after:` refs.
  const prefixMap = new Map(); // internalRef → resolvedTarget(s)
  const ownIds = new Set();
  for (const item of collected) {
    if (item.kind === 'phase') {
      const prefixed = prefixId(ctx.groupId, item.internalId);
      prefixMap.set(item.internalId, [prefixed]);
      ownIds.add(item.internalId);
    } else {
      // Nested group handle: collect its exit phase ids (already prefixed
      // within nested expansion). They will receive THIS group's prefix
      // in the rewriting pass below.
      const nestedIdSet = new Set(item.nestedPhases.map((p) => p.id));
      const nestedHasOutbound = new Map(item.nestedPhases.map((p) => [p.id, false]));
      for (const p of item.nestedPhases) {
        for (const t of collectEdges(p)) {
          if (nestedIdSet.has(t)) nestedHasOutbound.set(t, true);
        }
      }
      const nestedExits = item.nestedPhases
        .filter((p) => !nestedHasOutbound.get(p.id))
        .map((p) => p.id);
      // Sibling `after: <nestedHandle>` resolves to the (eventually
      // prefixed) exit phases of the nested group.
      item.nestedExitInternalIds = nestedExits; // pre-this-prefix
      prefixMap.set(item.internalId, nestedExits);
      ownIds.add(item.internalId);
    }
  }

  // Pass 2: materialise the final phase list with prefixed ids and
  // rewritten edges.
  const out = [];
  for (const item of collected) {
    if (item.kind === 'phase') {
      const body = item.body;
      const newPhase = Object.assign({}, body);
      newPhase.id = prefixId(ctx.groupId, item.internalId);
      newPhase.after = rewriteEdges(body.after, prefixMap, ctx.groupId);
      if (Object.prototype.hasOwnProperty.call(body, 'depends_on')) {
        newPhase.depends_on = rewriteEdges(body.depends_on, prefixMap, ctx.groupId);
      }
      out.push(newPhase);
    } else {
      // Apply THIS group's prefix to every phase from the nested expansion.
      for (const np of item.nestedPhases) {
        const newPhase = Object.assign({}, np);
        newPhase.id = prefixId(ctx.groupId, np.id);
        newPhase.after = (Array.isArray(np.after) ? np.after : []).map((t) => {
          // Internal nested edges (point to other nested phases) → prefix.
          // External edges (point to siblings of the nested wrapper inside
          // THIS group) → resolve via prefixMap.
          // We can tell internal nested edges because they already start
          // with `<nestedId>--` (i.e. they were prefixed during recursion).
          // Apply current prefix to those; otherwise treat as sibling ref.
          if (t === item.internalId || (typeof t === 'string' && t.startsWith(item.internalId + NAMESPACE_SEPARATOR))) {
            return prefixId(ctx.groupId, t);
          }
          if (prefixMap.has(t)) {
            // Sibling within current group — resolve.
            const targets = prefixMap.get(t);
            return targets; // will be flattened below
          }
          return t; // external — leave alone
        });
        newPhase.after = flattenAndDedup(newPhase.after);
        if (Object.prototype.hasOwnProperty.call(np, 'depends_on') && Array.isArray(np.depends_on)) {
          newPhase.depends_on = np.depends_on.map((t) => {
            if (t === item.internalId || (typeof t === 'string' && t.startsWith(item.internalId + NAMESPACE_SEPARATOR))) {
              return prefixId(ctx.groupId, t);
            }
            if (prefixMap.has(t)) return prefixMap.get(t);
            return t;
          });
          newPhase.depends_on = flattenAndDedup(newPhase.depends_on);
        }
        out.push(newPhase);
      }
    }
  }

  // Unused-arg warnings (caller keys never referenced).
  const callerKeys = (ctx.callerArgs && typeof ctx.callerArgs === 'object' && !Array.isArray(ctx.callerArgs))
    ? Object.keys(ctx.callerArgs)
    : [];
  for (const k of callerKeys) {
    if (!usedArgs.has(k)) {
      ctx.warningsOut.push(
        `Workflow-template '${ctx.templateName}' (${ctx.callerLabel}): arg '${k}' supplied but not referenced by the template body`
      );
    }
  }

  return out;
}

function rewriteEdges(edges, prefixMap, groupId) {
  if (!Array.isArray(edges)) return [];
  const out = [];
  for (const e of edges) {
    if (typeof e !== 'string') {
      out.push(e); // pass-through; validate() will complain
      continue;
    }
    if (prefixMap.has(e)) {
      const targets = prefixMap.get(e);
      for (const t of targets) out.push(t);
    } else {
      // External reference — leave alone for 55-03 / outer rewriter.
      out.push(e);
    }
  }
  return dedup(out);
}

function flattenAndDedup(arr) {
  const out = [];
  const seen = new Set();
  for (const e of arr) {
    if (Array.isArray(e)) {
      for (const x of e) {
        if (!seen.has(x)) { seen.add(x); out.push(x); }
      }
    } else if (!seen.has(e)) {
      seen.add(e); out.push(e);
    }
  }
  return out;
}

function dedup(arr) {
  const seen = new Set();
  const out = [];
  for (const e of arr) {
    if (!seen.has(e)) { seen.add(e); out.push(e); }
  }
  return out;
}

function prefixId(groupId, internalId) {
  return `${groupId}${NAMESPACE_SEPARATOR}${internalId}`;
}

function collectEdges(phase) {
  const out = [];
  if (Array.isArray(phase.after)) {
    for (const a of phase.after) if (typeof a === 'string') out.push(a);
  }
  if (Array.isArray(phase.depends_on)) {
    for (const d of phase.depends_on) if (typeof d === 'string') out.push(d);
  }
  return out;
}

function detectEntryKind(p) {
  if (p && Object.prototype.hasOwnProperty.call(p, 'phase')) return 'phase';
  if (p && Object.prototype.hasOwnProperty.call(p, 'template')) return 'template';
  return 'bare';
}

function mergeArgs(def, callerArgs, templateName, callerLabel, cfg) {
  const out = {};
  const params = Array.isArray(def.params) ? def.params : [];
  const caller = (callerArgs && typeof callerArgs === 'object' && !Array.isArray(callerArgs))
    ? callerArgs
    : {};

  for (const p of params) {
    if (Object.prototype.hasOwnProperty.call(p, 'default')) {
      out[p.name] = p.default;
    }
  }
  for (const k of Object.keys(caller)) {
    out[k] = caller[k];
  }
  for (const p of params) {
    const hasDefault = Object.prototype.hasOwnProperty.call(p, 'default');
    const supplied = Object.prototype.hasOwnProperty.call(caller, p.name);
    if (!hasDefault && !supplied) {
      throw new Error(
        `Workflow-template '${templateName}' (${callerLabel}): required param '${p.name}' has no default and was not supplied by caller`
      );
    }
  }

  // Phase 70: interpolate `${config.<path>}` tokens in every merged arg
  // value. Both defaults and caller-supplied values are walked, so the
  // same syntax works regardless of where the value came from.
  if (cfg !== undefined) {
    for (const k of Object.keys(out)) {
      out[k] = interpolateConfigTokens(out[k], cfg, { templateName });
    }
  }

  return out;
}

/**
 * Best-effort config loader used when callers don't supply an explicit
 * cfg. Returns {} if .planning/config.json is missing or unreadable —
 * the fallback table inside interpolateConfigTokens still applies, so
 * templates that only reference known fallback paths keep working on
 * fresh projects.
 */
function loadConfigSafe(projectDir) {
  try {
    const fs = require('fs');
    const path = require('path');
    const p = path.join(projectDir, '.planning', 'config.json');
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

module.exports = {
  expandWorkflowTemplate,
  interpolateConfigTokens,
  CONFIG_FALLBACKS,
  MAX_DEPTH,
};
