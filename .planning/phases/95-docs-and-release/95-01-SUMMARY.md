---
title: CHANGELOG and version bump
bullets:
  - Bumped package.json 1.6.0 -> 1.7.0
  - Wrote CHANGELOG.md 1.7.0 entry covering whitelist, supervisor params, built-in migrations
  - Documented migration notes inline
key-decisions:
  - Released as 1.7.0 minor ? additive validator, but author-facing breaking change for custom workflow-templates
phase: 95
plan: 95-01
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
# Summary 95-01

Plan 95-01 completed.
