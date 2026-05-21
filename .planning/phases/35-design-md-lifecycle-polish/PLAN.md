---
phase: "35"
name: DESIGN.md lifecycle polish
milestone: v0.9 Onboarding
status: in-progress
created: 2026-05-21
base-commit: 2ea34fe3891544f90492c847cbbe645c963e6f42
# expected-key-files (optional, v0.8 P5) — declare what each plan
# intends to touch. `cp write-summary` will diff against the actual
# `key-files` and warn on drift (soft) or block (with --strict-expected).
# Two shapes accepted:
#   1. Flat array — phase-wide expected list:
#        expected-key-files:
#          - lib/foo.js
#          - test/foo.js
#   2. Object keyed by plan id — per-plan expectations:
#        expected-key-files:
#          {{NN}}-01:
#            - lib/foo.js
#          {{NN}}-02:
#            - bin/cli.js
---

# Phase 35: DESIGN.md lifecycle polish

**Milestone**: v0.9 Onboarding
**Created**: 2026-05-21

## Goal

Close the long-standing gap (inbox #1 from v0.7) where per-phase
DESIGN.md and REVIEW-LOG.md are tracked by the aggregator but never
surfaced in the milestone digest. After this phase, every shipped
milestone in MILESTONES.md links to its phases' design and review
artifacts so future readers can drill into the "why" not just the "what".

## Success Criteria

1. `renderDigest()` in `lib/milestone.js` emits two new sections after
   "Phase summaries:":
   - **Phase designs:** — one bullet per phase that has a non-stub
     DESIGN.md, linking to the file.
   - **Reviews:** — `N entries across M phases` line plus one bullet per
     phase with a non-empty REVIEW-LOG.md.
2. Both sections are emitted only when their data is non-empty (no
   "(none)" placeholders).
3. Existing milestone digest format remains backward-compatible (no
   reordering of existing sections).
4. Unit test in `test/unit-design.js` confirms the new lines render
   correctly when refs are present and disappear when refs are empty.
5. `dryrun-complete-milestone.js` still parses generated digest cleanly.

## Plans

- [x] 35-01: extend renderDigest with Phase designs + Reviews sections

## Notes

- Stub detection for DESIGN.md: scan the file body — if it still contains
  the template placeholder `{Proposed | Accepted on YYYY-MM-DD | ...}` or
  has no `## Decision` section content, consider it a stub. Skip stubs
  to avoid noisy "Phase 1 design — see (template)" entries.
- REVIEW-LOG.md count comes from existing `reviewCount` field; per-phase
  bullets come from existing `reviewLogRefs[]`.
- Out of scope: changing the cp-plan-phase Step 3.5 prompt for manual
  provider. The skill already handles that case; further polish belongs
  in v0.10 if the empty-DESIGN problem persists.
