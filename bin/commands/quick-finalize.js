'use strict';

/**
 * `cp quick-finalize <slug> [--outcome "<txt>"] [--body-file <path>] [--json]`
 *
 * Writes SUMMARY.md and flips STATE.md status to complete.
 */

const fs = require('fs');
const { repoRoot } = require('../../lib/paths');
const quick = require('../../lib/quick-helpers');

function _arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function run(args) {
  args = args || [];
  const json = args.includes('--json');
  const positional = args.filter(a => !a.startsWith('--'));
  // _arg consumes the value after the flag, so skip those too.
  const flagValueIdxs = new Set();
  ['--outcome', '--body-file', '--slug'].forEach(f => {
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
      console.error(`cp quick-finalize: ${msg}`); process.exit(1);
    }
    body = fs.readFileSync(bodyFile, 'utf8');
  }
  const r = quick.finalize(slug, { outcome, body, projectDir: repoRoot() });
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
    return;
  }
  if (!r.ok) {
    console.error(`cp quick-finalize: ${r.error}`);
    process.exit(1);
  }
  console.log(`✓ quick task finalized: ${r.slug}`);
  console.log(`  summary: ${r.summaryPath}`);
}

module.exports = { name: 'quick-finalize', run };
