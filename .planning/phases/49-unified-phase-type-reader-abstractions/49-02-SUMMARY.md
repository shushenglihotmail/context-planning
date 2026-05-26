---
subsystem: tooling
tags:
  - milestone-reader
  - tier-files
  - unified-phase
  - design-md
  - state-md
requires:
  - lib/types.js (49-01)
provides:
  - readPhases()
  - scaffoldTierFiles()
affects:
  - lib/milestone.js
  - test/unit-milestone-reader.js
tech-stack:
  added: []
  patterns:
    - additive API surface (no breakage of existing milestone.js)
    - idempotent scaffolding
key-files:
  created:
    - test/unit-milestone-reader.js
    - lib/types.js
    - test/unit-types.js
  modified:
    - lib/milestone.js
    - package.json
key-decisions:
  - readPhases derives status from ROADMAP checkbox state alone (no PLAN.md frontmatter reads)
  - scaffoldTierFiles is idempotent — safe to call on every cp run; returns {designCreated, stateCreated}
  - "Surfaces forward-compat workflow: field from phase annotation/frontmatter for phase 51 consumption"
  - Reuses lib/roadmap.js#listPhases instead of re-implementing the parser
patterns-established:
  - "Tier-file scaffolding pattern: opt-in via explicit call from CLI layer; never auto-overwrite"
requirements-completed: []
duration: 11min
phase: 49
plan: 49-02
completed: 2026-05-26
end-commit: f701044eca735b25288ecc10a620b3b1cd3b566b
---
# 49-02 SUMMARY: readPhases + scaffoldTierFiles in lib/milestone.js

## Accomplishments

Added two new exported functions to `lib/milestone.js` that together
unlock the tier-file unification at the milestone layer:

- **`readPhases(roadmapMd, opts?)`** — parses ROADMAP.md and emits
  unified `Phase[]` conforming to `validatePhase()` from
  `lib/types.js`. Handles all four ROADMAP shapes (in-progress,
  collapsed/shipped milestones, with/without plan lists). Surfaces
  the forward-compat `workflow:` annotation that phase 51 will
  consume when refactoring cp-autonomous.
- **`scaffoldTierFiles(milestoneSlug, brief, opts?)`** — creates
  `.planning/milestones/<slug>/{DESIGN.md, STATE.md}` if absent.
  Idempotent: safe to call on every `cp run`. Returns
  `{designCreated, stateCreated}` so the CLI can log accurately.

This is the milestone-tier half of the v1.2 unification. The workflow
side lands in 49-03 (`phasesFromTemplate`) and the persist primitive
in 49-04 (`lib/persist.js`).

## Task Commits

- `f701044` feat(49-02): readPhases + scaffoldTierFiles in lib/milestone.js

## Files Modified

- `lib/milestone.js` (+~150 lines) — appended both new functions
  to the existing 930-line file (no rewrites of existing code)
- `package.json` — added `test/unit-milestone-reader.js` to the
  `npm test` script

## Files Created

- `test/unit-milestone-reader.js` (33 assertions, all green)

## Decisions Made

1. **`readPhases` derives status from ROADMAP checkboxes alone.**
   It does NOT read individual phase PLAN.md frontmatter. Reason:
   keeps the function pure and avoids file-system fan-out from a
   "parse one string" API. Phase 51 (autonomous refactor) can layer
   frontmatter-aware status on top if needed.

2. **`scaffoldTierFiles` returns booleans, not exceptions.** Calling
   it on a milestone that already has both files is a no-op success,
   not an error. The CLI can use the booleans to decide what to log
   ("created DESIGN.md and STATE.md" vs "tier files already present").

3. **Reused `lib/roadmap.js#listPhases`** rather than re-parsing.
   `lib/roadmap.js` already handles `<details>` collapsing, (INSERTED)
   suffixes, decimal phase ids, and plan-checkbox extraction. Adding
   a sibling reader would have meant two regex parsers to keep in
   sync.

4. **`workflow:` annotation tolerated, not required.** Phases without
   it get `workflow: undefined`. Phase 51 will set defaults when
   refactoring cp-autonomous to drive cp run.

## Deviations

- Added `test/unit-milestone-reader.js` to the explicit `npm test`
  script in `package.json` (the test chain enumerates files
  explicitly rather than globbing). Same pattern 49-01 used. Not
  a deviation from the plan — just confirming the package.json
  update was needed.

## Issues

None. 33/33 unit-milestone-reader assertions pass. 23/23
unit-types still pass. `npm test` exits 0; no pre-existing test
regressed.

## Next Phase Readiness

49-03 (`lib/workflow.js#phasesFromTemplate`) can begin immediately.
It needs to:
- Carry the same `validatePhase`-compatible shape
- Add workflow-only fields: `parent`, `after` (top-level + child),
  `persist`, `max_children`, `min_children`
- Stay additive (no breakage to `computeWaves` / `readTemplate`)
- Round-trip the new fields cleanly

The milestone reader pattern from this plan (additive export,
reuse-existing-parser, return validated objects) sets the template.
