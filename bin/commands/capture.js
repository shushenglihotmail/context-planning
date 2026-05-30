'use strict';

const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/lifecycle');
const inbox = require('../../lib/inbox');

function printUsage(stream) {
  stream.write(
    'Usage: cp capture <text> [--no-commit]\n' +
    '\n' +
    '  Append a free-form item to .planning/INBOX.md with an ISO timestamp.\n' +
    '  Triage open items later with `/cp-capture` (slash command) or list\n' +
    '  them with `cp inbox`.\n' +
    '\n' +
    'Args:\n' +
    '  <text>          One or more words; everything not starting with -- is\n' +
    '                  joined with spaces into a single inbox item.\n' +
    '\n' +
    'Flags:\n' +
    '  --no-commit     Write the file but skip the auto-commit.\n' +
    '  -h, --help      Show this message and exit.\n' +
    '\n' +
    'Examples:\n' +
    '  cp capture "remember to refactor the worker pool"\n' +
    '  cp capture quick:rename-version-flag --no-commit\n'
  );
}

function run(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage(process.stdout);
    process.exit(0);
  }
  // Collect everything up to first -- flag as the text. Allow --no-commit too.
  let noCommit = false;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--no-commit') noCommit = true;
    else if (a === '--dry-run') {
      // Treat dry-run as no-commit + no-write. Useful for the slash command
      // when proposing what would be captured.
      console.error(`(dry-run not supported on capture — use \`cp inbox\` to see what would happen)`);
      process.exit(2);
    } else if (a.startsWith('--')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else positional.push(a);
  }
  const text = positional.join(' ').trim();
  if (!text) {
    printUsage(process.stderr);
    process.exit(2);
  }
  const root = repoRoot();
  let r;
  try { r = inbox.appendItem(root, text); }
  catch (e) { console.error(`capture: ${e.message}`); process.exit(1); }

  lifecycle.writeBatch(r.actions);
  console.log(`✓ inbox #${r.item.idx}  [${r.item.ts}]  ${r.item.text}`);
  if (r.alreadyPresent) {
    console.log(`  (note: an identical item already exists at the same minute — kept both)`);
  }

  if (!noCommit) {
    const commit = lifecycle.gitCommit(root, `cp: capture inbox item #${r.item.idx}`, {
      paths: lifecycle.pathsFromActions(r.actions),
    });
    if (commit) console.log(`committed ${commit}`);
  }
}

module.exports = { name: 'capture', run };
