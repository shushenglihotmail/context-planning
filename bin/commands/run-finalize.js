'use strict';

/**
 * `cp run-finalize <slug> [--outcome "<txt>"] [--body-file <path>] [--json]`
 *
 * Generic finalizer for `cp run <workflow>` runs that don't ship a more
 * specific finalize command (e.g. `cp quick-finalize`, `cp milestone-finalize`).
 * Flips STATE.yaml `status` to `complete`, sets `current_phase: null`, and
 * writes a minimal SUMMARY.md under the run directory. Idempotent.
 *
 * Invoked automatically by the auto-injected finalize phase (v1.6 D1)
 * whenever a workflow YAML omits its own finalize phase.
 */

const fs = require('fs');
const path = require('path');
const { repoRoot } = require('../../lib/paths');
const custom = require('../../lib/custom');

function _arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function _writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function finalize(slug, opts) {
  const o = opts || {};
  if (!slug) return { ok: false, error: 'missing slug' };
  let dir;
  try {
    dir = custom.runDir(slug, { projectDir: o.projectDir });
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
  if (!fs.existsSync(dir)) {
    return { ok: false, error: `run not found: ${slug}` };
  }
  try {
    custom.writeState(
      slug,
      { status: 'complete', current_phase: null },
      { projectDir: o.projectDir },
    );
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
  const summaryPath = path.join(dir, 'SUMMARY.md');
  const outcome = String(o.outcome || '').trim() || '_(fill in outcome)_';
  const body = o.body ? `\n${o.body}\n` : '';
  _writeFile(
    summaryPath,
    `# Summary: ${slug}\n\n`
      + `Completed: ${new Date().toISOString()}\n\n`
      + `## Outcome\n\n${outcome}\n${body}`,
  );
  return { ok: true, slug, summaryPath };
}

function run(args) {
  args = args || [];
  const json = args.includes('--json');
  const flagValueIdxs = new Set();
  ['--outcome', '--body-file'].forEach(f => {
    const i = args.indexOf(f);
    if (i >= 0) flagValueIdxs.add(i + 1);
  });
  const slug = args.find((a, i) => !a.startsWith('--') && !flagValueIdxs.has(i)) || null;
  const outcome = _arg(args, '--outcome');
  const bodyFile = _arg(args, '--body-file');
  let body = null;
  if (bodyFile) {
    if (!fs.existsSync(bodyFile)) {
      const msg = `body-file not found: ${bodyFile}`;
      if (json) { console.log(JSON.stringify({ ok: false, error: msg })); process.exit(1); }
      console.error(`cp run-finalize: ${msg}`); process.exit(1);
    }
    body = fs.readFileSync(bodyFile, 'utf8');
  }
  const r = finalize(slug, { outcome, body, projectDir: repoRoot() });
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
    return;
  }
  if (!r.ok) {
    console.error(`cp run-finalize: ${r.error}`);
    process.exit(1);
  }
  console.log(`✓ run finalized: ${r.slug}`);
  console.log(`  summary: ${r.summaryPath}`);
}

module.exports = { name: 'run-finalize', run, finalize };
