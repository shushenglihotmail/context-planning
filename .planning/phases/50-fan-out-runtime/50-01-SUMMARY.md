---
subsystem: tooling
tags:
  - workflow
  - validation
  - schema
  - v1.2
requires:
  - 49-03
provides:
  - template-schema-v1.2-validation
affects:
  - lib/workflow.js
  - test/unit-workflow-schema-v12.js
  - package.json
tech-stack:
  added: []
  patterns:
    - sibling-set-pre-pass
    - parent-inference-from-references
key-files:
  created:
    - test/unit-workflow-schema-v12.js
  modified:
    - lib/workflow.js
    - package.json
key-decisions:
  - Extended existing validate(template) in-place; preserved errors/warnings shape
  - "8 v1.2 rules enforced: parent ref, no grandchildren, max/min only on parents, max>=min, positive ints, sibling-only child after, top-level after refs top-level only, persist boolean"
  - "Defaults applied during validation: min=1 when only max set, max=20 when only min set"
patterns-established:
  - Parent-set pre-pass once per validate call; reused by all parent-aware rules
requirements-completed:
  - REQ-V1.2-schema-validation
duration: 13min
phase: 50
plan: 50-01
completed: 2026-05-26
end-commit: bb458abc8359825112c3609c5eb64798b8d0c5e9
---
# 50-01: v1.2 schema validation in lib/workflow.js

## Accomplishments

- Extended `lib/workflow.js#validate(template)` with 8 new v1.2 rules covering
  `parent:`, `after:`, `max_children:`, `min_children:`, and `persist:` fields.
- All pre-existing rules (workflow name, version, binds_to, depends_on cycles)
  remain intact; new rules layered on top of the same errors/warnings shape.

## Task Commits

- `bb458ab` feat(50-01): v1.2 schema validation in lib/workflow.js

## Files Created

- `test/unit-workflow-schema-v12.js` — 31 assertions, all green

## Files Modified

- `lib/workflow.js`
- `package.json`

## Decisions Made

- One sibling-set pre-pass per validate call; reused across all rules.
- Defaults applied at validation time (min=1, max=20) so max>=min check is
  always meaningful even when only one is declared.
- Non-parent phases declaring `max_children`/`min_children` emit warning,
  not error (lenient — schema is still well-formed).

## Deviations

None.

## Issues

None.

## Next Phase Readiness

- 50-02 (`lib/fanout.js`) can assume validated input: every parent has
  bounded max/min, no grandchildren, sibling-only child deps.
