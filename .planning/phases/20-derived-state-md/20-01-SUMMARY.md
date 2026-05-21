---
tags:
  - cli
  - state
  - derive
provides:
  - lib/state.deriveState
  - lib/state.regenerate
  - lib/state._splitState
subsystem: state
duration: ~1h
tech-stack:
  - node:fs
  - node:child_process
  - node:path
patterns-established:
  - try { state.regenerate(root) } catch — never block lifecycle ops on state sync
  - "_splitState carves on the Progress: line as the derived/curated boundary"
affects:
  - lib/lifecycle
  - lib/milestone
requirements-completed:
  - "Drift cause #2: stale STATE — eliminated for tick/write-summary/scaffold-phase/complete-milestone"
requires:
  - lib/roadmap
  - lib/paths
  - lib/lifecycle.statusReport
key-decisions:
  - deriveState reuses statusReport rather than re-implementing milestone detection
  - Preserve existing Last activity line when no cp commit is found, so callers like completeMilestone keep their context-specific message
  - Force Idle status + 0% when no in-progress milestone, even if old phases still appear in ROADMAP
  - Lazy require state from lib/milestone to avoid cyclic load (state -> lifecycle -> milestone)
phase: 20
plan: 20-01
completed: 2026-05-21
key-files:
  created:
    - bin/commands/state.js
    - test/dryrun-state.js
    - test/unit-state.js
  modified:
    - bin/commands/_usage.js
    - bin/commands/index.js
    - lib/lifecycle.js
    - lib/milestone.js
    - lib/state.js
    - package.json
end-commit: db2c66bbc49ebbccab01ff6a06b774e9ac07dab1
---
# Summary 20-01

Plan 20-01 completed.
