# Phase 27 Design — Pre-commit hook smart shim

## Context

v0.8 detect-layer is in place (`cp audit`) and a fix-loop (`cp audit --fix`)
plus repair verbs landed in phase 26. We now need an *enforcement* boundary
so drift is caught **before** it enters history. Doing it at commit time is
cheap, local, and self-resets if the user reinstalls.

Monorepo reality: a single git root may host multiple cp-managed
sub-projects (e.g., `services/foo/.planning/`, `apps/bar/.planning/`). A
naive hook hard-wired to a single project would silently skip them. The
shim must auto-discover all cp projects under the git root and run the
configured action for each.

## Decision

Ship a **smart shim** at `bin/cp-hook.js` that the .git/hooks/pre-commit
script delegates to. The shim:

1. Locates the git root.
2. Walks for `.planning/STATE.md` files (`maxDepth` = 4 by default;
   configurable via `CP_HOOK_MAXDEPTH` env).
3. For each cp project found, runs the action configured under
   `behavior.pre_commit` in that project's `.planning/cp.config.json`
   (default `audit-high`).
4. Aggregates exit codes — any non-zero blocks the commit.

Install/uninstall live in `lib/hooks.js`. The actual `.git/hooks/pre-commit`
script is a one-liner that execs `node <pluginRoot>/bin/cp-hook.js
pre-commit`. The shim is what does the work, so upgrading `cp` (npm
update) immediately upgrades hook behavior — no reinstall required.

Pre-commit actions supported in this phase:

| name | behavior |
|---|---|
| `off` | no-op; succeeds always |
| `audit-high` (default) | runs `cp audit --severity high --quiet`; fails if any HIGH |
| `audit-any` | runs `cp audit --quiet`; fails on any finding |

Both `audit-high` and `audit-any` use `--quiet` so the hook stays out of
the user's way unless something is wrong.

## Alternatives considered

1. **Per-project .git/hooks/pre-commit** (no shim) — fails in monorepos
   and requires reinstall on every cp upgrade. Rejected.
2. **husky/lefthook integration** — adds a runtime dep, opinions about
   package.json. Rejected; raw git hook + node shim is enough.
3. **Hard-coded `audit-high`** with no config — locks teams in. Rejected;
   `behavior.pre_commit` keeps it tunable.

## Scope (this phase)

- `lib/hooks.js`: `findCpProjects(gitRoot)`, `installHooks(gitRoot)`,
  `uninstallHooks(gitRoot)`, `hookStatus(gitRoot)`.
- `bin/cp-hook.js`: dispatch on `pre-commit | post-commit`. This phase
  ships only `pre-commit`; phase 28 adds `post-commit`.
- `cp install --hooks` flag: install hooks into the enclosing git repo.
- `cp install --uninstall-hooks` flag: remove them.
- Default `behavior.pre_commit` = `audit-high` (set when the config
  doesn't define it; we don't overwrite existing user values).
- Tests: unit for `findCpProjects` + `installHooks`/`uninstallHooks`;
  dryrun for the CLI flag.

## Out of scope

- post-commit (phase 28).
- CI template (phase 29).
- Husky / lefthook / pre-commit.com adapters.
