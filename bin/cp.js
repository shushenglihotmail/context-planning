#!/usr/bin/env node
'use strict';

/**
 * cp — context-planning CLI entry.
 *
 * v0.6: thin dispatcher. Each command lives in bin/commands/<name>.js as
 * a module exporting { name, run(args) }. The registry in
 * bin/commands/index.js maps subcommand names to their handlers.
 *
 * To add a new command:
 *   1. Drop bin/commands/<name>.js exporting { name, run }.
 *   2. Add an entry to bin/commands/index.js.
 *   3. (Optional) Update bin/commands/_usage.js if it should appear in `cp help`.
 *
 * To see the full subcommand list, run: `cp help`.
 */

const usage = require('./commands/_usage');
const registry = require('./commands');
const projectRegistry = require('../lib/registry');
const { normalizeArgv } = require('./commands/_helpers');

const _SKIP_TOUCH = new Set(['statusline', 'version', '--version', '-v']);

function main(argv) {
  const normalized = normalizeArgv(argv.slice(2));
  const [cmd, ...rest] = normalized;

  // Best-effort: record this project in the global registry so
  // `cp project list` / `cp quick --project <name>` can find it later.
  // Suppressed for hot-path commands (statusline) that must stay quiet
  // and fast, and for `project rm` itself (avoid resurrecting an entry
  // the user is trying to delete from this very repo).
  if (cmd && !_SKIP_TOUCH.has(cmd)) {
    try { projectRegistry.touchIfProject(process.cwd()); }
    catch (_e) { /* best-effort only */ }
  }

  // Registry-first dispatch.
  if (cmd && Object.prototype.hasOwnProperty.call(registry, cmd)) {
    return registry[cmd].run(rest);
  }

  // Built-in aliases not in the registry.
  switch (cmd) {
    case '--version':
    case '-v':
      return registry.version.run();
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      return usage();
    default:
      console.error(`unknown command: ${cmd}`);
      usage();
      process.exit(2);
  }
}

if (require.main === module) {
  main(process.argv);
}

// Public exports — kept for back-compat with tests and external require()s.
module.exports = { normalizeArgv, main, registry };
