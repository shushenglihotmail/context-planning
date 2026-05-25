---
tags:
  - agent-skills
  - workflow-engine
  - resume
  - retry
tech-stack:
  patterns:
    - agent skill that delegates wave-loop to sibling skill rather than duplicating
  added: []
key-decisions:
  - Wave-loop logic is NOT duplicated here — skill body cross-references cp-workflow-run Step 5 by name
  - --scope intentionally not supported on resume (would create inconsistent STATE); user must abandon + start fresh to re-scope
  - "Argument modes: enumeration / resume / --retry / --abandon; --abandon wins over --retry if both passed"
  - cp doctor re-resolved on resume to pick up newly-installed providers
subsystem: tooling
requirements-completed: []
patterns-established:
  - cp-workflow-* skills explicitly cross-reference each other when sharing execution sections (single-source-of-truth for wave-loop)
provides:
  - cp-workflow-resume agent skill — resume/retry/abandon for active workflow runs
affects:
  - commands/cp/workflow-resume.md
key-files:
  created:
    - commands/cp/workflow-resume.md
  modified: []
duration: 10min
requires:
  - cp run resume / retry / abandon / status CLI (v1.0)
  - cp-workflow-run skill (43-01) for wave-loop hand-off
phase: 43
plan: 43-03
completed: 2026-05-25
end-commit: b88abe81b6e277dbf9d7f89020b7c8c30a8c61b8
---
# Summary 43-03

Plan 43-03 completed.
