---
base-commit: 9cda838d4772d1c0fa1bf0854069ec066996957c
expected_files:
  - lib/phase-template-loader.js
  - lib/phase-template-resolver.js
  - lib/runtime-fanout.js
  - lib/workflow-template-expand.js
  - lib/workflow-template-loader.js
  - lib/workflow.js
  - package.json
  - templates/workflow-templates/_fixtures-v13/chain-3.yaml
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
  - templates/workflows/_fixtures-v13/wf-group-id-collision.yaml
  - templates/workflows/_fixtures-v13/wrapped-phase.yaml
  - templates/workflows/debug.yaml
  - templates/workflows/dev.yaml
  - templates/workflows/quick.yaml
  - test/fixtures/workflows/cycle.yaml
  - test/fixtures/workflows/dangling-dep.yaml
  - test/fixtures/workflows/debug-mini.yaml
  - test/fixtures/workflows/dev-mini.yaml
  - test/fixtures/workflows/linear.yaml
  - test/fixtures/workflows/missing-id.yaml
  - test/fixtures/workflows/parallel.yaml
  - test/fixtures/workflows/quick-mini.yaml
  - test/integration-runtime.js
  - test/integration-workflow-v13.js
  - test/unit-runtime-fanout.js
  - test/unit-workflow-inline-templates-v14.js
  - test/unit-workflow-phase-adapter.js
  - test/unit-workflow-schema-v12.js
  - test/unit-workflow-schema-v13.js
  - test/unit-workflow-schema-v14.js
  - test/unit-workflow-template-expand.js
---

# Phase 59: YAML grammar overhaul: phase/template wrappers + description

**Milestone**: v1.4 Workflow-driven quick and milestone
**Created**: 2026-05-27

## Goal

Land the v1.4 YAML grammar overhaul in the workflow engine: require
`phase:` / `template:` wrappers at the top level of `phases:`, require
`description:` on every phase, accept the new `supervised:` workflow
field and the new per-phase `materialize:` / `outputs:` fields, change
`max_children` default from 20 to 10, and add inline
`phase_templates:` / `workflow_templates:` blocks with the
inline→project→builtin lookup order.

Bare-form phase entries (the v1.3 shape) are rejected with a clear
error that points at MIGRATION-v1.4.md (written later in phase 69).

## Success Criteria

<!-- Observable from the user's perspective. -->
1. `cp run-check templates/workflows/dev.yaml` reports OK after the
   dev.yaml migration in 59-03 and reports a structured error on any
   bare-form workflow file.
2. `npm test` passes after all three plans land.
3. A workflow that omits `description:` on a phase fails validation
   with a clear error naming the offending phase id.

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [x] 59-01: Additive validator updates — accept `supervised:` (workflow-
      level), `materialize:` / `outputs:` (per-phase) without errors;
      change `max_children` default from 20 to 10. No grammar breaks
      yet; tests should still pass.
- [x] 59-02: Inline `phase_templates:` + `workflow_templates:` blocks
      with lookup-order resolution (inline → project → builtin).
      Grammar slot only for workflow-templates (v1.5 fully expands).
- [x] 59-03: Flip the grammar break — require `phase:` / `template:`
      wrappers, require `description:`; migrate `dev.yaml`,
      `_examples/dev-templated.yaml`, and every test fixture across
      `test/` and `lib/__tests__/`. Single commit goes red→green.

## Notes

<!-- Free-form during phase execution. -->
