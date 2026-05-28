'use strict';

/**
 * `cp abandon <run-id> [--reason "<txt>"] [--json]`
 *
 * Soft-abandon a workflow run. Only edits state.json; never touches git.
 */

const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/run-lifecycle');

function _arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function run(args) {
  args = args || [];
  const json = args.includes('--json');
  const flagValueIdxs = new Set();
  ['--reason'].forEach(f => {
    const i = args.indexOf(f);
    if (i >= 0) flagValueIdxs.add(i + 1);
  });
  const slug = args.find((a, i) => !a.startsWith('--') && !flagValueIdxs.has(i)) || null;
  const reason = _arg(args, '--reason');
  if (!slug) {
    const msg = 'run-id required: cp abandon <run-id>';
    if (json) { console.log(JSON.stringify({ ok: false, error: msg })); process.exit(1); }
    console.error(`cp abandon: ${msg}`); process.exit(1);
  }
  const r = lifecycle.abandon(slug, { reason, projectDir: repoRoot() });
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
    return;
  }
  if (!r.ok) {
    console.error(`cp abandon: ${r.error}`);
    process.exit(1);
  }
  if (r.already) console.log(`= run "${r.slug}" was already abandoned`);
  else console.log(`✓ run "${r.slug}" abandoned (soft — git untouched)`);
}

module.exports = { name: 'abandon', run };
