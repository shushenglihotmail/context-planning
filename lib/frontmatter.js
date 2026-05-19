'use strict';

/**
 * YAML frontmatter reader/writer. Backed by the `yaml` package so it handles
 * the full GSD frontmatter shape (nested maps, lists, list-of-maps, inline
 * flow `[]` / `{}`, quoted strings, multiline literals, etc.).
 *
 * Returns `{ frontmatter, body }` for compatibility with earlier callers.
 */

const yaml = require('yaml');

const FENCE = '---';

function split(content) {
  if (!content.startsWith(FENCE)) {
    return { fmText: '', body: content };
  }
  // First fence line, then locate the closing fence on its own line.
  const after = content.slice(FENCE.length);
  // Allow optional leading newline / whitespace after opening fence.
  const m = after.match(/^[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!m) return { fmText: '', body: content };
  const fmText = m[1];
  const body = after.slice(m[0].length);
  return { fmText, body };
}

function parse(content) {
  const { fmText, body } = split(content);
  let frontmatter = {};
  let parseError = null;
  if (fmText.trim()) {
    try {
      const parsed = yaml.parse(fmText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        frontmatter = parsed;
      }
    } catch (e) {
      // Preserve body for lenient callers but surface the error so strict
      // callers (e.g. `cp gsd-import`'s auditor) can report it.
      frontmatter = {};
      parseError = e.message || String(e);
    }
  }
  return { frontmatter, body, parseError };
}

function stringify(frontmatter, body) {
  const dumped = yaml
    .stringify(frontmatter || {}, {
      lineWidth: 0, // never wrap
      defaultStringType: 'PLAIN',
      defaultKeyType: 'PLAIN',
    })
    .replace(/\n$/, ''); // yaml.stringify always ends in a newline
  return `${FENCE}\n${dumped}\n${FENCE}\n${body || ''}`;
}

/** Get a single top-level frontmatter key. */
function get(content, key) {
  return parse(content).frontmatter[key];
}

/** Set a single top-level frontmatter key, returning the updated content. */
function set(content, key, value) {
  const { frontmatter, body } = parse(content);
  frontmatter[key] = value;
  return stringify(frontmatter, body);
}

module.exports = { parse, stringify, get, set };
