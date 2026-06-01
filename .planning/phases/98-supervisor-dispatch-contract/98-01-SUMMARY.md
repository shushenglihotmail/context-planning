---
phase: 98
plan: 98-01
status: done
end-commit: 2eae1e42276fd734de108e99b0558ec7add5a156
date: 2026-05-31
---

# SUMMARY — v1.8 Phase 98 supervisor dispatch contract

## Outcome

Fixed the bleed-through scaffolding bug + the wave-display bug in two
related call sites. Child phases (those with `parent:`) are now correctly
treated as runtime-only constructs by all static-analysis paths.

**Commit:** `2eae1e4`

## Changes

- `lib/workflow.js#computeWaves` — filters out `parent:`-children;
  remaps top-level `depends_on` references to children → parent.
- `lib/workflow.js#validate` (topoSortIds caller) — same filter + remap,
  fixes spurious "Phases not in topological order" warning on milestone
  and docs.
- `lib/runtime.js#startRun` (milestone binding) — passes only top-level
  phases to `flatTopoSort`, so children no longer get scaffolded as
  `.planning/phases/N-<child>/` directories.

## Verification

- `cp workflow validate {milestone,quick,dev,docs}` → all OK.
- `cp workflow inspect milestone` → Wave 1 = setup (was: setup,
  child-plan, child-execute).
- `cp workflow inspect docs` → review correctly placed after parent.
- +8 unit tests in `test/unit-workflow.js` sections 13-15.
- `npm test`: 122 passed, 0 failed.

## Deferred (per narrowed scope, user-approved)

- End-to-end smoke `cp run milestone "smoke"`.
- `commands/cp/cp-workflow-run.md` supervisor contract documentation.
- ROADMAP write-back protocol for parallel children.

These will become follow-up inbox items or get folded into a later phase.
