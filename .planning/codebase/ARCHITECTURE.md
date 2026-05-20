# Architecture

`cp` is a pure-function, state-layer-only library wrapped by a thin single-process CLI dispatcher and a set of harness installers. It has no daemon, server, database, or background worker: each invocation reads `.planning/` state, computes an action list, writes files atomically, optionally scopes a Git commit, and exits. The library owns workflow/state transitions; the CLI owns argv parsing, user-facing output, and exit codes; installers only seed harness-specific command/skill files.

## Module boundaries

- `lib/` — pure file-IO workflow modules: `lifecycle`, `inbox`, `worktree`, `codebase-mapper`, `gsd-compat`, `import`, `provider`, `roadmap`, `paths`, `milestone`. These modules do the actual work and return data/actions; they do **not** parse CLI args or call `console.log`.
- `bin/cp.js` — the single-file CLI dispatcher (`main()` switch). It parses argv, prints usage/output/errors, sets exit codes, and calls `lib/*` for real work.
- `install/` — harness installers for `copilot`, `claude`, `cursor`, and `aider`. Each exports `install({pluginRoot, repoRoot, force})` and uses `install/common.js` (`writeFileSafe`) for collision-aware writes.
- `commands/cp/` — markdown slash-command bodies. Every installer auto-installs these files via `listCommandFiles`.
- `templates/` — file templates seeded by `cp init` and scaffold commands.
- `test/` — flat Node test files using `ok`/`section`/`process.exit(1)` style; no Jest/Mocha.

## Data flow

`cp tick <plan-id>` follows one path end-to-end: `bin/cp.js cmdTick(args)` parses argv → `lib/lifecycle.js tickPlan(root, planId, {undo})` reads ROADMAP + phase PLAN and returns `{actions: [{kind:'write', path, after}]}` → `lib/lifecycle.js writeBatch(actions)` stages temp files, renames atomically, then deletes → `lib/lifecycle.js gitCommit(root, msg, {paths: lifecycle.pathsFromActions(actions)})` creates a scoped commit.

## Key design patterns

- **Action-list pattern**: lifecycle ops return `{actions:[...]}` so the CLI can dry-run, batch-write, and commit uniformly. See `lib/lifecycle.js` (`writeBatch`), `lib/inbox.js` (`appendItem`), `lib/worktree.js` (`addRegistryEntry`).
- **Atomic temp+rename writes**: `lib/lifecycle.js writeFile` writes to `.cp-tmp-{pid}-{rand}` then `fs.renameSync`s into place; `writeBatch` stages all writes, renames all, then deletes, with rollback on rename failure (v0.3.4).
- **Collision-aware installer writes**: `install/common.js writeFileSafe` returns `{status: written|identical|user-modified}`; `--force` permits clobbering; exit 3 when the user keeps the existing file (v0.3.4).
- **Provider abstraction**: `lib/provider.js` resolves a role to an installed skill, then falls back to inline prompts. `cp` owns state; the provider owns workflow selection only.

## Cross-cutting concerns

- Path handling: use `lib/paths.js` (`planningDir`, `repoRoot`, `readTemplate`) everywhere; never concatenate planning paths by hand.
- Git scoping: always commit with `gitCommit(root, msg, {paths: lifecycle.pathsFromActions(r.actions)})` (v0.3.3). Never use repo-wide `git add -A` for cp state changes.
- Config: shared `.planning/config.json` carries GSD plus a nested `cp` block; use `lib/provider.js cpGet/cpSet`.
- Logging/errors: stdout for normal output, stderr for errors, `process.exit(1|2|3)` for failures.

## Boundaries the executor must respect

- Never import from `bin/` into `lib/`.
- Never call `console.log` from `lib/*`.
- Never commit non-`.planning/` paths from a `cp:` commit message; `pathsFromActions` enforces the invariant.

## State lifecycle

A typical milestone has four phases: scaffold → tick → write-summary → complete-milestone. Each phase reads `.planning/ROADMAP.md` + the active phase's `PLAN.md`, computes an action list, atomically writes the new state, and commits with a scoped path list. `cp resume` and `cp status` are pure reads: they never write.

## Extension points

- **New lifecycle verb**: add `lib/<verb>.js` returning `{actions:[...]}` + `bin/cp.js cmd<Verb>` handler + slash command + unit test + register in `package.json scripts.test`.
- **New harness installer**: drop `install/<harness>.js` exporting `install({pluginRoot, repoRoot, force})`; pickup is automatic in `cmdInstall`.
- **New provider role**: extend `templates/config.json providers.<name>.skills` map and `lib/provider.js resolveSkill`.