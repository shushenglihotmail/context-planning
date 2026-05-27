---
plan-id: 55-01
status: done
title: Workflow-template loader
key-files:
  - lib/workflow-template-loader.js
  - test/unit-workflow-template-loader.js
key-decisions:
  - Separate namespace for workflow-templates (vs phase-templates)
  - Reserve -- as namespace separator; reject internal ids containing --
  - "Accept bare, phase: and template: wrapped entries; loader extracts canonical internal id"
phase: 55
plan: 55-01
completed: 2026-05-27
end-commit: 439fbb00cbbd0211799131fd6ef3f09a058152ac
---
# Summary 55-01

Plan 55-01 completed.
