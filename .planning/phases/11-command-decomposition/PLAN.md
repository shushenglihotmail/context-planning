---
phase: "11"
name: Command decomposition
milestone: v0.6 Quality Wave
status: in-progress
created: 2026-05-20
---

# Phase 11: Command decomposition

**Milestone**: v0.6 Quality Wave
**Created**: 2026-05-20

## Goal

Split `bin/cp.js` (1218 LOC, 21 cmd handlers in one file) into per-command
modules under `bin/commands/<name>.js`. Leave `bin/cp.js` as a thin
dispatcher (≤ 200 LOC: shebang, requires, usage(), dispatch switch,
process exit handling). Zero behavior changes; all 19 existing test files
must still pass.

## Success Criteria

1. `bin/commands/` directory exists with one `.js` file per command (or
   logical group for worktree subcommands).
2. `bin/cp.js` is ≤ 200 LOC and contains only: shebang, requires (incl.
   command registry), `usage()` (or `usage` import), `main()` dispatch.
3. Each `bin/commands/<name>.js` exports `{ run(args, ctx) }` and is
   independently `require()`-able from tests.
4. `node test/*.js` — all 19 files green, total assertions ≥ 726.
5. `cp <subcommand>` external behavior unchanged for every subcommand
   (manual sanity: `version`, `doctor`, `status`, `help`).

## Plans

- [x] 11-01: Establish dispatcher pattern + extract first batch (version, init, doctor, status, tick, help/usage)
- [x] 11-02: Extract remaining handlers (config, gsd-import, install, scaffold-*, codebase-status, write-summary, capture, inbox, statusline, complete-milestone, worktree)
- [x] 11-03: Final cleanup, LOC verification, full test sweep, atomic commit per plan

## Notes

### Target shape of `bin/cp.js` (after all 3 plans)

```js
#!/usr/bin/env node
'use strict';
const pkg = require('../package.json');
const usage = require('./commands/_usage');
const registry = require('./commands');  // map of cmd name -> module

function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    usage(); return;
  }
  if (cmd === '--version' || cmd === '-v') {
    console.log(`cp v${pkg.version}`); return;
  }
  const handler = registry[cmd];
  if (!handler) {
    console.error(`cp: unknown command "${cmd}"\n`);
    usage();
    process.exit(2);
  }
  const result = handler.run(rest);
  if (result && typeof result.then === 'function') {
    result.catch((err) => { console.error(err.message || err); process.exit(1); });
  }
}

main();
```

### Module shape for each command (example: `bin/commands/version.js`)

```js
'use strict';
const pkg = require('../../package.json');
module.exports = {
  name: 'version',
  description: 'Print version',
  run() {
    console.log(`cp v${pkg.version}`);
  },
};
```

### Registry (`bin/commands/index.js`)

```js
'use strict';
// Centralised map. Adding a new command = drop a file here + add to this map.
module.exports = {
  version: require('./version'),
  init: require('./init'),
  doctor: require('./doctor'),
  // ...
  worktree: require('./worktree'),
};
```

### Worktree subcommands

`cmdWorktree`, `cmdWorktreeCreate`, `cmdWorktreeList`, `cmdWorktreeRemove`
collapse into a single `bin/commands/worktree.js` that dispatches by
`args[0]` (matches the existing structure inside `cmdWorktree`).

### Tests

No test changes required — tests already invoke either the underlying
lib functions or shell out to `node bin/cp.js`. Decomposition is purely
internal refactor.

### Atomic commits

One commit per plan:
- `cp(11-01): introduce bin/commands/ dispatcher + extract 6 handlers`
- `cp(11-02): extract remaining 15 handlers to bin/commands/`
- `cp(11-03): finalize bin/cp.js dispatcher (≤200 LOC) + verify suite`
