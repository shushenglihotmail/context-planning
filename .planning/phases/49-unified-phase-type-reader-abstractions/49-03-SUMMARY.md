---
subsystem: tooling
tags:
  - workflow
  - phase-adapter
  - v1.2
  - back-compat
requires:
  - 49-01
  - 49-02
provides:
  - phasesFromTemplate
  - persist-alias-deprecation
affects:
  - lib/workflow.js
  - test/unit-workflow-phase-adapter.js
  - package.json
tech-stack:
  added: []
  patterns:
    - adapter-from-template-to-unified-phase
    - deprecation-warning-dedupe
key-files:
  created:
    - test/unit-workflow-phase-adapter.js
    - lib/types.js
    - test/unit-milestone-reader.js
    - test/unit-types.js
  modified:
    - lib/workflow.js
    - package.json
    - lib/milestone.js
key-decisions:
  - phasesFromTemplate is an append-only adapter; loadTemplate/validate/computeWaves/resolveTemplate/normalisePhase untouched
  - persist_output -> persist alias with one-shot console.warn deduped per template (workflow name)
  - Parent phases get max_children=20 / min_children=1 defaults; non-parents leave them undefined
  - "Parent is inferred by scanning siblings for parent: <id> references"
patterns-established:
  - Unified Phase[] emission from template — call site for runtime fan-out planning (consumed by phase 50)
requirements-completed:
  - REQ-V1.2-workflow-adapter
duration: 11min
phase: 49
plan: 49-03
completed: 2026-05-26
end-commit: 89ce4d71a8e684b7b39534249bdddfaea941481d
---
# 49-03: phasesFromTemplate adapter in lib/workflow.js

## Accomplishments

- Added `phasesFromTemplate(template)` to `lib/workflow.js` that emits a unified `Phase[]`
  conforming to `validatePhase()` from `lib/types.js`.
- Carries all v1.2 fields end-to-end: `parent`, `after`, `persist`, `max_children`, `min_children`.
- Implements `persist_output` → `persist` deprecation alias with one-shot
  `console.warn` per template (deduped by `meta.workflow`).
- Parent phases (those referenced by some sibling's `parent:`) default
  `max_children=20` and `min_children=1`; non-parents leave both undefined.
- Existing exports (`loadTemplate`, `validate`, `computeWaves`, `resolveTemplate`,
  `normalisePhase`) are byte-for-byte unchanged.

## Task Commits

- `89ce4d7` feat(49-03): phasesFromTemplate adapter in lib/workflow.js

## Files Created

- `test/unit-workflow-phase-adapter.js` — 25 assertions, all green

## Files Modified

- `lib/workflow.js` — appended new function + exports entry
- `package.json` — wired new test into the explicit `test` script

## Decisions Made

- Adapter is append-only; no rewrite of existing exports.
- Deprecation warning lives in `workflow.js` only; persist.js (49-04) will
  hold its own dedupe sink if it also warns. No shared module needed today.
- `persist:` wins over `persist_output:` when both are present (consistent
  with "new field wins" precedence).

## Deviations

None.

## Issues

None.

## Next Phase Readiness

- 49-04 (`lib/persist.js`) can now assume Phase objects already carry a
  normalised `persist` boolean. The adapter is the single normalisation point.
- Phase 50 fan-out runtime can consume `phasesFromTemplate(...)` output
  directly to drive the parent + structured-list expansion.
