---
phase: "17"
name: SHA pinning foundation
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-21
base-commit: 881c6110f25b1468f2d305f8148bcf3a28f9ed84
---

# Phase 17: SHA pinning foundation

**Milestone**: v0.8 Consistency
**Created**: 2026-05-21

## Goal

Add deterministic git-SHA pinning to phase artefacts: `base-commit` field
stamped onto PLAN.md frontmatter at `cp scaffold-phase` time, and
`end-commit` field stamped onto SUMMARY.md frontmatter at
`cp write-summary` time. Provides the foundation that every downstream
v0.8 audit/repair mechanism depends on. Forward-only, optional, zero
breakage to v0.7 artefacts.

## Success Criteria

1. After `cp scaffold-phase N` in a git repo, the resulting PLAN.md
   frontmatter contains `base-commit: <40-char-sha>` matching
   `git rev-parse HEAD` at the moment of scaffolding.
2. After `cp write-summary N` in a git repo, every SUMMARY.md frontmatter
   contains `end-commit: <40-char-sha>` matching `git rev-parse HEAD`
   at write-summary time.
3. In a non-git directory (or with `git` unavailable), both commands
   continue to succeed without the new fields and emit a single-line
   stderr warning `cp: git not found — SHA pinning skipped`.
4. Pre-v0.8 phase artefacts (no `base-commit` / `end-commit`) still
   parse cleanly via the existing round-trip test — zero regressions.
5. New `lib/git.js::headSha({ cwd?: string }) → string|null` helper
   is independently `require()`-able and unit-testable.
6. All existing test suites stay green; ~25 new assertions added.

## Plans

- [x] 17-01: `lib/git.js::headSha` helper + scaffoldPhase extension (stamps `base-commit` on PLAN.md) + unit tests
- [x] 17-02: writeSummary extension (stamps `end-commit` on SUMMARY.md) + template updates + round-trip parse test

## Notes

### Per-plan breakdown

#### Plan 17-01 — `headSha` + scaffold-phase stamping

**Files:**
- `lib/git.js` — add `headSha({ cwd?: string }) → string|null` (new export). Wraps `git rev-parse HEAD` via `child_process.spawnSync`. Returns null if exit code ≠ 0 OR if `git` not on PATH (ENOENT). Single-line stderr warning emitted at most once per process (module-level seen flag).
- `lib/lifecycle.js::scaffoldPhase` — after PLAN.md is rendered from template, call `headSha({ cwd: root })`. If non-null, rewrite the rendered text by inserting `base-commit: <sha>` after the existing `created:` line in the frontmatter (preserve quote style). Use the same in-memory rewrite as the existing template substitution — do NOT re-read from disk.
- `templates/phase-PLAN.md` — add a comment line in the frontmatter:
  ```
  # base-commit stamped by `cp scaffold-phase` when git is available
  ```
- `test/unit-git-sha.js` (NEW, ~10 assertions): `headSha()` returns 40-char hex in repo / null with mocked PATH / null in tmp non-git dir / cached warning fires once.
- `test/unit-lifecycle.js` (+~8 assertions): scaffold-phase in git fixture stamps `base-commit` matching HEAD / scaffold-phase in non-git fixture omits field cleanly / existing PLAN parse still works.

**Commit message:** `cp(17-01): add lib/git.js::headSha + scaffoldPhase base-commit stamping`

#### Plan 17-02 — write-summary stamping + round-trip

**Files:**
- `lib/milestone.js::writeSummary` — after SUMMARY.md text is rendered and *before* the existing hard-block validations run, call `headSha({ cwd: root })` and inject `end-commit: <sha>` after the `created:` line in the rendered frontmatter. If null, omit.
- `templates/SUMMARY.md` — add comment:
  ```
  # end-commit stamped by `cp write-summary` when git is available
  ```
- `test/unit-milestone.js` (+~6 assertions): write-summary stamps `end-commit` / null-git path / re-reading the SUMMARY yields the SHA via existing frontmatter parser.
- `test/round-trip-gsd-import.js` (+~3 assertions if it exists; otherwise extend existing parse test): pre-v0.8 SUMMARY without `end-commit` parses with field as `undefined`, no crash.

**Commit message:** `cp(17-02): writeSummary end-commit stamping + round-trip parse test`

### Implementation conventions

- Both PLAN.md and SUMMARY.md frontmatter rewrites must be **purely string-level** insertions (regex anchored on `created:` line). Avoid re-parsing YAML — the existing cp lifecycle code does string-template substitution and we should keep the same shape.
- `headSha` should NOT auto-prepend the working tree path; the caller passes `cwd` explicitly. Default `cwd: process.cwd()` only as a convenience.
- Reuse the spawn pattern from `lib/worktree.js::runGitWorktreeAdd` — same `child_process.spawnSync` with `{ encoding: 'utf8' }`, no shell.

### Non-goals for this phase

- Do NOT implement the `reconcile --infer-shas` backfill command — that's phase 29.
- Do NOT implement audit or audit --fix — phases 24/25.
- Do NOT stamp anything on ROADMAP.md milestone headings — phase 23 (milestone-audit gate) covers milestone-level pinning if needed.
- Do NOT change PROJECT.md / STATE.md / ROADMAP.md shapes.

### Atomic commits

One commit per plan as shown above. Both commits stay below 150 LOC each. Run `npm test` before each commit; on green, commit; on red, fix before proceeding.
