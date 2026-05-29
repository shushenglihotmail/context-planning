---
title: Migration guide MIGRATION-v1.7.md
bullets:
  - Authored MIGRATION-v1.7.md with whitelist explanation, no-default param shape, three failure-recipe sections
  - Verified npm test green and cp audit high=0
key-decisions:
  - Migration guide ships alongside release; recipe-style format matches prior MIGRATION-v1.x.md
phase: 95
plan: 95-02
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
end-commit: 0db0e199a3a3461cb97de8470965de32866ddc62
---
# Summary 95-02

Plan 95-02 completed.
