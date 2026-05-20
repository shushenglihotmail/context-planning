'use strict';

/**
 * Harness × provider detection engine (v0.5).
 *
 * Scans harness plugin_roots for provider plugin_shape matches, with
 * fallback to legacy detect.any_of literal sentinels. All filesystem
 * reads happen at call time — no caching.
 *
 * Trailing-* glob: `~/.copilot/installed-plugins/⁕/` expands to the
 * immediate child directories of the parent. No full minimatch — the
 * "zero deps in lib/" constraint from PROJECT.md stays honoured.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { repoRoot } = require('./paths');

// ───────────────────────── tilde + trailing-* expansion ─────────────────

/**
 * Expand a root spec with tilde and trailing-* support.
 *
 * Rules:
 *  - Leading `~/` replaced with os.homedir().
 *  - If no `*` in the string → literal: return [abs] if exists, else [].
 *  - First path segment containing `*` is expanded via readdirSync of
 *    its parent, keeping only directories. Remaining segments are
 *    appended verbatim.
 *
 * Returns string[] (may be empty).
 */
function expandRoot(rootSpec) {
  let spec = rootSpec;

  // Tilde expansion
  if (spec.startsWith('~/') || spec.startsWith('~\\')) {
    spec = path.join(os.homedir(), spec.slice(2));
  }
  spec = path.normalize(spec);

  // Find first segment with a wildcard
  const segments = spec.split(path.sep);
  const wildIdx = segments.findIndex((s) => s.includes('*'));

  if (wildIdx < 0) {
    // Literal path — no glob
    return fs.existsSync(spec) ? [spec] : [];
  }

  // Build parent from segments before the wildcard
  const parentSegments = segments.slice(0, wildIdx);
  const parent = parentSegments.join(path.sep) || path.sep;

  if (!fs.existsSync(parent)) return [];

  let entries;
  try {
    entries = fs.readdirSync(parent, { withFileTypes: true });
  } catch {
    return [];
  }

  const pattern = segments[wildIdx]; // e.g. '*' or 'sp-*'
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => matchSegment(name, pattern));

  // Remaining segments after the wildcard
  const rest = segments.slice(wildIdx + 1);

  const results = [];
  for (const d of dirs) {
    const candidate = path.join(parent, d, ...rest);
    // Only include if the full expanded path exists
    if (fs.existsSync(candidate)) {
      results.push(candidate);
    }
  }
  return results;
}

/**
 * Match a directory name against a simple wildcard pattern.
 * Only supports `*` as "match anything" (not `?`, `[...]`, etc.).
 * Examples: `*` matches all, `sp-*` matches `sp-foo`, `*-mkt` matches `abc-mkt`.
 */
function matchSegment(name, pattern) {
  if (pattern === '*') return true;
  // Convert to a regex: escape everything except *, replace * with .*
  const re = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
  );
  return re.test(name);
}

// ───────────────────────── legacy literal sentinel search ───────────────

/**
 * Search the 5 standard base directories for a literal sentinel path.
 * Preserved for back-compat with detect.any_of entries.
 */
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

// ───────────────────────── per-provider detection ──────────────────────

/**
 * Detect whether a single provider is installed across any harness.
 *
 * Lookup order (first hit wins):
 *  1. plugin_shape match: for each harness, expand plugin_roots, look for
 *     a child dir matching plugin_shape.dir_name, verify required_subdirs.
 *  2. Legacy detect.any_of literal sentinels via existsAnywhere().
 *  3. detect.always === true (manual provider).
 *
 * Returns { name, installed, via?, source?, evidence?, reason? }
 */
