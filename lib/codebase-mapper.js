'use strict';

/**
 * lib/codebase-mapper.js — state-layer support for `/cp-map-codebase`.
 *
 * The cp-native equivalent of GSD's `gsd-map-codebase`. Owns:
 *   - scaffolding the `.planning/codebase/` directory with 7 stub files
 *   - reporting which docs exist + their freshness for `/cp-map-codebase`
 *     verification & for `cp doctor`
 *
 * The *exploration* and *content writing* is delegated to whatever sub-agent
 * mechanism the host harness exposes (Copilot CLI's `task` tool, Claude
 * Code's Task tool, etc.). That dispatch lives in `commands/cp/map-codebase.md`.
 * This module deliberately does NOT call any LLM — it's pure file I/O so it
 * can be unit-tested without a model.
 *
 * Output layout (matches GSD exactly, so `cp gsd-import` stays clean):
 *   .planning/codebase/
 *     STACK.md         (tech focus)
 *     INTEGRATIONS.md  (tech focus)
 *     ARCHITECTURE.md  (arch focus)
 *     STRUCTURE.md     (arch focus)
 *     CONVENTIONS.md   (quality focus)
 *     TESTING.md       (quality focus)
 *     CONCERNS.md      (concerns focus)
 */

const fs = require('fs');
const path = require('path');

const paths = require('./paths');

const DOCS = [
  { file: 'STACK.md',        focus: 'tech',     template: 'codebase/STACK.md' },
  { file: 'INTEGRATIONS.md', focus: 'tech',     template: 'codebase/INTEGRATIONS.md' },
  { file: 'ARCHITECTURE.md', focus: 'arch',     template: 'codebase/ARCHITECTURE.md' },
  { file: 'STRUCTURE.md',    focus: 'arch',     template: 'codebase/STRUCTURE.md' },
  { file: 'CONVENTIONS.md',  focus: 'quality',  template: 'codebase/CONVENTIONS.md' },
  { file: 'TESTING.md',      focus: 'quality',  template: 'codebase/TESTING.md' },
  { file: 'CONCERNS.md',     focus: 'concerns', template: 'codebase/CONCERNS.md' },
];

/**
 * The four focus areas a /cp-map-codebase dispatch will use, with the
 * documents each one owns. Consumed by the slash command to build the
 * 4 parallel agent prompts.
 */
const FOCUS_AREAS = [
  { focus: 'tech',     docs: ['STACK.md', 'INTEGRATIONS.md'] },
  { focus: 'arch',     docs: ['ARCHITECTURE.md', 'STRUCTURE.md'] },
  { focus: 'quality',  docs: ['CONVENTIONS.md', 'TESTING.md'] },
  { focus: 'concerns', docs: ['CONCERNS.md'] },
];

function codebaseDir(root) {
  return path.join(paths.planningDir(root), 'codebase');
}

function renderTemplate(text, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
    text
  );
}

/**
 * Create `.planning/codebase/` and seed 7 stub files from the templates.
 *
 * Returns { ok, actions, codebaseDir, created: [filenames], skipped: [filenames],
 *           dryRun? }.
 *
 * options:
 *   - dryRun: boolean — return actions without writing
 *   - force: boolean — overwrite existing stubs (default false)
 *   - today: ISO date string (for tests)
 *
 * Refuses to overwrite any existing file unless force=true. Does NOT refuse
 * if the directory itself exists — only individual files.
 */
function scaffoldCodebase(root, options = {}) {
  const { dryRun = false, force = false, today: todayIso } = options;

  const planning = paths.planningDir(root);
  if (!fs.existsSync(planning)) {
    throw new Error(`.planning/ not found at ${planning}. Run \`cp init\` first.`);
  }

  const cbDir = codebaseDir(root);
  const dateStr = todayIso || new Date().toISOString().slice(0, 10);

  const actions = [];
  const created = [];
  const skipped = [];

  if (!fs.existsSync(cbDir)) {
    actions.push({ kind: 'mkdir', path: cbDir });
  }

  for (const doc of DOCS) {
    const dest = path.join(cbDir, doc.file);
    if (fs.existsSync(dest) && !force) {
      skipped.push(doc.file);
      continue;
    }
    const tplText = paths.readTemplate(doc.template);
    const rendered = renderTemplate(tplText, { DATE: dateStr });
    actions.push({ kind: 'write', path: dest, content: rendered, focus: doc.focus });
    created.push(doc.file);
  }

  if (!dryRun) {
    for (const a of actions) {
      if (a.kind === 'mkdir') fs.mkdirSync(a.path, { recursive: true });
      else if (a.kind === 'write') {
        fs.mkdirSync(path.dirname(a.path), { recursive: true });
        fs.writeFileSync(a.path, a.content);
      }
    }
  }

  return {
    ok: true,
    codebaseDir: cbDir,
    actions,
    created,
    skipped,
    dryRun: dryRun || undefined,
  };
}

/**
 * Inventory `.planning/codebase/`. Returns one row per expected doc with
 * existence, line count, byte size, and a "looks-stub" heuristic.
 *
 * A doc looks like a stub if it's <= 40 lines OR contains the marker
 * "fill via `/cp-map-codebase`" — both true for freshly-scaffolded files.
 */
function codebaseStatus(root) {
  const cbDir = codebaseDir(root);
  const dirExists = fs.existsSync(cbDir);

  const rows = DOCS.map((doc) => {
    const p = path.join(cbDir, doc.file);
    const exists = fs.existsSync(p);
    if (!exists) {
      return { file: doc.file, focus: doc.focus, exists: false, lines: 0, bytes: 0, looksStub: null };
    }
    const txt = fs.readFileSync(p, 'utf8');
    const lines = txt.split('\n').length;
    const bytes = Buffer.byteLength(txt, 'utf8');
    const looksStub =
      lines <= 40 ||
      txt.includes('fill via `/cp-map-codebase`');
    return { file: doc.file, focus: doc.focus, exists: true, lines, bytes, looksStub };
  });

  const allExist = rows.every((r) => r.exists);
  const allFilled = rows.every((r) => r.exists && r.looksStub === false);

  return { dirExists, codebaseDir: cbDir, rows, allExist, allFilled };
}

module.exports = {
  DOCS,
  FOCUS_AREAS,
  codebaseDir,
  scaffoldCodebase,
  codebaseStatus,
};
