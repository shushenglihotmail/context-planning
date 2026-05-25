---
subsystem: tooling
tags:
  - agent-skill
  - workflow
  - authoring
requires: []
provides:
  - cp-workflow-new-skill
affects:
  - commands/cp/workflow-new.md
tech-stack:
  added: []
  patterns:
    - agent-skill-numbered-steps
key-files:
  created:
    - commands/cp/workflow-new.md
  modified: []
key-decisions:
  - Skill refuses to reuse built-in template names outright (no --force escape hatch) — you cannot override quick/dev/debug from the project tree.
  - Skill refuses project-name collision unless --force, mirroring the underlying CLI behavior.
  - Added explicit When-to-use-this vs cp-workflow-customize callout so the two creator skills do not compete during agent skill selection — authoring is fresh-start; customize is tweak-existing.
  - Skill ends with a /cp-workflow-run <name> hint so the next user action is one click away.
patterns-established: []
requirements-completed: []
duration: 12min
phase: 44
plan: 44-02
completed: 2026-05-25
end-commit: 9eb08c59ce7d0bd13c357f6960b57eda74bf28c1
---
# Summary 44-02

Plan 44-02 completed.
