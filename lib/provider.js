'use strict';

/**
 * Workflow provider abstraction (GSD-compatible).
 *
 * Reads from `.planning/config.json` (the same file GSD uses) and looks for
 * cp-specific settings under the top-level `cp` key. GSD ignores unknown
 * top-level keys, so both tools share the same config file safely.
 *
 * If `config.json` doesn't exist, we materialise it from the template (which
 * includes both GSD's defaults AND the `cp` block).
 *
 * If `config.json` exists but lacks the `cp` block (i.e., pure-GSD project),
 * we merge in the default `cp` block on first read and save it back —
 * preserving every existing GSD key untouched.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { planningDir, repoRoot, readTemplate } = require('./paths');

const CONFIG_NAME = 'config.json';

function configPath(root = repoRoot()) {
  return path.join(planningDir(root), CONFIG_NAME);
}

function loadDefaults() {
  return JSON.parse(readTemplate('config.json'));
}

/** Return the parsed config, ensuring a `cp` block exists. Writes back if merged. */
function loadConfig(root = repoRoot()) {
  const p = configPath(root);
  const defaults = loadDefaults();

  if (!fs.existsSync(p)) {
    // No config at all — caller hasn't run `cp init`. Return defaults in-memory;
    // do NOT write the file from here (init owns that).
    return defaults;
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to parse ${p}: ${e.message}`);
  }

  if (!raw.cp) {
    // Pure-GSD config (or hand-rolled). Merge in the cp defaults non-destructively.
    raw.cp = defaults.cp;
    fs.writeFileSync(p, JSON.stringify(raw, null, 2) + '\n');
  }

  return raw;
}

function saveConfig(cfg, root = repoRoot()) {
  const p = configPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
  return p;
}

/** Convenience: read a value from cfg.cp.<path> with safe defaulting. */
function cpGet(cfg, dotted, fallback) {
  const v = dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), cfg.cp || {});
  return v === undefined ? fallback : v;
}

/** Set cfg.cp.<path> = value. Creates nested objects as needed. */
function cpSet(cfg, dotted, value) {
  cfg.cp = cfg.cp || {};
  const keys = dotted.split('.');
  let cur = cfg.cp;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

/** Search candidate locations for a provider sentinel path. */
function existsAnywhere(candidate) {
  const home = os.homedir();
  const root = repoRoot();
  const tries = [
    path.join(root, candidate),
    path.join(home, candidate),
    path.join(home, '.claude', candidate),
    path.join(home, '.github', candidate),
    path.join(home, '.copilot', candidate),
  ];
  return tries.find((t) => fs.existsSync(t)) || null;
}

function detectProvider(cfg, name) {
  const providers = (cfg.cp && cfg.cp.providers) || {};
  const provider = providers[name];
  if (!provider) return { name, installed: false, reason: 'unknown provider' };
  const det = provider.detect || {};
  if (det.always === true) return { name, installed: true };
  const candidates = det.any_of || [];
  for (const c of candidates) {
    const hit = existsAnywhere(c);
    if (hit) return { name, installed: true, evidence: hit };
  }
  return { name, installed: false, reason: 'no sentinel matched' };
}

/**
 * Resolve a role -> { name, installed, skill, fallback?, primaryMissing? }.
 */
function resolveSkill(role, root = repoRoot()) {
  const cfg = loadConfig(root);
  const configured = cpGet(cfg, 'workflow_provider', 'superpowers');
  const fallback = cpGet(cfg, 'behavior.fall_back_to_manual_if_provider_missing', true);
  const providers = (cfg.cp && cfg.cp.providers) || {};

  const tryProvider = (name) => {
    const det = detectProvider(cfg, name);
    const skills = (providers[name] && providers[name].skills) || {};
    return { name, installed: det.installed, skill: skills[role] || null };
  };

  const primary = tryProvider(configured);
  if (primary.installed) {
    return { ...primary, fallback: false };
  }
  if (fallback) {
    const manual = tryProvider('manual');
    return { ...manual, fallback: true, primaryMissing: configured };
  }
  return { ...primary, fallback: false };
}

/**
 * Resolve the inline manual prompt for a role. Returns the prompt string, or
 * null if the manual provider has no prompt for this role.
 *
 * Used by cp commands when they need to fall back to inline instructions
 * (e.g. when the configured external provider isn't installed and no other
 * skill can be invoked).
 */
function resolvePrompt(role, root = repoRoot()) {
  const cfg = loadConfig(root);
  const manual = (cfg.cp && cfg.cp.providers && cfg.cp.providers.manual) || {};
  const prompts = manual.prompts || {};
  return typeof prompts[role] === 'string' ? prompts[role] : null;
}

module.exports = {
  CONFIG_NAME,
  configPath,
  loadDefaults,
  loadConfig,
  saveConfig,
  cpGet,
  cpSet,
  detectProvider,
  resolveSkill,
  resolvePrompt,
};
