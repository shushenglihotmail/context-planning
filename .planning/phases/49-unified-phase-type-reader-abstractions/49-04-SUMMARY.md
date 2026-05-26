---
subsystem: tooling
tags:
  - persist
  - design-doc
  - v1.2
  - back-compat
requires:
  - 49-01
  - 49-02
  - 49-03
provides:
  - foldIntoDesign
  - mergePersistAlias
affects:
  - lib/persist.js
  - test/unit-persist.js
  - package.json
tech-stack:
  added: []
  patterns:
    - atomic-file-write-via-tmp-rename
    - idempotent-section-replace
key-files:
  created:
    - lib/persist.js
    - test/unit-persist.js
    - lib/types.js
    - test/unit-milestone-reader.js
    - test/unit-types.js
    - test/unit-workflow-phase-adapter.js
  modified:
    - package.json
    - lib/milestone.js
    - lib/workflow.js
key-decisions:
  - foldIntoDesign anchors on `## <phaseId>` and replaces in-place when present, appends otherwise (idempotent)
  - Atomic write via tmp + rename to avoid partial DESIGN.md on crash
  - mergePersistAlias is a pure normaliser; deprecation warning stays in lib/workflow.js (no shared sink)
  - persist wins over persist_output when both present (consistent with phasesFromTemplate precedence)
patterns-established:
  - Persist primitive call site — consumed by phase 50 fan-out runtime to materialise structured-list children into milestone DESIGN.md
requirements-completed:
  - REQ-V1.2-persist-primitives
duration: 19min
phase: 49
plan: 49-04
completed: 2026-05-26
end-commit: 2d3e7b008191fb772ba4abd0f46a3dfe898b79c5
---
# 49-04: foldIntoDesign + persist alias normaliser in lib/persist.js

## Accomplishments

- Created `lib/persist.js` with two exports:
  - `foldIntoDesign(designPath, phaseId, summary, opts?)` — atomic, idempotent
    append/replace of a `## <phaseId>` section in DESIGN.md.
  - `mergePersistAlias(phase)` — pure normaliser that copies `persist_output`
    into `persist` (without mutating input) and drops the legacy key.
- Phase 49 (Foundations + tier files + persist primitives) is now COMPLETE
  end-to-end: types, milestone reader, workflow adapter, persist primitive.

## Task Commits

- `2d3e7b0` feat(49-04): foldIntoDesign + persist alias normaliser in lib/persist.js

## Files Created

- `lib/persist.js`
- `test/unit-persist.js` — 20 assertions, all green

## Files Modified

- `package.json` — wired new test into the explicit `test` script

## Decisions Made

- Atomic write via `.tmp` + rename to keep DESIGN.md consistent on crash.
- Throws when DESIGN.md is missing (do not silently scaffold — that's
  `scaffoldTierFiles`'s job; clear error guides callers).
- Deprecation warning stays in `lib/workflow.js`; `lib/persist.js` only
  normalises and does not warn. Matches 49-03 architectural note.
- `persist` always wins over `persist_output` when both are present.

## Deviations

None.

## Issues

None.

## Next Phase Readiness

- Phase 50 (fan-out runtime) can now:
  - Read unified `Phase[]` via `phasesFromTemplate` (49-03).
  - For each `persist: true` phase, call `foldIntoDesign(designPath, phaseId, summary)`
    to materialise into milestone or quick DESIGN.md.
  - For parent phases, expand children using `max_children` / `min_children`
    and fold each child through the same primitive.
- Persist primitive is the single, atomic write surface for v1.2 DESIGN.md
  evolution. No second pathway should be introduced.