function detectProviderAtAnyHarness(cfg, providerName) {
  const providers = (cfg.cp && cfg.cp.providers) || {};
  const provider = providers[providerName];
  if (!provider) return { name: providerName, installed: false, reason: 'unknown provider' };

  const det = provider.detect || {};

  // always:true shortcut (manual provider)
  if (det.always === true) {
    return { name: providerName, installed: true, via: '_builtin', source: 'always' };
  }

  // 1. plugin_shape detection via harnesses
  const shape = provider.plugin_shape;
  if (shape && shape.dir_name) {
    const harnesses = (cfg.cp && cfg.cp.harnesses) || {};
    for (const [harnessName, harness] of Object.entries(harnesses)) {
      const roots = harness.plugin_roots || [];
      for (const rootSpec of roots) {
        const expanded = expandRoot(rootSpec);
        for (const expandedRoot of expanded) {
          const pluginDir = path.join(expandedRoot, shape.dir_name);
          if (fs.existsSync(pluginDir)) {
            // Verify required_subdirs
            const subdirs = Array.isArray(shape.required_subdirs) ? shape.required_subdirs : [];
            const allPresent = subdirs.every((sub) =>
              fs.existsSync(path.join(pluginDir, sub))
            );
            if (allPresent) {
              return {
                name: providerName,
                installed: true,
                via: harnessName,
                source: 'plugin_shape',
                evidence: pluginDir,
              };
            }
          }
        }
      }
    }
  }

  // 2. Legacy literal sentinel fallback
  const candidates = det.any_of || [];
  for (const c of candidates) {
    const hit = existsAnywhere(c);
    if (hit) {
      return {
        name: providerName,
        installed: true,
        via: '_anywhere',
        source: 'literal',
        evidence: hit,
      };
    }
  }

  return { name: providerName, installed: false, reason: 'no sentinel matched' };
}

// ───────────────────────── full scan ───────────────────────────────────

/**
 * Scan all harnesses × all providers and return a full detection report.
 *
 * Returns {
 *   harnesses: [{ name, scannedRoots: [{ root, expanded }], pluginCount }],
 *   providers: [{ name, installed, hits: [{ via, source, evidence }] }]
 * }
 */
function detectAllInstalled(cfg) {
  const harnesses = (cfg.cp && cfg.cp.harnesses) || {};
  const providers = (cfg.cp && cfg.cp.providers) || {};

  // Harness scan
  const harnessReports = [];
  for (const [name, harness] of Object.entries(harnesses)) {
    const roots = harness.plugin_roots || [];
    const scannedRoots = [];
    let pluginCount = 0;
    for (const rootSpec of roots) {
      const expanded = expandRoot(rootSpec);
      scannedRoots.push({ root: rootSpec, expanded });
      pluginCount += expanded.length;
    }
    harnessReports.push({ name, scannedRoots, pluginCount });
  }

  // Provider scan — collect ALL hits (not just first)
  const providerReports = [];
  for (const providerName of Object.keys(providers)) {
    const provider = providers[providerName];
    const det = provider.detect || {};
    const hits = [];

    // always:true
    if (det.always === true) {
      hits.push({ via: '_builtin', source: 'always', evidence: null });
    } else {
      // plugin_shape across harnesses
      const shape = provider.plugin_shape;
      if (shape && shape.dir_name) {
        for (const [harnessName, harness] of Object.entries(harnesses)) {
          const roots = harness.plugin_roots || [];
          for (const rootSpec of roots) {
            const expanded = expandRoot(rootSpec);
            for (const expandedRoot of expanded) {
              const pluginDir = path.join(expandedRoot, shape.dir_name);
              if (fs.existsSync(pluginDir)) {
                const subdirs = Array.isArray(shape.required_subdirs) ? shape.required_subdirs : [];
                const allPresent = subdirs.every((sub) =>
                  fs.existsSync(path.join(pluginDir, sub))
                );
                if (allPresent) {
                  hits.push({ via: harnessName, source: 'plugin_shape', evidence: pluginDir });
                }
              }
            }
          }
        }
      }

      // Legacy literal sentinels
      const candidates = det.any_of || [];
      for (const c of candidates) {
        const hit = existsAnywhere(c);
        if (hit) {
          hits.push({ via: '_anywhere', source: 'literal', evidence: hit });
        }
      }
    }

    providerReports.push({
      name: providerName,
      installed: hits.length > 0,
      hits,
    });
  }

  return { harnesses: harnessReports, providers: providerReports };
}

module.exports = {
  expandRoot,
  matchSegment,
  existsAnywhere,
  detectProviderAtAnyHarness,
  detectAllInstalled,
};
