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
 *
 * Detection logic lives in lib/detect.js (v0.5). This module re-exports
 * the detection functions for back-compat.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { planningDir, repoRoot, readTemplate } = require('./paths');
const detect = require('./detect');
const { mergeCpDefaults } = require('./merge');

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
    return raw;
  }

  // v0.5 auto-heal: additive merge of new upstream defaults into existing cp block
  try {
    const merged = mergeCpDefaults(raw, defaults);
    if (merged.changed) {
      fs.writeFileSync(p, JSON.stringify(merged.cfg, null, 2) + '\n');
      process.stderr.write(`cp: refreshed .planning/config.json with ${merged.summary}\n`);
    }
    return merged.cfg;
  } catch (e) {
    // Merge failure — return unmerged config, don't block the command
    process.stderr.write(`cp: config merge warning: ${e.message}\n`);
    return raw;
  }
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

/**
 * Back-compat wrapper: adapts detectProviderAtAnyHarness to the old
 * detectProvider return shape { name, installed, evidence?, reason? }.
 * New callers should use detect.detectProviderAtAnyHarness directly.
 */
function detectProvider(cfg, name) {
  const result = detect.detectProviderAtAnyHarness(cfg, name);
  // Old shape didn't have via/source — strip them for strict back-compat
  // but the superset is harmless since callers only read known keys.
  return result;
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
    const det = detect.detectProviderAtAnyHarness(cfg, name);
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
 */
function resolvePrompt(role, root = repoRoot()) {
  const cfg = loadConfig(root);
  const manual = (cfg.cp && cfg.cp.providers && cfg.cp.providers.manual) || {};
  const prompts = manual.prompts || {};
  return typeof prompts[role] === 'string' ? prompts[role] : null;
}

// ───────────────────────── v1.10: per-skill primitives ─────────────────────

/**
 * Parse a workflow YAML skill name, recognising the parens-sigil opt-in
 * fuzzy marker. `(name)` means "fuzzy match allowed"; bare `name` is strict.
 *
 * Throws on malformed input: unbalanced parens, empty inner, nested parens.
 *
 * @param {string} rawName
 * @returns {{ name: string, fuzzy: boolean }}
 */
function parseSkillName(rawName) {
  if (typeof rawName !== 'string') {
    throw new Error(`parseSkillName: expected string, got ${typeof rawName}`);
  }
  const s = rawName.trim();
  if (s.length === 0) {
    throw new Error('parseSkillName: empty input');
  }
  const startsParen = s.startsWith('(');
  const endsParen = s.endsWith(')');
  if (startsParen !== endsParen) {
    throw new Error(`parseSkillName: unbalanced parens in ${JSON.stringify(rawName)}`);
  }
  if (!startsParen) {
    if (s.includes('(') || s.includes(')')) {
      throw new Error(`parseSkillName: stray paren in ${JSON.stringify(rawName)}`);
    }
    return { name: s, fuzzy: false };
  }
  const inner = s.slice(1, -1).trim();
  if (inner.length === 0) {
    throw new Error(`parseSkillName: empty sigil () in ${JSON.stringify(rawName)}`);
  }
  if (inner.includes('(') || inner.includes(')')) {
    throw new Error(`parseSkillName: nested parens in ${JSON.stringify(rawName)}`);
  }
  return { name: inner, fuzzy: true };
}

/**
 * Tokenize a skill name for fuzzy matching: split on - _ whitespace,
 * lowercase, drop empties.
 */
function tokenize(s) {
  return String(s)
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter((t) => t.length > 0);
}

/**
 * Find the best fuzzy match for a hint among candidate skill names.
 *
 * Algorithm (pure, no I/O):
 *  1. Tokenize hint and each candidate on `-` / `_` / whitespace.
 *  2. Score each candidate by tokens_matched / max(|hint|, |candidate|),
 *     where a hint token matches a candidate token if either is a substring
 *     of the other.
 *  3. Drop candidates below threshold 0.5.
 *  4. Tiebreak: highest score → shortest name → alphabetical.
 *
 * @param {string} hint
 * @param {string[]} candidates
 * @returns {{ chosen: string|null, candidates: Array<{name:string, score:number}> }}
 */
function findFuzzyMatch(hint, candidates) {
  const THRESHOLD = 0.5;
  const hintTokens = tokenize(hint);
  const scored = [];
  for (const cand of candidates || []) {
    const candTokens = tokenize(cand);
    if (candTokens.length === 0 || hintTokens.length === 0) {
      continue;
    }
    let matched = 0;
    for (const h of hintTokens) {
      const hit = candTokens.some((c) => c.includes(h) || h.includes(c));
      if (hit) matched += 1;
    }
    const denom = Math.max(hintTokens.length, candTokens.length);
    const score = matched / denom;
    if (score >= THRESHOLD) {
      scored.push({ name: cand, score });
    }
  }
  // Tiebreak: score desc → name length asc → name alpha asc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return { chosen: scored.length > 0 ? scored[0].name : null, candidates: scored };
}

/**
 * Locate the on-disk skills directory for an installed provider.
 *
 * For plugin_shape providers we use the detection evidence path (the plugin
 * dir) and append `/skills`. For legacy any_of providers we walk a few
 * common locations. Returns the first directory that exists, else null.
 */
function _findSkillsDir(providerName, cfg, root = repoRoot()) {
  const det = detect.detectProviderAtAnyHarness(cfg, providerName);
  if (!det.installed) return null;
  if (det.evidence) {
    // plugin_shape: evidence is the plugin dir
    const skills = path.join(det.evidence, 'skills');
    if (fs.existsSync(skills)) return skills;
  }
  // Manual / always providers have no on-disk skills catalog
  return null;
}

/**
 * List the skill names a provider ships, sorted alphabetically.
 *
 * A "skill" is any subdir of <provider>/skills/ containing a SKILL.md.
 * Returns [] for providers that are not installed or have no skills dir
 * (e.g., the manual provider).
 */
function listProviderSkills(providerName, cfg, root = repoRoot()) {
  const skillsDir = _findSkillsDir(providerName, cfg, root);
  if (!skillsDir) return [];
  let entries;
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md'))) {
      names.push(e.name);
    }
  }
  names.sort();
  return names;
}

/**
 * Does the provider ship a skill with this exact name? Checks for
 * <provider>/skills/<name>/SKILL.md on disk.
 */
function skillExists(providerName, skillName, cfg, root = repoRoot()) {
  if (!skillName || typeof skillName !== 'string') return false;
  const skillsDir = _findSkillsDir(providerName, cfg, root);
  if (!skillsDir) return false;
  return fs.existsSync(path.join(skillsDir, skillName, 'SKILL.md'));
}

// Alias resolvePrompt for the v1.10 resolution chain (clearer name).
const resolvePromptForRole = resolvePrompt;

module.exports = {
  CONFIG_NAME,
  configPath,
  loadDefaults,
  loadConfig,
  saveConfig,
  cpGet,
  cpSet,
  // Back-compat re-exports from detect.js
  existsAnywhere: detect.existsAnywhere,
  detectProvider,
  resolveSkill,
  resolvePrompt,
  resolvePromptForRole,
  // v1.10 per-skill primitives
  parseSkillName,
  findFuzzyMatch,
  listProviderSkills,
  skillExists,
  // New v0.5 detection (re-exported for convenience)
  detectProviderAtAnyHarness: detect.detectProviderAtAnyHarness,
  detectAllInstalled: detect.detectAllInstalled,
};
