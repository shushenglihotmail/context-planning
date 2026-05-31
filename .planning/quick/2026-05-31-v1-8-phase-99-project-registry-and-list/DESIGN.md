---
title: v1.8 Phase 99 — Project registry + `cp project list`/`cp milestone list`
status: ready
---

# Goal

Make `cp` aware of all projects the user has ever touched, so future
`cp quick --project <name>` (Phase 100) can resolve a name → project
path without the user typing a path. Also add `cp milestone list` for
the *current* project (disk-scan, no registry).

# Approach

## Storage

- Path: `~/.config/cp/projects.json` on **all** platforms.
  - On Windows resolved via `$env:USERPROFILE\.config\cp\projects.json`.
  - Created on demand (lazy mkdirSync recursive).
- Format:
  ```json
  {
    "version": 1,
    "projects": [
      {
        "name": "context-planning",
        "path": "C:/src/github/context-planning",
        "first_seen_at": "2026-05-31T12:00:00.000Z",
        "last_seen_at": "2026-05-31T13:45:11.123Z"
      }
    ]
  }
  ```
- Worktrees: each worktree gets its own entry (separate `path`). The
  same `name` may appear multiple times (different paths). `cp project
  list` will show all entries; resolver in Phase 100 will error if a
  name is ambiguous.

## Atomic write

Last-write-wins with atomic rename:

```js
fs.writeFileSync(tmpPath, json + '\n');
fs.renameSync(tmpPath, registryPath);
```

`tmpPath` = `<registryPath>.<pid>.<timestamp>.tmp`. Sufficient for the
expected write rate (a few writes per minute max). No locks.

## Auto-insert trigger

Every `cp` invocation runs through `bin/cp.js#main`. Insert a single
new function call after the command resolves but before it executes:

```js
registry.touchIfProject(process.cwd());  // best-effort, swallows errors
```

`touchIfProject(cwd)`:
1. Resolve cwd's project root by walking up looking for
   `.planning/PROJECT.md`. If not found → return (no-op).
2. Parse first H1 of PROJECT.md as project name. If absent → return.
3. Read registry (create if missing).
4. Find entry with matching `path === projectRoot`. If exists →
   update `last_seen_at`. If not → append new entry with both
   `first_seen_at` and `last_seen_at` = now.
5. Write atomically.

Failures (EACCES, bad JSON, etc.) are caught and logged once to
stderr with `[cp registry]` prefix — registry corruption must never
break a `cp` command.

## New commands

### `cp project list`

Reads registry, prints a table to stdout:

```
NAME                PATH                                    LAST SEEN
context-planning    C:/src/github/context-planning          2026-05-31 13:45
my-other-project    C:/src/work/my-other-project            2026-05-29 10:22
```

Sort by `last_seen_at` desc. Empty registry → `(no projects registered)`.

### `cp project rm <name-or-path>`

Removes matching entry(ies). If `<name-or-path>` matches multiple
(e.g. a name with two worktrees), prompt to confirm bulk removal or
require `--path` to disambiguate.

Print `Removed N entry(ies).`

### `cp milestone list`

Disk-scan, NOT registry-based:
1. Walk up from cwd to find `.planning/`.
2. List entries in `.planning/milestones/` (each is a slug-named dir).
3. For each, parse first H1 of `DESIGN.md` (fallback: slug).
4. Show table:
   ```
   NAME                          SLUG                            STATUS
   v1.8 supervisor improvements  v1-8-supervisor-improvements    active
   v1.7 docs polish              v1-7-docs-polish                archived
   ```
   Status: derive from `STATE.md` `Current focus:` line (if matches →
   active, else inactive; if dir is under `.planning/milestones/archived/`
   then archived).

## File layout

- **NEW** `lib/registry.js` — pure module, zero deps. Exports:
  - `registryPath()` → absolute path
  - `read()` → parsed object or empty default
  - `write(obj)` → atomic write
  - `touchIfProject(cwd)` → see above
  - `list()` → sorted projects array
  - `remove(nameOrPath, opts)` → mutate registry
- **MOD** `bin/cp.js` — single call to `registry.touchIfProject(process.cwd())` early in `main`.
- **NEW** `bin/commands/project.js` — wires `cp project list` and `cp project rm`.
- **NEW** `bin/commands/milestone.js` — wires `cp milestone list`.
- **MOD** `bin/cp.js` command dispatch table to add `project` and `milestone` top-level commands.

## Out of scope (deferred to Phase 100)

- `cp quick --project <name>` and `--milestone <name>` resolution.
- The "first H1 of PROJECT.md" parsing helper can be shared with Phase 100.

# Done-When

- [ ] `lib/registry.js` exists with all 6 exports above.
- [ ] `lib/registry.js#touchIfProject` is best-effort: never throws into caller.
- [ ] `bin/cp.js` calls `registry.touchIfProject` exactly once per invocation, before command dispatch.
- [ ] Skipping with no `.planning/PROJECT.md` is silent (no registry mutation, no warning).
- [ ] `cp project list` prints sorted table; empty registry → `(no projects registered)`.
- [ ] `cp project rm <name>` removes by exact name; if ambiguous, prompts or requires `--path`.
- [ ] `cp milestone list` works in current project, scans `.planning/milestones/`.
- [ ] Unit tests for `lib/registry.js`:
      - touch creates new entry
      - touch updates `last_seen_at` for existing entry
      - touch is a no-op when no PROJECT.md
      - atomic write survives an in-flight rename
      - list sorts by `last_seen_at` desc
      - remove by name; remove ambiguous returns error
- [ ] CLI smoke tests for `cp project list`, `cp project rm`, `cp milestone list` (similar pattern to existing CLI tests).
- [ ] `npm test` clean.
- [ ] One atomic commit `feat(registry): project registry + cp project list/rm + cp milestone list (v1.8 P99)`.

# Notes / open follow-ups

- Could later add `cp project rename <old> <new>` — out of scope here.
- Could later prune entries whose `path` no longer exists on disk; for
  now `cp project list` just shows them (Phase 100 resolver will warn
  if path is gone).
- The "best-effort, never throws" touch is critical: a corrupt
  registry must not break `cp`. We log once to stderr and continue.
