---
subsystem: bin/commands/write-summary
key-decisions:
  - "Two new CLI flags: --no-expected-check (skip P5 entirely) and --strict-expected (hard-block on drift, exit 2)"
  - Defaults preserve soft behavior - drift emits stderr notice + key-decisions sentence but does not block
  - Dryrun integration test in test/dryrun-write-summary.js covers default/strict/opt-out paths
phase: 21
plan: 21-02
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
# Summary 21-02

Plan 21-02 completed.
