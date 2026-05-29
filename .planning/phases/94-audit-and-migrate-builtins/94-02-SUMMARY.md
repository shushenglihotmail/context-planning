---
title: Migrate built-in workflows to whitelist
bullets:
  - templates/workflows/{quick,milestone,docs}.yaml declare supervisor tokens via no-default params
  - templates/workflows/docs.yaml params shape fixed (object -> array)
  - templates/workflow-templates/review-and-address.yaml migrated off {{scope}} in id/after
  - cp audit shows high=0
key-decisions:
  - Built-in migration delivered in phase 93; phase 94 plans book the same work for accountability
phase: 94
plan: 94-02
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
# Summary 94-02

Plan 94-02 completed.
