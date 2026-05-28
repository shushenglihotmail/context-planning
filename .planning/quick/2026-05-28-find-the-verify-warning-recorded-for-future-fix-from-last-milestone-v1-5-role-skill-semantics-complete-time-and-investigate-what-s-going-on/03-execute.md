---
status: done
---

# SUMMARY: Fix verify gate for v1.5 phase shape

## What changed

- `lib/milestone.js:verifyMilestoneComplete` now accepts two valid
  phase-completion shapes:
    1. **Pre-v1.5 checklist** (`plansTotal > 0`): unchanged — all plan
       checkboxes ticked AND every plan has its `NN-MM-SUMMARY.md`.
    2. **v1.5 pass-through** (`plansTotal === 0`): a phase-level
       `SUMMARY.md` at the phase directory root is the proof.
- Added `phaseSummaryPresent: boolean` to each per-phase report so
  callers (and the CLI) can distinguish the two shapes.
- `bin/commands/complete-milestone.js`: error printer now emits a
  shape-appropriate message when verify fails on a v1.5-shape phase
  ("missing phase-level SUMMARY.md") instead of the misleading
  "plans 0/0 done; missing SUMMARY: —".
- `test/unit-collapse-aware.js`: two new tests cover the v1.5 shape
  (passing + failing).

## Verification

- Direct call: `verifyMilestoneComplete` on the real v1.5 milestone
  (phases 64–75) returns `ok=true` for every phase, all with
  `plansTotal=0` and `phaseSummaryPresent=true`.
- `npm test` is fully green (all suites report `Failed: 0`); the new
  `unit-collapse-aware: 19 passed` includes the two new v1.5 tests.
- The bug no longer requires `--force` for v1.5-shape milestones.

## Why this fix (not the alternative)

The alternative — make `runtime.scaffoldPhase` pass `plans: 1` so every
new phase has 1 checkbox in ROADMAP — would only move the failure:
nothing in the v1.5 codepath auto-ticks ROADMAP checkboxes when a
SUMMARY appears, so verify would then fail with `1/1 -> 0/1 done`
instead of `0/0`. Patching verify is one file + two reports field; the
alternative would require also adding auto-tick plumbing and using
ROADMAP checkboxes as redundant bookkeeping next to SUMMARY.md.

`SUMMARY.md` on disk is the authoritative completion signal in v1.5;
this fix lets verify trust it.

## Inbox

- `.planning/INBOX.md` open BUG entry (2026-05-28T07:28) moved to
  Triaged with a back-reference to this SUMMARY.

## Files touched

- `lib/milestone.js`
- `bin/commands/complete-milestone.js`
- `test/unit-collapse-aware.js`
- `.planning/INBOX.md`
- `.planning/quick/2026-05-28-find-the-verify-warning-recorded-for-future-fix-from-last-milestone-v1-5-role-skill-semantics-complete-time-and-investigate-what-s-going-on/{DESIGN.md,SUMMARY.md}`
