'use strict';

/**
 * Additive config merge for brownfield auto-heal (v0.5).
 *
 * When a project's `.planning/config.json` was init'd against an older
 * template (e.g., v0.4.x), `mergeCpDefaults` silently augments it with
 * any new upstream keys (harnesses, providers, sentinels, schema bump)
 * without overwriting user-customised values.
 *
 * Rules:
 *  - Never delete user data.
 *  - User values win on key conflicts.
 *  - Arrays (like detect.any_of and plugin_roots) are unioned (dedupe).
 *  - Objects are deep-merged with user-wins precedence.
 *  - cp.version is set to max(user, defaults).
 */

/**
 * Merge upstream cp defaults into a user config.
 *
 * @param {object} raw       - The full parsed config.json (with .cp block).
 * @param {object} defaults  - The full default config.json from templates/.
 * @param {object} opts      - { verbose: false }
 * @returns {{ cfg: object, changed: boolean, summary: string, plannedChanges: string[] }}
 */
function mergeCpDefaults(raw, defaults, opts = {}) {
  const user = raw.cp || {};
  const def = defaults.cp || {};
  const changes = [];

  // Deep clone raw to avoid mutating the input
  const cfg = JSON.parse(JSON.stringify(raw));
  cfg.cp = cfg.cp || {};

  // 1. Schema version: max(user, defaults)
  const userVersion = typeof cfg.cp.version === 'number' ? cfg.cp.version : 1;
  const defVersion = typeof def.version === 'number' ? def.version : 1;
  if (defVersion > userVersion) {
    cfg.cp.version = defVersion;
    changes.push(`schema v${userVersion} → v${defVersion}`);
  }

  // 2. workflow_provider: user wins (never overwrite)
  if (!cfg.cp.workflow_provider && def.workflow_provider) {
    cfg.cp.workflow_provider = def.workflow_provider;
    changes.push(`set workflow_provider to '${def.workflow_provider}'`);
  }

  // 3. Harnesses: add missing, deep-merge existing
  if (def.harnesses) {
    cfg.cp.harnesses = cfg.cp.harnesses || {};
    for (const [name, defHarness] of Object.entries(def.harnesses)) {
      if (!cfg.cp.harnesses[name]) {
        cfg.cp.harnesses[name] = JSON.parse(JSON.stringify(defHarness));
        changes.push(`new harness '${name}'`);
      } else {
        // Deep-merge: user keys win, union plugin_roots
        const userH = cfg.cp.harnesses[name];
        if (!userH.description && defHarness.description) {
          userH.description = defHarness.description;
        }
        if (defHarness.plugin_roots) {
          userH.plugin_roots = unionArrays(
            userH.plugin_roots || [],
            defHarness.plugin_roots
          );
        }
      }
    }
  }

  // 4. Providers: add missing blocks, merge detect.any_of + plugin_shape + skills
  if (def.providers) {
    cfg.cp.providers = cfg.cp.providers || {};
    for (const [name, defProvider] of Object.entries(def.providers)) {
      if (!cfg.cp.providers[name]) {
        cfg.cp.providers[name] = JSON.parse(JSON.stringify(defProvider));
        changes.push(`new provider '${name}'`);
      } else {
        const userP = cfg.cp.providers[name];

        // detect.any_of: union (dedupe)
        if (defProvider.detect && defProvider.detect.any_of) {
          userP.detect = userP.detect || {};
          const before = (userP.detect.any_of || []).length;
          userP.detect.any_of = unionArrays(
            userP.detect.any_of || [],
            defProvider.detect.any_of
          );
          const added = userP.detect.any_of.length - before;
          if (added > 0) {
            changes.push(`${added} new sentinel(s) for '${name}'`);
          }
        }

        // plugin_shape: add if missing, never overwrite
        if (defProvider.plugin_shape && !userP.plugin_shape) {
          userP.plugin_shape = JSON.parse(JSON.stringify(defProvider.plugin_shape));
          changes.push(`plugin_shape for '${name}'`);
        }

        // skills: add missing keys, user wins on conflict
        if (defProvider.skills) {
          userP.skills = userP.skills || {};
          for (const [role, defSkill] of Object.entries(defProvider.skills)) {
            if (!(role in userP.skills)) {
              userP.skills[role] = defSkill;
            }
          }
        }

        // prompts: add missing keys, user wins on conflict
        if (defProvider.prompts) {
          userP.prompts = userP.prompts || {};
          for (const [role, defPrompt] of Object.entries(defProvider.prompts)) {
            if (!(role in userP.prompts)) {
              userP.prompts[role] = defPrompt;
            }
          }
        }
      }
    }
  }

  // 5. Behavior: add missing keys, user wins
  if (def.behavior) {
    cfg.cp.behavior = cfg.cp.behavior || {};
    for (const [key, defVal] of Object.entries(def.behavior)) {
      if (!(key in cfg.cp.behavior)) {
        cfg.cp.behavior[key] = defVal;
        changes.push(`behavior.${key} = ${defVal}`);
      }
    }
  }

  const changed = changes.length > 0;
  const summary = changed ? changes.join(', ') : 'already up to date';
  return { cfg, changed, summary, plannedChanges: changes };
}

/**
 * Union two arrays, deduping by JSON stringification for primitives.
 */
function unionArrays(a, b) {
  const set = new Set(a.map(String));
  const result = [...a];
  for (const item of b) {
    if (!set.has(String(item))) {
      set.add(String(item));
      result.push(item);
    }
  }
  return result;
}

module.exports = { mergeCpDefaults, unionArrays };
