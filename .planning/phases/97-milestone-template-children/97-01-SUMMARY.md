---
phase: 97
plan: 97-01
title: v1.8 Phase 97 — milestone.yaml child phases + milestone-level review
status: done
commit: 842070b
end-commit: 842070b78226951eeebbb7ddfbe88f511ace9851
date: 2026-05-31
---

# Summary

Fixed the v1.7 milestone-workflow gap: `propose-phases` declared
`materialize: roadmap-phases` but had no `parent:`-children, so the
workflow proposed phases and then stopped. After this phase,
`milestone.yaml` ships with a full per-child plan→execute fan-out and
a milestone-level review gate before finalize.

This is Workstream A of the v1.8 milestone spec
(`.planning/milestones/milestone-workflow-end-to-end-quick-attach/DESIGN.md`).
Template-only change — no library or CLI code touched.

## What changed (`templates/workflows/milestone.yaml`)

- **+4 params:** `execute_skill` (default `execute`), `execute_role`
  (default `developer`), `review_skill` (default `code-review`),
  `review_role` (default `reviewer`). Mirrors the existing
  `plan_*`/`brainstorm_*` shape.
- **+2 fan-out children under `propose-phases`** (using `parent:` +
  `after:`, matching `dev.yaml`):
  - `child-plan` (role: `{{plan_role}}`, skill: `{{plan_skill}}`) —
    writes per-phase `PLAN.md`.
  - `child-execute` (role: `{{execute_role}}`, skill:
    `{{execute_skill}}`, `after: [child-plan]`) — implements, commits
    atomically, writes `SUMMARY.md`, ticks ROADMAP.
- **+1 milestone-level `review` phase** between `propose-phases` and
  `finalize`. `depends_on: [propose-phases]` — fan-out semantics make
  this wait for **all** children to finish. Uses
  `{{review_role}}`/`{{review_skill}}`.
- **Repointed `finalize.depends_on`** from `[propose-phases]` to
  `[review]` so the review gates close-out.

## Verification

- `node bin/cp.js workflow validate milestone` → exit 0.
- `node bin/cp.js workflow inspect milestone` → 9 phases across 7
  waves; `review` lands at wave 6, `finalize` at wave 7.
- `npm test` → 122 passing, 0 failing.
- One atomic commit `842070b`.

## Out of scope (handled by sibling phases)

- Validator hard-fail rules → Phase 96
- Supervisor actually dispatching `parent:` children at runtime → Phase 98
- End-to-end `cp run milestone` smoke → Phase 98 (98-02 deferred)
- `cp project list` / `cp milestone list` / quick attach-by-name →
  Phases 99–100
