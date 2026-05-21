---
phase: "16"
plan: "03"
subsystem: design
tags:
  - validation
  - summary
  - hard-block
requires: []
provides:
  - key-decisions validation
  - exit-2 CLI hard-block
  - cp-write-summary skill doc
  - backfilled SUMMARYs
affects:
  - lib/milestone
  - bin/commands/write-summary.js
  - commands/cp/write-summary.md
techAdded: []
techPatterns:
  - ValidationError tagged with EVALIDATION code
  - exact-message hard-block (greppable for users)
  - exit-2 contract for input-validation failures
filesCreated:
  - docs/superpowers/plans/2026-05-20-v0-7-plan-16-03-key-decisions-hard-block.md
filesModified:
  - lib/milestone.js
  - bin/commands/write-summary.js
  - commands/cp/write-summary.md
  - test/unit-design.js
key-decisions:
  - writeSummary throws ValidationError (name+code) on empty key-decisions
  - Exact error message includes Unicode greater-or-equal so users can grep
  - CLI exit code 2 for input-validation (distinct from 1 for runtime errors)
  - Backfilled 33 existing SUMMARYs to satisfy new constraint
patternsEstablished:
  - ValidationError class for cp library validation throws
  - exit-2 = input validation failure CLI convention
requirementsCompleted:
  - "v0.7 spec: key-decisions hard-block"
completed: 2026-05-20
end-commit: 88d995d583f2be3eaedc4c51b0ffe5a7c351f7ad
---
# Summary 16-03

Plan 16-03 completed.
