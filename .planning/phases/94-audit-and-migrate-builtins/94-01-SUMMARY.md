---
title: Audit templates/ for whitelist violations
bullets:
  - Scanned templates/workflows/*.yaml and templates/workflow-templates/*.yaml
  - All forbidden-field uses (e.g. {{scope}} in id/after) already migrated in phase 93
  - phase-templates/ is governed by a separate substitution system and out of scope
key-decisions:
  - Phase 94 scope folded into phase 93; no additional code changes required
phase: 94
plan: 94-01
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
end-commit: a0803b0e399cb01e64a03a49075c505dcfd757f1
---
# Summary 94-01

Plan 94-01 completed.
