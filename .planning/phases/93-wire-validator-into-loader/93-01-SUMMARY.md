---
title: Pre-expand hooks in loadTemplate
bullets:
  - Added pre-expand validatePreExpand call per phase in lib/workflow.js
  - Allows no-default params and collects them into supervisorTokenNames Set
  - Threads allowedTokenNames through to post-expand
key-decisions:
  - No-default params declared at top-level workflow are supervisor-injected and post-expand allow-listed
phase: 93
plan: 93-01
completed: 2026-05-29
key-files:
  created:
    - lib/workflow-template-validate.js
    - test/unit-workflow-template-validate.js
  modified:
    - lib/workflow-template-expand.js
    - lib/workflow.js
    - templates/workflow-templates/review-and-address.yaml
    - templates/workflows/docs.yaml
    - templates/workflows/milestone.yaml
    - templates/workflows/quick.yaml
    - test/dryrun-template-cli-v13.js
    - test/fixtures/workflows/dev-mini.yaml
    - test/fixtures/workflows/quick-mini.yaml
    - test/integration-workflow-templates-v13.js
    - test/unit-workflow-template-expand.js
    - test/unit-workflow-toplevel-params.js
end-commit: bd7b0911257b3760ff03eabd92a59b11f2512e57
---
# Summary 93-01

Plan 93-01 completed.
