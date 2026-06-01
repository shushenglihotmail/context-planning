---
phase: 99
title: v1.8 Phase 99 — Project registry + cp project list / cp milestone list
status: done
commit: 7746d36
end-commit: 7746d36b8837da9d29c8f30d4efe87c8d7a08f5a
date: 2026-05-31
---

# Summary

Shipped a global project registry so a future `cp quick --project <name>`
(Phase 100) can resolve a project name to an on-disk path without the
user typing one. Also bundled `cp milestone list` for discovering
milestones in the current project.

## What changed

- **`lib/registry.js`** (new) — zero-dep module with `registryPath`,
  `read`, `write`, `touchIfProject`, `findProjectRoot`, `list`, `remove`.
- **`bin/cp.js#main`** — early best-effort call to
  `registry.touchIfProject(process.cwd())`. Swallows all errors and warns
  once to stderr (`[cp registry] ...`) so a corrupt registry can never
  break `cp`. Skipped for `statusline` (hot path) and `version`.
- **`bin/commands/project.js`** — added `list` and `rm` subcommands
  (existing `update` unchanged).
- **`bin/commands/milestone.js`** (new) — `cp milestone list [--json]`,
  disk-scans `.planning/milestones/` and parses each DESIGN.md's
  frontmatter `milestone:` field or first H1.
- **`bin/commands/index.js`** — registered `milestone` command.
- **`bin/commands/_usage.js`** — documented the 3 new subcommands.
- **`test/unit-registry.js`** (new) — 36 assertions covering touch /
  list / remove / atomic write / corrupt recovery / frontmatter parse.
- **`package.json`** — wired `unit-registry.js` into `npm test`.

## Storage

- Path: `~/.config/cp/projects.json` on all platforms
  (Windows resolves via `$env:USERPROFILE\.config\cp\`).
- Format: `{version:1, projects:[{name,path,first_seen_at,last_seen_at}]}`.
- Atomic write: tmp file + `fs.renameSync`. No locks (last-write-wins is
  fine at expected rates).
- Worktrees: each worktree path gets its own entry. The same `name` may
  repeat — `cp project list` shows all; `cp project rm <name>` errors
  with an ambiguity message when multiple match (resolve with `--path
  <path>` or `--all`).
- No PROJECT.md → silent no-op; no warning, no mutation.

## Done-When verification

- [x] `lib/registry.js` with all 6 exports.
- [x] `touchIfProject` is best-effort; never throws into caller.
- [x] `bin/cp.js` calls `touchIfProject` once per invocation before dispatch.
- [x] Missing `.planning/PROJECT.md` → silent.
- [x] `cp project list` sorts by `last_seen_at` desc; empty → `(no projects registered)`.
- [x] `cp project rm <name>` removes by name; ambiguous → `--path`/`--all` required.
- [x] `cp milestone list` works in current project.
- [x] Unit tests pass (36/36 in unit-registry; 122/122 in unit-command-help).
- [x] `npm test` clean (exit 0).
- [x] One atomic commit `7746d36`.

## Out of scope (deferred)

- `cp quick --project <name>` / `--milestone <name>` resolution → Phase 100.
- Auto-prune entries whose paths no longer exist → P100 resolver will warn.
- `cp project rename <old> <new>` → future enhancement.

## Notes

- Smoke verified locally:
  - `node bin/cp.js project list` shows context-planning (auto-touched).
  - `node bin/cp.js project rm gamma` removed a stray test entry cleanly.
  - `node bin/cp.js milestone list` printed all 14 milestones with active=
    `milestone-workflow-end-to-end-quick-attach`.
- The `touchIfProject` write happens on EVERY `cp` invocation — measured
  cost is one stat + one read + one rename, well under 10ms. Acceptable
  for the value it unlocks in P100.
