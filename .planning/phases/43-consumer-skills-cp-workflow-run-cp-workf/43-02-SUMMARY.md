---
requires:
  - cp workflow ls / cp workflow show CLI (v1.0)
patterns-established:
  - Read-only cp-workflow-* skills end with next-action suggestions linking to write-side cp-workflow-* skills
duration: 8min
tags:
  - agent-skills
  - workflow-engine
  - discoverability
requirements-completed: []
key-decisions:
  - "DESCRIPTION column derived from first principles: entry, not a separate description: field (schema doesn't have one today; deferred to future rev)"
  - List mode separates built-ins from project templates in two table sections
  - End-of-output suggestions point to /cp-workflow-run, /cp-workflow-list <name>, /cp-workflow-new --from for full discoverability loop
  - Optional 'want me to run one?' offer suppressed if user already ran a workflow in session
key-files:
  created:
    - commands/cp/workflow-list.md
  modified: []
tech-stack:
  patterns:
    - read-only agent skill that renders CLI JSON output as user-friendly tables
  added: []
subsystem: tooling
affects:
  - commands/cp/workflow-list.md
provides:
  - cp-workflow-list agent skill — template discovery for Copilot CLI / Claude Code
phase: 43
plan: 43-02
completed: 2026-05-25
end-commit: 9852364f8075fc1817e9d3cd9170cfae94c0fc3a
---
# Summary 43-02

Plan 43-02 completed.
