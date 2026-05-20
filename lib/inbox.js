'use strict';

/**
 * lib/inbox.js — pure file-IO module for `.planning/INBOX.md`.
 *
 * INBOX.md is a lightweight capture buffer. Each item is one line in either
 * the `## Open` section (untriaged) or `## Triaged` section (handled).
 *
 * Line format:
 *   open:     `- [ ] [YYYY-MM-DDTHH:mm] free-form text`
 *   triaged:  `- [x] [YYYY-MM-DDTHH:mm] → destination-tag: original text`
 *
 * `destination-tag` is a short label the triage tool wrote (e.g. `quick`,
 *  `phase:02-mvp`, `seed:routing-redesign`, `discard`). cp does NOT enforce
 *  a closed vocabulary — the slash command picks whatever's useful.
 *
 * All exported functions are pure transforms (no fs writes). The CLI layer
 * in `bin/cp.js` is responsible for turning returned `actions` into actual
 * writes via `lifecycle.writeBatch` so they pick up atomic / commit-scoped
 * behaviour automatically.
 *
 * v0.4.0 — initial implementation.
 */

const fs = require('fs');
const path = require('path');
const { planningDir } = require('./paths');

const INBOX_FILENAME = 'INBOX.md';

const HEADER = `# Inbox

Quick captures awaiting triage. Use \`cp capture "..."\` to add an item,
\`cp inbox\` to list, and the \`/cp-capture\` slash command to process them
interactively (route each to a quick task, phase, seed, or discard).

`;

const ITEM_RE_OPEN = /^- \[ \] \[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\] (.+)$/;
const ITEM_RE_DONE = /^- \[x\] \[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\] (?:→\s*)?(?:(\S+):\s*)?(.+)$/i;

function inboxPath(root) {
  return path.join(planningDir(root), INBOX_FILENAME);
}

/**
 * Parse an INBOX.md body into `{ open: [...], triaged: [...] }` arrays of
 * `{ idx, ts, text, destination? }` items. `idx` is the 1-based position
 * within its own section — stable and human-friendly for `cp inbox --tick N`.
 *
 * Anything outside the `## Open` / `## Triaged` sections (e.g. the file
 * header, in-section HTML comments, or stray prose) is preserved verbatim
 * by `renderInbox`.
 */
