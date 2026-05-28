---
status: ready
---

# Quick Task: Fix verify gate for v1.5 phase shape

## Problem

`milestone.verifyMilestoneComplete` requires `plansTotal > 0` for a phase
to be considered complete. v1.5 milestones (phases 64+) use a different
phase shape: one phase-level `SUMMARY.md`, zero plan checkboxes in
ROADMAP, zero `NN-MM-SUMMARY.md` files. Verify therefore rejects every
v1.5-shaped phase and `cp run complete-milestone` only succeeds with
`--force`.

Surfaced while closing milestone v1.5 (Role/skill semantics); recorded
in `.planning/INBOX.md` as the open BUG entry from 2026-05-28T07:28.

This is **not legacy-only** — every future milestone built by `cp run
milestone` will hit it, because `lib/runtime.js:485` passes no `plans`
count to `scaffoldPhase`, which defaults to 0, yielding 0 checkboxes
in ROADMAP for every newly scaffolded phase.

## Approach

Patch `lib/milestone.js:verifyMilestoneComplete` to accept **two valid
phase-completion shapes**, selected by what is actually present on disk
and in ROADMAP:

1. **v1.5 / pass-through shape** (`plansTotal === 0`): the phase is
   complete iff a phase-level `SUMMARY.md` exists at the root of the
   phase directory.
2. **Pre-v1.5 / checklist shape** (`plansTotal > 0`): unchanged —
   require `plansDone === plansTotal` AND every plan have its
   matching `NN-MM-SUMMARY.md`.

Pseudocode:

```js
const hasPhaseSummary = dir && fs.existsSync(path.join(dir, 'SUMMARY.md'));
const phaseOk = plansTotal === 0
  ? hasPhaseSummary
  : (plansDone === plansTotal && summariesMissing.length === 0);
```

The existing `plansDone` / `plansTotal` / `summariesMissing` fields stay
in the per-phase report so `cp status` and existing tests continue to
work; only the deciding boolean changes for the v1.5 shape.

Add a new report field (e.g. `phaseSummaryPresent: boolean`) so the
error printer in `bin/commands/complete-milestone.js` can produce a
useful message for v1.5-shaped phases that are missing the phase-level
SUMMARY.

Do NOT change:
- `lib/runtime.js` / `scaffoldPhase` (keep v1.5 atomic-phase shape).
- Workflow YAMLs (`templates/workflows/milestone.yaml`).
- ROADMAP parser (`lib/roadmap.js`).

## Done-When

- `lib/milestone.js:verifyMilestoneComplete` implements the two-shape
  rule above.
- A new test (in `test/dryrun-complete-milestone.js` or
  `test/unit-collapse-aware.js`) covers both cases:
    - v1.5 shape: 0 plan checkboxes + phase-level `SUMMARY.md` present
      → `ok=true`.
    - v1.5 shape: 0 plan checkboxes + no `SUMMARY.md` → `ok=false`.
- Existing tests (`test/dryrun-complete-milestone.js`,
  `test/unit-collapse-aware.js`, `test/unit-lifecycle.js`) continue to
  pass unchanged for the pre-v1.5 checklist shape.
- `npm test` is green.
- Running `cp run complete-milestone v1-5-role-skill-semantics --dry-run`
  reports `ok` for every v1.5 phase (64–75) without `--force`.
- The INBOX entry for this bug is marked triaged with a pointer to the
  fix commit.
