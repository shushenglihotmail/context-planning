---
phase: "57"
name: Dogfood dev.yaml with templates
milestone: v1.3 Reusable Phase Templates
status: in-progress
created: 2026-05-27
base-commit: 2fee5902b42511c5d3ce55b5b7aa231171528853
expected_files:
  - bin/commands/_usage.js
  - bin/commands/index.js
  - bin/commands/phase-template.js
  - bin/commands/workflow-template.js
  - bin/commands/workflow.js
  - lib/phase-template-loader.js
  - lib/phase-template-resolver.js
  - lib/template-substitute.js
  - lib/workflow-template-expand.js
  - lib/workflow-template-loader.js
  - lib/workflow.js
  - package.json
  - templates/phase-templates/_fixtures-v13/chain-a.yaml
  - templates/phase-templates/_fixtures-v13/chain-b.yaml
  - templates/phase-templates/_fixtures-v13/chain-deep-1.yaml
  - templates/phase-templates/_fixtures-v13/chain-deep-2.yaml
  - templates/phase-templates/_fixtures-v13/chain-deep-3.yaml
  - templates/phase-templates/_fixtures-v13/chain-deep-4.yaml
  - templates/phase-templates/feature-execute.yaml
  - templates/phase-templates/feature-plan.yaml
  - templates/phase-templates/reviewer.yaml
  - templates/workflow-templates/_fixtures-v13/chain-1.yaml
  - templates/workflow-templates/_fixtures-v13/chain-2.yaml
  - templates/workflow-templates/_fixtures-v13/chain-3.yaml
  - templates/workflow-templates/_fixtures-v13/chain-4.yaml
  - templates/workflow-templates/review-and-address.yaml
  - templates/workflows/_examples/dev-templated.yaml
  - templates/workflows/_fixtures-v13/bare-v12.yaml
  - templates/workflows/_fixtures-v13/chain-depth-exceeded.yaml
  - templates/workflows/_fixtures-v13/chain-depth-ok.yaml
  - templates/workflows/_fixtures-v13/error-phase-template-override.yaml
  - templates/workflows/_fixtures-v13/error-template-with-prompt.yaml
  - templates/workflows/_fixtures-v13/missing-required-arg.yaml
  - templates/workflows/_fixtures-v13/template-include-stub.yaml
  - templates/workflows/_fixtures-v13/unused-arg.yaml
  - templates/workflows/_fixtures-v13/uses-phase-template.yaml
  - templates/workflows/_fixtures-v13/uses-workflow-template.yaml
  - templates/workflows/_fixtures-v13/wf-chain-depth-exceeded.yaml
  - templates/workflows/_fixtures-v13/wf-chain-depth-ok.yaml
  - templates/workflows/_fixtures-v13/wf-group-id-collision.yaml
  - templates/workflows/_fixtures-v13/wrapped-phase.yaml
  - test/dryrun-template-cli-v13.js
  - test/integration-dev-templated-equivalence.js
  - test/integration-phase-templates-v13.js
  - test/integration-workflow-templates-v13.js
  - test/integration-workflow-v13.js
  - test/unit-phase-template-loader.js
  - test/unit-phase-template-resolver.js
  - test/unit-template-substitute.js
  - test/unit-workflow-schema-v13.js
  - test/unit-workflow-template-expand.js
  - test/unit-workflow-template-loader.js
---

# Phase 57: Dogfood dev.yaml with templates

**Milestone**: v1.3 Reusable Phase Templates
**Created**: 2026-05-27

## Goal

Ship reusable phase-templates that capture the `child-plan` / `child-execute`
fan-out pair from `dev.yaml`, and demonstrate them in an `examples/`
workflow that produces an equivalent resolved phase list. Leave the
production `dev.yaml` unchanged to avoid destabilising the bootstrap
workflow during the v1.3 cycle.

## Success Criteria

1. Built-in phase-templates `feature-plan` and `feature-execute` ship under `templates/phase-templates/`.
2. An example workflow `templates/workflows/_examples/dev-templated.yaml` uses both templates and loads cleanly via `loadTemplate()`.
3. The resolved phase list from the templated example matches `dev.yaml`'s resolved phase list field-for-field (other than ids, by design).

## Plans

- [x] 57-01: Ship `feature-plan` + `feature-execute` phase-templates
- [x] 57-02: Ship `_examples/dev-templated.yaml` workflow using the templates
- [x] 57-03: Integration test asserting templated example produces equivalent resolved phases

## Notes

We chose NOT to rewrite the production `dev.yaml` because it is the
canonical bootstrap workflow that drives cp's own milestones; breaking
it would block every cp user. The example file demonstrates the value
without risk. A follow-up milestone can migrate `dev.yaml` once the
templates have soaked in field use.

