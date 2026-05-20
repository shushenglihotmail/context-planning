---
phase: "16"
name: design capture infrastructure
milestone: v0.7 Design Capture
status: in-progress
created: 2026-05-20
---

# Phase 16: design capture infrastructure

**Milestone**: v0.7 Design Capture
**Created**: 2026-05-20

## Goal

Ship the three-tier persistent design-capture layer (Milestone + Phase + Plan DESIGN.md), phase-level REVIEW-LOG.md, and a hard-block on empty key-decisions in cp write-summary — per spec `docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md`.

## Success Criteria

1. `cp scaffold-phase N` creates DESIGN.md and REVIEW-LOG.md alongside PLAN.md
2. `cp scaffold-milestone "name"` creates `milestones/<slug>/DESIGN.md`
3. `cp write-summary` exits code 2 on empty key-decisions with helpful error
4. `cp complete-milestone` aggregator folds DESIGN refs + REVIEW-LOG counts into MILESTONES.md and promotes MILESTONE-CONTEXT.md into milestone DESIGN.md
5. All 19 test suites stay green; coverage stays above v0.6 gate (85L/75B)

## Plans

- [x] 16-01: DESIGN.md infrastructure (template + scaffold wiring + lib/paths helpers + aggregator promotion + skill updates)
- [x] 16-02: REVIEW-LOG.md infrastructure (template + scaffold wiring + cp-execute-phase Step 4.5 + aggregator counts)
- [x] 16-03: key-decisions hard-block (writeSummary validation + skill update + backfill 10 existing dogfood SUMMARYs)

## Notes

Spec: `docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md` (committed `3b55891`). Approved by user 2026-05-20.
