---
phase: "18"
name: Auto key-files at write-time
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-21
base-commit: 928860654550bddfe936457af1881d1c2c387fe8
---

# Phase 18: Auto key-files at write-time

**Milestone**: v0.8 Consistency
**Created**: 2026-05-21

## Goal

Auto-fill `key-files` in SUMMARY.md frontmatter from
`git diff --name-status <PLAN.base-commit>..<HEAD>` at
`cp write-summary` time, defaulting on with `--no-auto-key-files`
opt-out and a one-line stderr notice. Eliminates drift cause #1
(forgetful executor) for the default code path.

## Success Criteria

1. Running `cp write-summary N-M` in a git repo, where PLAN.md has
   `base-commit: <sha>`, auto-fills `key-files.created` /
   `key-files.modified` from the git diff, and writes a one-line
   stderr notice
   `cp: key-files auto-filled (N files: K created, M modified)`.
2. Caller-supplied `key-files` entries are preserved (de-duped) —
   auto-fill is union, not replace.
3. `cp write-summary N-M --no-auto-key-files` skips the auto-fill
   entirely. No notice. Caller-supplied entries only.
4. PLAN.md missing `base-commit` (pre-v0.8) → auto-fill silently
   skipped, no notice, no error.
5. `.planning/` paths are filtered out of auto-fill (cp's own
   state is not a phase deliverable).
6. Path handling is NUL-separated (`git diff -z`) — robust to
   spaces, quotes, unicode.
7. All existing test assertions stay green; +~27 new assertions
   covering happy path, opt-out, pre-v0.8 fallback, dedupe,
   filtering, and CLI flag.

## Plans

- [ ] 18-01: `lib/git.js::diffNameOnly` helper + `_autoFillKeyFiles` step in writeSummary (both lib paths) + tests
- [ ] 18-02: `bin/commands/write-summary.js --no-auto-key-files` CLI flag + dry-run test + dogfood verification

## Notes

### Per-plan breakdown

#### Plan 18-01 — diff helper + auto-fill step (both lib paths)

**Files:**

- `lib/git.js` (extend, +~40 LOC):
  - `diffNameOnly(base, end, opts?) → Array<{path, status}>` where
    `status` is `'A'` (added) / `'M'` (modified) / `'D'` (deleted) /
    `'R'` (renamed-to-path) / `'C'` (copied).
  - Implementation: `spawnSync('git', ['diff', '-z', '--name-status', base + '..' + end], { cwd, encoding: 'utf8' })`.
  - Parses NUL-separated `<status>\t<path>` pairs. Renames look like
    `R100\0<old>\0<new>` — emit one entry with `status='M'` and
    `path=<new>` (the new path is what the executor would care about).
  - Returns `[]` if base or end is null / empty, if `result.status !== 0`,
    or on parse error. Never throws.

- `lib/milestone.js` (extend, +~50 LOC):
  - New `_extractPhaseBaseCommit(phaseDir)` — reads PLAN.md via `fm.parse`,
    returns `frontmatter['base-commit']` or null. Returns null if file
    absent or has no key.
  - New `_autoFillKeyFiles(normalised, root, phaseDir, endSha, opts)` —
    pure-ish (mutates `normalised['key-files']` in-place and returns
    a `{ added, created: [], modified: [] }` summary for the caller
    to format the notice).
    - Bail if `opts.autoKeyFiles === false`.
    - Bail if `endSha` is null OR `_extractPhaseBaseCommit` returns null.
    - Call `git.diffNameOnly(base, endSha, { cwd: root })`.
    - Filter out paths starting with `.planning/` (use forward-slash
      check; `git diff` always emits forward slashes even on Windows).
    - Initialise `normalised['key-files'] = { created: [], modified: [] }`
      if absent. Then for each diff entry:
      - `status === 'A'` → push to `created` if not already there.
      - `status === 'D'` or `'M'` or `'R'` or `'C'` → push to `modified`
        if not already there.
    - Return `{ added, created: [...just-added...], modified: [...just-added...] }`.
  - In `writeSummary`: compute `endSha = git.headSha({ cwd: root })`
    ONCE near the top of the post-normalisation block. Call
    `_autoFillKeyFiles(normalised, root, phaseDir, endSha, options)`.
    If `result.added > 0`, write to stderr:
    `cp: key-files auto-filled (${result.added} files: ${result.created.length} created, ${result.modified.length} modified)\n`.
    Pass the same `endSha` to the existing end-commit stamping path
    (refactor: `if (!('end-commit' in normalised)) { if (endSha) normalised['end-commit'] = endSha; }`).

