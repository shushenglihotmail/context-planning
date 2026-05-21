---
phase: "22"
name: scaffold-phase prior-summary check
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-21
base-commit: ea59f8cd794394fbd701368aa3ad69f9377a7047
expected-key-files:
  "22-01":
    - lib/lifecycle.js
    - test/unit-lifecycle.js
  "22-02":
    - bin/commands/scaffold-phase.js
    - test/dryrun-scaffold-phase.js
    - package.json
---

# Phase 22: scaffold-phase prior-summary check

**Milestone**: v0.8 Consistency
**Created**: 2026-05-21
**Base commit**: `ea59f8c` (post phase 21 ship)

## Goal

Refuse `cp scaffold-phase N` when the immediately preceding phase has
ticked plans without `{NN-MM}-SUMMARY.md`. Provide `--force` escape
hatch. Eliminates drift cause #5 (starting a new phase before
finishing the prior).

## Success Criteria

1. `cp scaffold-phase 23` with phase 22 plans ticked but missing
   SUMMARYs → exits 2, stderr names the missing plan ids, no files
   written, ROADMAP unchanged.
2. `cp scaffold-phase 23 --force` in the same state → succeeds,
   stderr emits one-line override notice, all the usual artifacts
   (ROADMAP entry, PLAN.md, DESIGN.md, REVIEW-LOG.md, STATE.md)
   appear, exits 0.
3. `cp scaffold-phase 23` when phase 22 is fully summarised → succeeds
   silently (no override notice).
4. `cp scaffold-phase 1` (no prior phase) → succeeds silently.
5. New unit + dryrun tests added; full `npm test` still green.

## Plans

- [ ] 22-01: `_priorPhaseAudit` helper + `scaffoldPhase` integration + unit tests
- [ ] 22-02: `--force` CLI flag + dryrun integration tests

## Notes

Design lives in `DESIGN.md`. Key choices:
- Only check the immediately preceding phase (N-1), not all prior
  phases — broader sweep belongs to phase 23/24.
- Hard refusal by default (Tier 2 = prevent + block).
- `--force` always wins; emits stderr override notice for audit trail.
- New refusal reason: `'prior-phase-incomplete'` (distinct from
  existing `'phase-exists'` etc).
- Fail-open on internal errors: if the audit itself throws, scaffold
  proceeds rather than blocking on its own bug.
