'use strict';

/**
 * `cp project <subcommand>` — declarative PROJECT.md mutations.
 *
 * Subcommands:
 *   cp project update --from <file> [--json] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { repoRoot } = require('../../lib/paths');
const pu = require('../../lib/project-update');

function _arg(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] || null;
}

function _update(args) {
  const root = repoRoot();
  const file = _arg(args, '--from');
  const json = args.includes('--json');
  const dry = args.includes('--dry-run');
  if (!file) {
    console.error('cp project update: --from <file> is required');
    process.exit(2);
  }
  const abs = path.isAbsolute(file) ? file : path.join(root, file);
  if (!fs.existsSync(abs)) {
    console.error(`cp project update: input not found: ${file}`);
    process.exit(2);
  }
  let update;
  try { update = JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (e) { console.error('cp project update: invalid JSON: ' + e.message); process.exit(2); }

  if (dry) {
    const v = pu.validateUpdate(update);
    const out = { ok: v.ok, errors: v.errors, opsCount: Array.isArray(update.ops) ? update.ops.length : 0 };
    if (json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(v.ok ? `✓ valid (${out.opsCount} ops)` : `✗ invalid: ${v.errors.join('; ')}`);
    }
    process.exit(v.ok ? 0 : 1);
  }

  let result;
  try { result = pu.applyUpdates(root, update); }
  catch (e) { console.error('cp project update: ' + e.message); process.exit(1); }

  if (json) {
    console.log(JSON.stringify({ ok: true, applied: result.applied.length, skipped: result.skipped.length, details: result }, null, 2));
  } else {
    console.log(`✓ project update applied: ${result.applied.length} ops, ${result.skipped.length} skipped`);
    for (const a of result.applied) console.log(`  + ${a.op.op}: ${a.action}`);
    for (const s of result.skipped) console.log(`  - ${s.op.op}: skipped (${s.reason})`);
  }
}

function run(args) {
  args = args || [];
  const sub = args[0];
  const rest = args.slice(1);
  if (sub === 'update') return _update(rest);
  console.error('cp project: unknown subcommand. Try: update');
  process.exit(2);
}

module.exports = { name: 'project', run };
