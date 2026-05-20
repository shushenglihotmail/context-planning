# Code Conventions

Canonical rules for `cp` as of v0.4.3.

## Naming
- Functions and methods use camelCase: `scaffoldMilestone`, `parseInbox`, `normalizeArgv`.
- Filenames use kebab-case: `gsd-compat.js`, `codebase-mapper.js`.
- Do not introduce classes; avoid PascalCase module APIs and class-based design.
- CLI handlers are named `cmd<Name>` in `bin/cp.js` (for example `cmdTick`, `cmdInbox`).
- Subcommand names are hyphenated at the CLI boundary: `cp scaffold-milestone`, not `cp scaffoldMilestone`.

## Import / export style
- Use CommonJS only: `require(...)` and `module.exports`.
- Do not add ESM syntax (`import`, `export`) anywhere in the repo.
- Every library file should start with `'use strict';`.
- Keep exports small and explicit; prefer a single object export from each module.

## Error handling
- `lib/*` functions should throw `Error` with descriptive messages.
- `lib/*` must not call `process.exit()` or own user-facing exit codes.
- `bin/cp.js` owns argv parsing, stdout/stderr, and exit handling.
- CLI handlers wrap lifecycle calls in `try/catch` and exit with `process.exit(1)` on runtime failure.
- Exit codes are: `0` success, `1` runtime error, `2` usage error, `3` installer kept user-modified files.

## Logging
- Use plain `console.log` for stdout and `console.error` for stderr.
- Do not add a logger library.
- Use markers `✓`, `+`, `=`, `!` for write-state messaging.
- Use raw ANSI color only when `process.stdout.isTTY && !process.env.NO_COLOR`.

## Comments & docs
- Add a top-of-file JSDoc comment to each module explaining purpose and version-added context.
- Add function-level JSDoc only when the return shape is not obvious.
- Avoid inline comments unless they explain a subtle invariant.

## Formatting & linting
- Match existing style by hand; do not add Prettier or ESLint config.
- Use 2-space indentation, single quotes, and trailing semicolons.
- Keep files consistent with the current repository conventions rather than auto-formatting.

## Argv parsing
- Hand-rolled per `cmd*` handler with a `for (let i=0; i<args.length; i++)` loop. No `yargs`, no `commander`.
- Every handler benefits from the universal `normalizeArgv(argv)` preprocessor in `bin/cp.js` which splits `--key=value` into `[--key, value]` (v0.3.4).
- Flag conventions: long-form only (`--force`, `--json`, `--dry-run`), no short-form aliases. Boolean flags take no value; value flags consume the next argv slot.

## Action-list contract
- Every lifecycle op returns `{actions: [{kind:'write'|'delete'|'skip', path, after?, label?}]}`.
- CLI handlers MUST call `lifecycle.writeBatch(r.actions)` for writes, then `lifecycle.gitCommit(root, msg, {paths: lifecycle.pathsFromActions(r.actions)})` for scoped commits.
- Never bypass `writeBatch` to write `.planning/` state directly — atomic semantics depend on it.