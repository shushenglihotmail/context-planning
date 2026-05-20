'use strict';

const path = require('path');
const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/lifecycle');
const inbox = require('../../lib/inbox');

function run(args = []) {
  let json = false;
  let showAll = false;
  let tickIdx = null;
  let note = null;
  let noCommit = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') json = true;
    else if (a === '--all') showAll = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--tick') {
      tickIdx = args[++i];
      if (tickIdx == null) { console.error('--tick requires <N>'); process.exit(2); }
    } else if (a === '--note') {
      note = args[++i];
      if (note == null) { console.error('--note requires <destination>'); process.exit(2); }
    } else { console.error(`unknown option: ${a}`); process.exit(2); }
  }
  const root = repoRoot();

  if (tickIdx !== null) {
    let r;
    try { r = inbox.markTriaged(root, tickIdx, note); }
    catch (e) { console.error(`inbox: ${e.message}`); process.exit(1); }
    lifecycle.writeBatch(r.actions);
    const destPart = r.item.destination ? ` → ${r.item.destination}` : '';
    console.log(`✓ triaged${destPart}  [${r.item.ts}]  ${r.item.text}`);
    if (!noCommit) {
      const commit = lifecycle.gitCommit(root, `cp: triage inbox item${destPart}`, {
        paths: lifecycle.pathsFromActions(r.actions),
      });
      if (commit) console.log(`committed ${commit}`);
    }
    return;
  }

  const state = inbox.listInbox(root);
  if (json) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  if (!state.exists) {
    console.log(`Inbox is empty (no ${path.relative(root, state.path)} yet).`);
    console.log(`Add an item:  cp capture "your idea here"`);
    return;
  }

  console.log(`Inbox: ${path.relative(root, state.path)}`);
  console.log(`Open: ${state.open.length}  Triaged: ${state.triaged.length}`);
  console.log('');
  if (state.open.length === 0) {
    console.log('  (no open items — capture a new one with `cp capture "..."`)');
  } else {
    console.log('## Open');
    for (const it of state.open) {
      console.log(`  ${String(it.idx).padStart(3)}  [${it.ts}]  ${it.text}`);
    }
  }
  if (showAll && state.triaged.length > 0) {
    console.log('');
    console.log('## Triaged');
    for (const it of state.triaged) {
      const dest = it.destination ? `→ ${it.destination}` : '→';
      console.log(`  ${String(it.idx).padStart(3)}  [${it.ts}]  ${dest}  ${it.text}`);
    }
  } else if (!showAll && state.triaged.length > 0) {
    console.log('');
    console.log(`(${state.triaged.length} triaged item(s) hidden — use \`cp inbox --all\`)`);
  }
}

module.exports = { name: 'inbox', run };
