'use strict';

/**
 * lib/name-resolve.js — name-based lookup helper, shared by `cp quick`
 * flag resolution and any other CLI surface that needs friendly
 * name → object resolution.
 *
 * Zero dependencies.
 *
 * Resolution order:
 *   1. Exact case-insensitive name match → if unique, return it.
 *   2. Case-insensitive substring match → if exactly one, return it.
 *   3. Otherwise → return candidate list for a friendly error.
 */

/**
 * @param {Array<{name: string}>} candidates  list of objects with a `name`
 * @param {string} query                       user-typed query
 * @returns {{ok: true, match: object} | {ok: false, kind: 'none'|'ambiguous', candidates: object[]}}
 */
function resolveByName(candidates, query) {
  const list = Array.isArray(candidates) ? candidates : [];
  const q = String(query || '').trim();
  if (!q) return { ok: false, kind: 'none', candidates: list };

  const lc = q.toLowerCase();

  // 1. Exact case-insensitive name match.
  const exact = list.filter((c) => String(c.name || '').toLowerCase() === lc);
  if (exact.length === 1) return { ok: true, match: exact[0] };
  if (exact.length > 1) return { ok: false, kind: 'ambiguous', candidates: exact };

  // 2. Case-insensitive substring match.
  const substr = list.filter((c) => String(c.name || '').toLowerCase().includes(lc));
  if (substr.length === 1) return { ok: true, match: substr[0] };
  if (substr.length > 1) return { ok: false, kind: 'ambiguous', candidates: substr };

  // 3. No match.
  return { ok: false, kind: 'none', candidates: list };
}

/**
 * Build a friendly error message for a failed resolution.
 *
 * @param {string} thing  user-visible noun, e.g., "project" or "milestone"
 * @param {string} query  what the user typed
 * @param {{kind: 'none'|'ambiguous', candidates: Array<{name: string, slug?: string}>}} result
 */
function formatError(thing, query, result) {
  const lines = [];
  if (result.kind === 'ambiguous') {
    lines.push(`${result.candidates.length} ${thing}s match "${query}". Be more specific:`);
  } else {
    lines.push(`no ${thing} named "${query}".`);
    if (result.candidates.length > 0) {
      lines.push(`  Available ${thing}s:`);
    } else {
      lines.push(`  (no ${thing}s registered)`);
    }
  }
  for (const c of result.candidates) {
    lines.push(`    - ${c.name}${c.slug && c.slug !== c.name ? `  (${c.slug})` : ''}`);
  }
  return lines.join('\n');
}

module.exports = { resolveByName, formatError };
