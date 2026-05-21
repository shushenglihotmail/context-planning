---
subsystem: lib/milestone + lib/lifecycle + templates
key-decisions:
  - "Two shapes for expected-key-files frontmatter: flat array (phase-wide) or object keyed by plan id (with sibling-SUMMARY union)"
  - Soft by default - drift -> stderr notice + key-decisions appendage; strictExpected=true raises ValidationError
  - P5 runs after P2/P3 in writeSummary, before end-commit stamp; .planning/ paths filtered from actual side
phase: 21
plan: 21-01
completed: 2026-05-21
key-files:
  created: []
  modified:
    - bin/commands/write-summary.js
    - lib/lifecycle.js
    - lib/milestone.js
    - templates/phase-PLAN.md
    - test/dryrun-write-summary.js
    - test/unit-lifecycle.js
end-commit: 15a8cc030a324727b2a7784ddd81c2c76d947cd5
---
# Summary 21-01

Plan 21-01 completed.