function parseInbox(content) {
  const open = [];
  const triaged = [];
  if (typeof content !== 'string' || content.length === 0) return { open, triaged };

  // Split into sections by `## Open` / `## Triaged` headings.
  const sections = {};
  let current = null;
  for (const line of content.split(/\r?\n/)) {
    const h = line.match(/^##\s+(Open|Triaged)\s*$/i);
    if (h) {
      current = h[1].toLowerCase();
      sections[current] = sections[current] || [];
      continue;
    }
    if (current) sections[current].push(line);
  }

  let i = 0;
  for (const line of sections.open || []) {
    const m = line.match(ITEM_RE_OPEN);
    if (m) {
      i++;
      open.push({ idx: i, ts: m[1], text: m[2].trim() });
    }
  }
  i = 0;
  for (const line of sections.triaged || []) {
    const m = line.match(ITEM_RE_DONE);
    if (m) {
      i++;
      triaged.push({
        idx: i,
        ts: m[1],
        destination: m[2] || null,
        text: m[3].trim(),
      });
    }
  }
  return { open, triaged };
}

/**
 * Re-render an `{ open, triaged }` shape back to INBOX.md content. Stable
 * formatting: the file header is fixed, items are sorted by their original
 * timestamp ascending, and each section keeps its HTML comment guidance.
 */
function renderInbox({ open = [], triaged = [] } = {}) {
  const openLines = open
    .slice()
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map((it) => `- [ ] [${it.ts}] ${it.text}`);

  const triagedLines = triaged
    .slice()
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map((it) => {
      const dest = it.destination ? `→ ${it.destination}: ` : '→ ';
      return `- [x] [${it.ts}] ${dest}${it.text}`;
    });

  return [
    HEADER.trimEnd(),
    '',
    '## Open',
    '',
    openLines.length
      ? openLines.join('\n')
      : '<!-- new items get appended here as: `- [ ] [YYYY-MM-DDTHH:mm] <text>` -->',
    '',
    '## Triaged',
    '',
    triagedLines.length
      ? triagedLines.join('\n')
      : '<!-- triaged items move here as: `- [x] [YYYY-MM-DDTHH:mm] → <destination>: <text>` -->',
    '',
  ].join('\n');
}

/**
 * Produce a normalized timestamp string for inbox items: ISO-8601 minute
 * precision in local time (e.g. "2026-05-20T14:32"). Pass a Date for tests.
 */
function isoMinute(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Append a new open item to INBOX.md.
 *
 * options.now — optional Date for deterministic tests.
 *
 * Returns `{ actions, item, alreadyPresent }`:
 *   - actions[0] is a write action for INBOX.md (always — even if the file
 *     already existed, we re-render it for consistent formatting).
 *   - item.idx is the 1-based index of the new item within `Open` AFTER
 *     re-sort.
 *   - alreadyPresent is true if an identical (same text, same minute) item
 *     already exists in Open — cp does NOT dedupe, but the caller may want
 *     to warn.
 */
function appendItem(root, text, options = {}) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('appendItem: text must be a non-empty string');
  }
  const cleaned = text.trim();
  const p = inboxPath(root);
  const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const parsed = parseInbox(existing);
  const ts = isoMinute(options.now);
  const alreadyPresent = parsed.open.some((it) => it.ts === ts && it.text === cleaned);
  parsed.open.push({ ts, text: cleaned });
  const after = renderInbox(parsed);
  // Recompute item idx after sort.
  const newIdx = parseInbox(after).open.findIndex(
    (it) => it.ts === ts && it.text === cleaned
  ) + 1;
  return {
    actions: [{ kind: 'write', path: p, after, label: 'append-inbox-item' }],
    item: { idx: newIdx, ts, text: cleaned },
    alreadyPresent,
  };
}

/**
 * Move an open item to the Triaged section.
 *
 * Returns `{ actions, item }`. Throws if no open item has the given 1-based idx.
 */
function markTriaged(root, openIdx, destination = null) {
  const p = inboxPath(root);
  if (!fs.existsSync(p)) throw new Error(`Inbox not found at ${p}. Run \`cp capture "..."\` first.`);
  const parsed = parseInbox(fs.readFileSync(p, 'utf8'));
  const target = parsed.open.find((it) => it.idx === Number(openIdx));
  if (!target) {
    throw new Error(`No open inbox item with index ${openIdx}. Run \`cp inbox\` to see indices.`);
  }
  parsed.open = parsed.open.filter((it) => it.idx !== target.idx);
  parsed.triaged.push({
    ts: target.ts,
    text: target.text,
    destination: destination ? String(destination).trim() : null,
  });
  const after = renderInbox(parsed);
  return {
    actions: [{ kind: 'write', path: p, after, label: 'mark-triaged' }],
    item: { ts: target.ts, text: target.text, destination },
  };
}

/**
 * Read the current inbox state. Returns `{ open: [...], triaged: [...] }`
 * with `idx` fields populated. If INBOX.md doesn't exist, returns empty
 * arrays (NOT an error — capturing for the first time should just work).
 */
function listInbox(root) {
  const p = inboxPath(root);
  if (!fs.existsSync(p)) return { open: [], triaged: [], path: p, exists: false };
  return { ...parseInbox(fs.readFileSync(p, 'utf8')), path: p, exists: true };
}

module.exports = {
  INBOX_FILENAME,
  inboxPath,
  parseInbox,
  renderInbox,
  isoMinute,
  appendItem,
  markTriaged,
  listInbox,
};
