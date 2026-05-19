---
phase: {{PHASE_DIR}}
plan: {{PLAN_NUM_PADDED}}
subsystem: {{SUBSYSTEM}}
tags: []

# Dependency graph
requires: []
provides: []
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions: []
patterns-established: []

requirements-completed: []

# Metrics
duration: {{DURATION_MIN}}min
completed: {{COMPLETED_DATE}}
---

# Phase {{PHASE_NUM}}: {{PHASE_NAME}} Summary

**{{ONE_LINER}}**

## Performance

- **Duration:** {{DURATION_HUMAN}}
- **Started:** {{STARTED_ISO}}
- **Completed:** {{COMPLETED_ISO}}
- **Tasks:** {{TASKS_COUNT}}
- **Files modified:** {{FILES_COUNT}}

## Accomplishments

<!-- 2-4 bullets — substantive outcomes, NOT "phase complete". -->

## Task Commits

<!-- One line per task; atomic commit hashes. -->

## Files Created / Modified

<!-- `path/to/file.ext` — what it does -->

## Decisions Made

<!-- Key decisions with brief rationale, or "None — followed plan as written". -->

## Deviations from Plan

<!-- "None — plan executed exactly as written" OR list of auto-fixes. -->

## Issues Encountered

<!-- Problems during planned work and how they were resolved, or "None". -->

## Next Phase Readiness

<!-- What's ready, any blockers/concerns to surface in STATE.md. -->

---
*Phase: {{PHASE_DIR}}*
*Plan: {{PLAN_NUM_PADDED}}*
*Provider: {{PROVIDER}} ({{EXECUTE_SKILL}})*
*Completed: {{COMPLETED_DATE}}*
