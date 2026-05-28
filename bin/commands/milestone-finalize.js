'use strict';

/**
 * `cp milestone-finalize <slug> [--name "Display Name"] [--json]`
 *
 * Used by milestone.yaml's `finalize` phase (kind: scaffold) to refresh
 * STATE.md with the new milestone's current-focus block and emit a
 * deterministic next-step banner that the workflow runner relays.
 */

const { repoRoot } = require('../../lib/paths');
const helpers = require('../../lib/milestone-helpers');

function _arg(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] || null;
}

function run(args) {
  args = args || [];
  const json = args.includes('--json');
  const name = _arg(args, '--name');
  const slug = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--name') || null;
  const r = helpers.finalize(slug, { projectDir: repoRoot(), milestoneName: name || undefined });
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
    return;
  }
  if (!r.ok) {
    console.error('cp milestone-finalize: ' + r.error);
    process.exit(1);
  }
  console.log(r.banner);
}

module.exports = { name: 'milestone-finalize', run };
