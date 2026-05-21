---
subsystem: tooling
tags:
  - sha-pinning
  - git
  - v0.8
  - p1
requires:
  - lib/git.js::headSha
provides:
  - end-commit frontmatter on SUMMARY.md
affects:
  - lib/milestone.js
  - lib/lifecycle.js
  - test/unit-lifecycle.js
tech-stack:
  added: []
  patterns:
    - frontmatter-object injection (vs string-level)
key-files:
  created: []
  modified:
    - lib/milestone.js
    - lib/lifecycle.js
    - test/unit-lifecycle.js
key-decisions:
  - Both writeSummary code paths (lib/milestone.js canonical + lib/lifecycle.js internal) stamp end-commit identically to avoid divergence
  - Caller-supplied end-commit in summaryData is preserved (not overwritten) — supports manual stamping for reconcile flows in phase 26
  - Stamping happens via frontmatter object injection (cleaner than the string-level approach used for PLAN.md, because writeSummary already constructs an object that goes through fm.stringify)
  - SUMMARY.md template intentionally not modified — end-commit is an output, not a placeholder
patterns-established:
  - Two cp lifecycle paths (milestone vs lifecycle) must stay behaviour-consistent for the bin/commands/* CLI vs internal helpers
requirements-completed:
  - "v0.8 P1 part 2 of 2: end-commit on SUMMARY.md"
duration: 20min
phase: 17
plan: 17-02
completed: 2026-05-21
end-commit: 718d3c0c43cc1bfcb38a33234ecab49873b80d2a
---
# Plan 17-02 Summary — writeSummary end-commit stamping

## Accomplishments

- Completed v0.8 P1 SHA pinning foundation (half 2 of 2).
- `lib/milestone.js::writeSummary` (canonical CLI path used by
  `cp write-summary`) and `lib/lifecycle.js::writeSummary` (internal
  helper) both stamp `end-commit: <sha>` into SUMMARY.md frontmatter
  during write, sourced from `git.headSha({ cwd: root })`.
- Forward-only: missing field on pre-v0.8 SUMMARYs still parses cleanly
  via `fm.parse`.
- Caller-supplied `end-commit` in summaryData is preserved unchanged
  (supports the reconcile flows planned for phase 26).

## Task Commits

- 718d3c0 — cp(17-02): writeSummary end-commit stamping + round-trip parse coverage

## Files Created / Modified

- `lib/milestone.js` (+10 LOC) — git require + end-commit injection
- `lib/lifecycle.js` (+10 LOC) — mirror end-commit injection in the
  internal helper to keep both paths consistent
- `test/unit-lifecycle.js` (+6 assertions in 2 new sections) —
  end-commit stamped matches HEAD, caller-supplied value preserved,
  non-git directory omits field cleanly

## Decisions Made

See key-decisions in frontmatter.

## Deviations from Plan

Discovered that `lib/lifecycle.js` has its own `writeSummary` (legacy
internal helper used by tests) alongside the canonical
`lib/milestone.js::writeSummary`. Extended both rather than just the
canonical — keeps existing tests exercising the stamping and avoids
silent divergence between paths.

## Issues Encountered

None.

## Next Phase Readiness

Phase 17 complete. All ~860 test assertions green. Ready for `cp tick
17-01 / 17-02` and `/cp-plan-phase 18` (Auto key-files at write-time)
which depends on the `base-commit`/`end-commit` pinning shipped here.
