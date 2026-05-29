---
title: Post-expand pass + integration
bullets:
  - validatePostExpand called after substitution with allowedTokenNames
  - "Whitelist expanded 5->8: added role, command, outputs"
  - Built-in workflows (quick, milestone, docs) declare supervisor tokens
  - Migrated review-and-address.yaml off forbidden id/after templating
  - Fixed docs.yaml params shape (was object, now array)
key-decisions:
  - Pre-v1.7 silent escape replaced by loud post-expand rejection
  - Workflow-template inclusion gains uniqueness via include id auto-prefix, not via {{scope}} interpolation
phase: 93
plan: 93-02
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
# Summary 93-02

Plan 93-02 completed.