- `lib/lifecycle.js::writeSummary` — same extension to keep the two
  paths consistent.

- `test/unit-git-sha.js` (extend, +~7 assertions):
  - `diffNameOnly` returns entries with correct status for added /
    modified / deleted files in a fixture repo.
  - `diffNameOnly` returns `[]` for invalid base SHA.
  - `diffNameOnly` returns `[]` when base equals end.
  - NUL-separated parser handles a file with a space in its name.

- `test/unit-lifecycle.js` (extend, +~13 assertions across 2 sections):
  - Auto-fill happy path: 2 files committed between base and end SHAs;
    after writeSummary, `key-files.created` and `key-files.modified`
    contain them; stderr notice written with correct counts (capture
    via spawnSync child).
  - Caller-supplied union: caller passes `key-files.created = ['x.js']`;
    git diff reports `['y.js']`; result is both, de-duped if overlap.
  - `--no-auto-key-files` (via lib `{ autoKeyFiles: false }`): no
    auto-fill, no notice.
  - PLAN.md without `base-commit`: silent skip, caller-supplied
    `key-files` written as-is.
  - `.planning/STATE.md` modification: filtered out of auto-fill.

**Commit message:** `cp(18-01): auto-fill key-files at write-summary from git diff`

#### Plan 18-02 — CLI flag + dogfood

**Files:**

- `bin/commands/write-summary.js` (extend, +~10 LOC):
  - Parse `--no-auto-key-files` flag from argv. If present, pass
    `{ autoKeyFiles: false }` into the options bag handed to
    `milestone.writeSummary`.
  - Update the inline usage string to document the flag.

- `bin/commands/_usage.js` (or wherever top-level usage lives) — add
  the flag to `cp write-summary` summary line.

- `test/dryrun-write-summary.js` (new, ~5 assertions):
  - `node bin/cp.js write-summary 01-01 --from /tmp/s.json` in a git
    fixture writes a SUMMARY whose `key-files` is non-empty even when
    JSON has none (auto-fill on by default).
  - Same call with `--no-auto-key-files` writes empty `key-files`.
  - Stderr contains the auto-fill notice in default case, not in
    opt-out case.

- **Dogfood:** after the commit, write Plan 18-01 SUMMARY using
  `cp write-summary 18-01 --from ...` and confirm the SUMMARY's
  `key-files.created` includes `lib/git.js` and `key-files.modified`
  includes `lib/milestone.js` etc. (Will show in the SUMMARY itself —
  visible proof in `.planning/`.)

**Commit message:** `cp(18-02): write-summary --no-auto-key-files CLI flag + dry-run test`

### Implementation conventions

- All git invocations via `spawnSync` with `{ encoding: 'utf8' }` — no shell.
- NUL-separated output (`git diff -z`) for robust path parsing across
  Windows and unicode-rich filenames.
- Caller-supplied entries ALWAYS win on de-dupe (the merge preserves
  caller order then appends auto-discovered).
- Stderr notice (not stdout) — keeps stdout safe for pipe consumers
  like `cp status --json`.

### Non-goals for this phase

- Do NOT validate that the listed files still exist on disk — that's
  Phase 19 (file-existence hard-block).
- Do NOT diff against `expected-key-files` from PLAN.md — that's
  Phase 21.
- Do NOT touch `tags` / `requires` / `provides` heuristically — out
  of scope (mentioned in Open Questions).
- Do NOT change the SUMMARY.md template (key-files block already
  exists and supports our shape).

### Atomic commits

Two commits, one per plan. `npm test` green before each commit.
