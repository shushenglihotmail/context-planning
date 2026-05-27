---
title: Field-rules enforcement for template inclusion + phase-template refs
outcome: "Added field-rules validation in lib/workflow.js per DESIGN.md Q3/Q4. Workflow-template inclusion (kind=template) accepts only id+name+args+after; any other field is rejected with a precise error. Phase-template references (phase: wrapper with inner template:) accept only id+template+after; inner template: must be object with name+args. Both kinds reject user-set non-empty depends_on (use after: instead). 12 new test cases in unit-workflow-schema-v13.js cover happy paths plus every violation class. Full suite remains green."
key-decisions:
  - depends_on is auto-added by normalisePhase so it cannot be a forbidden key; instead it is flagged only when user-populated (length > 0).
  - Phase-template references emit a Phase 54 guard error (separate from the Phase 55 guard for workflow-template inclusion) since the two resolve in different phases.
  - "Inner template: blocks accept only name + args; any other key (e.g., a misspelled override field) is rejected with a precise path."
  - "expected-vs-actual drift: 2 expected-but-untouched (lib/workflow.js, test/unit-workflow-schema-v13.js)"
key-files:
  - path: lib/workflow.js
    change: modified
    note: field-rules branches for template inclusion + phase-template reference + Phase 54 guard
  - path: test/unit-workflow-schema-v13.js
    change: modified
    note: 12 new 53-03 test cases (27 total)
phase: 53
plan: 53-03
completed: 2026-05-27
end-commit: bc3ccb4b613f0c31e90c1a363e156466212179a9
---
# Summary 53-03

Plan 53-03 completed.
