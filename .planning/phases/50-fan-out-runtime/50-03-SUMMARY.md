---
subsystem: tooling
tags:
  - runtime
  - fanout
  - prompt
  - v1.2
requires:
  - 50-01
  - 50-02
provides:
  - buildParentPrompt
  - parseParentOutput
  - enforceChildCount
affects:
  - lib/runtime-fanout.js
  - test/unit-runtime-fanout.js
  - package.json
tech-stack:
  added: []
  patterns:
    - fenced-json-block-extraction
    - chainable-validators
key-files:
  created:
    - lib/runtime-fanout.js
    - test/unit-runtime-fanout.js
    - lib/fanout.js
    - test/unit-fanout.js
    - test/unit-workflow-schema-v12.js
  modified:
    - package.json
    - lib/workflow.js
key-decisions:
  - Picks LAST fenced JSON block when multiple are present (chain-of-thought tolerant)
  - Item id must match /^[a-z0-9-]+$/ for slug-safe filenames in fan-out output dirs
  - Empty items accepted at parse; count enforced separately so callers can compose
patterns-established:
  - "Three-stage parent contract: build -> parse -> enforce, each independently testable"
requirements-completed:
  - REQ-V1.2-runtime-contract
duration: 17min
phase: 50
plan: 50-03
completed: 2026-05-26
end-commit: af99ea0dd2e1481cb3713e15abafcfe5495dea67
---
# 50-03: runtime fan-out contract

## Accomplishments

- Created `lib/runtime-fanout.js` with `buildParentPrompt`, `parseParentOutput`,
  `enforceChildCount` — three composable stages for the parent agent contract.
- Prompt shaping uses min/max from the phase with default 1/20.
- Parser is chain-of-thought tolerant: picks the LAST fenced JSON block.
- Count enforcement reports phase id + actual count + limit on error.

## Task Commits

- `af99ea0` feat(50-03): runtime fan-out contract (prompt, parse, count enforcement)

## Files Created

- `lib/runtime-fanout.js`
- `test/unit-runtime-fanout.js` — 25 assertions, all green

## Files Modified

- `package.json`

## Decisions Made

- Item id regex `/^[a-z0-9-]+$/` ensures expanded child ids
  (`<child>::<itemId>`) yield filesystem-safe directory names.
- Empty items pass parsing; count enforcement separate so callers can
  build per-phase policies.

## Deviations

None.

## Issues

None.

## Next Phase Readiness

- 50-04 integration test composes: validate -> phasesFromTemplate ->
  buildParentPrompt (mock agent response) -> parseParentOutput ->
  enforceChildCount -> expandPhases -> foldIntoDesign.
- A new `templates/dev-v2.yaml` should be added with a parent + 2 child
  templates to exercise the full pipeline.
