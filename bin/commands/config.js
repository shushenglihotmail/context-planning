'use strict';

const fs = require('fs');
const { repoRoot } = require('../../lib/paths');
const provider = require('../../lib/provider');

function run(args = []) {
  const root = repoRoot();
  const sub = args[0];

  // refresh reads raw config directly — must NOT go through loadConfig's auto-heal
  if (sub === 'refresh') {
    const dryRun = args.includes('--dry-run');
    const p = provider.configPath(root);
    if (!fs.existsSync(p)) {
      console.error('cp: no .planning/config.json found — run `cp init` first');
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const defaults = provider.loadDefaults();
    const { mergeCpDefaults } = require('../../lib/merge');
    const merged = mergeCpDefaults(raw, defaults);
    if (!merged.changed) {
      console.log('cp: config is already up to date with upstream defaults.');
      return;
    }
    for (const c of merged.plannedChanges) {
      console.log(`cp: ${dryRun ? 'would' : 'will'} add: ${c}`);
    }
    if (dryRun) {
      console.log('(no changes written — use without --dry-run to apply)');
      return;
    }
    fs.writeFileSync(p, JSON.stringify(merged.cfg, null, 2) + '\n');
    console.log(`cp: refreshed .planning/config.json with ${merged.summary}`);
    return;
  }

  // All other subcommands need loaded config
  const cfg = provider.loadConfig(root);
  if (sub === 'get') {
    const key = args[1];
    if (!key) {
      console.log(JSON.stringify(cfg.cp || {}, null, 2));
      return;
    }
    const v = provider.cpGet(cfg, key);
    console.log(v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v, null, 2) : v);
    return;
  }
  if (sub === 'set') {
    const key = args[1];
    let val = args[2];
    if (!key) {
      console.error('Usage: cp config set <key> <value>');
      process.exit(2);
    }
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    else if (val !== '' && !isNaN(Number(val))) val = Number(val);
    provider.cpSet(cfg, key, val);
    provider.saveConfig(cfg, root);
    console.log(`set cp.${key} = ${JSON.stringify(val)}`);
    return;
  }
  console.error('Usage: cp config get [<key>] | set <key> <value> | refresh [--dry-run]');
  process.exit(2);
}

module.exports = { name: 'config', run };
