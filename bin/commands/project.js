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
const registry = require('../../lib/registry');

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

function _list(args) {
  const json = args.includes('--json');
  const items = registry.list();
  if (json) {
    console.log(JSON.stringify({ projects: items }, null, 2));
    return;
  }
  if (items.length === 0) {
    console.log('(no projects registered)');
    return;
  }
  const nameW = Math.max(4, ...items.map((p) => p.name.length));
  const pathW = Math.max(4, ...items.map((p) => p.path.length));
  console.log(
    'NAME'.padEnd(nameW) + '  ' +
    'PATH'.padEnd(pathW) + '  ' +
    'LAST SEEN'
  );
  for (const p of items) {
    const seen = (p.last_seen_at || '').slice(0, 16).replace('T', ' ');
    console.log(
      p.name.padEnd(nameW) + '  ' +
      p.path.padEnd(pathW) + '  ' +
      seen
    );
  }
}

function _rm(args) {
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) {
    console.error('cp project rm: <name-or-path> is required');
    console.error('       optional: --path <path>  --all');
    process.exit(2);
  }
  const opts = {
    path: _arg(args, '--path') || undefined,
    all: args.includes('--all'),
  };
  const res = registry.remove(target, opts);
  if (res.ambiguous) {
    console.error(
      `cp project rm: "${target}" matches ${res.matched} entries. ` +
      `Re-run with --path <path> to disambiguate, or --all to remove all.`
    );
    process.exit(2);
  }
  if (res.removed === 0) {
    console.log(`No entry matched "${target}".`);
    return;
  }
  console.log(`Removed ${res.removed} entr${res.removed === 1 ? 'y' : 'ies'}.`);
}

function run(args) {
  args = args || [];
  const sub = args[0];
  const rest = args.slice(1);
  if (sub === 'update') return _update(rest);
  if (sub === 'list') return _list(rest);
  if (sub === 'rm' || sub === 'remove') return _rm(rest);
  console.error('cp project: unknown subcommand. Try: update | list | rm');
  process.exit(2);
}

module.exports = { name: 'project', run };
