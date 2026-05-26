---
subsystem: tooling
tags:
  - fanout
  - expander
  - v1.2
  - runtime
requires:
  - 49-03
  - 50-01
provides:
  - expandPhases
  - pairwiseChildDeps
affects:
  - lib/fanout.js
  - test/unit-fanout.js
  - package.json
tech-stack:
  added: []
  patterns:
    - pairwise-sibling-pairing
    - skip-expansion-when-outputs-missing
    - stable-grouped-ordering
key-files:
  created:
    - lib/fanout.js
    - test/unit-fanout.js
    - test/unit-workflow-schema-v12.js
  modified:
    - package.json
    - lib/workflow.js
key-decisions:
  - Subtree-wait semantics documented in JSDoc; not implemented (executor's job)
  - Children emitted grouped by itemIndex (item0/child0..N, item1/child0..N) for cache locality
  - "Expanded child id: <childTemplate.id>::<item.id || itemIndex>"
  - "Pure function: inputs not mutated; output objects are fresh"
patterns-established:
  - Fan-out expander returns a single flat execution order; runtime walks it like a normal Phase list
requirements-completed:
  - REQ-V1.2-fanout-expander
duration: 15min
phase: 50
plan: 50-02
completed: 2026-05-26
end-commit: 4e31251dbf4e3f2b67f34e23cfcecae598bb2cdc
---
# 50-02: fan-out expander with sibling pairwise deps in lib/fanout.js

## Accomplishments

- Created `lib/fanout.js` with `expandPhases(phases, parentOutputs)` and
  `pairwiseChildDeps(...)` helper.
- Returns a single flat execution order: top-level phases in declaration
  order, with expanded children inserted directly after their parent.
- Sibling pairing: child template's `after: [siblingId]` is remapped to the
  expanded id of the sibling at the SAME item index.
- Inputs never mutated; outputs are fresh objects.
- Subtree-wait semantics documented in JSDoc on `expandPhases` (executor
  is responsible for waiting on all children of a parent referenced via
  `after: [parent]`).

## Task Commits

- `4e31251` feat(50-02): fan-out expander with sibling pairwise deps in lib/fanout.js

## Files Created

- `lib/fanout.js`
- `test/unit-fanout.js` — 25 assertions, all green

## Files Modified

- `package.json`

## Decisions Made

- Skip child expansion when parent's outputs are missing (caller hasn't
  run parent yet); parent still emitted at original position.
- Expanded child id format: `<childTemplate.id>::<item.id || itemIndex>`.
- Errors raised at expansion time for: self-loop sibling deps, non-sibling
  after references.

## Deviations

None.

## Issues

None.

## Next Phase Readiness

- 50-03 (runtime agent contract) still needs to enforce min/max child
  count and the structured-list prompt shaping. The expander assumes the
  caller has already validated counts.
- 50-04 integration tests can compose: validate -> phasesFromTemplate
  -> expandPhases -> persist (foldIntoDesign).
