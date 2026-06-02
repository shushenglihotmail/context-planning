---
phase: "84"
name: auto-inject-finalize
milestone: v1.6 Workflow Contract Hardening
status: in-progress
created: 2026-05-29
base-commit: fc1ad8c61ea8d59bc1cc7283b396b0a93fce0b61
expected_files:
  - bin/commands/run.js
  - lib/runtime.js
  - lib/workflow-template-expand.js
  - test/integration-format-instruction-skills.js
  - test/integration-runtime.js
  - test/unit-workflow-template-expand.js
---

# Phase 84: auto-inject-finalize

**Milestone**: v1.6 Workflow Contract Hardening
**Created**: 2026-05-29

## Goal

Implement D1 of v1.6: cp `loadTemplate` auto-injects a synthetic `finalize`
phase whenever the workflow YAML omits one, so that every `cp run <workflow>`
run reaches a deterministic closing step that flips state.json `status` to
`complete`. Adds a generic `cp run-finalize <slug>` CLI for workflows that
don't bind to quick/milestone.

## Success Criteria

1. Loading `debug.yaml` (which has no finalize phase) yields a phases list
   that ends in an injected `finalize` scaffold phase whose command runs
   `cp quick-finalize {{slug_with_date}}` (matching its `binds_to: quick`).
2. Loading `quick.yaml` (which already declares finalize) is a no-op: the
   loader does NOT inject a second finalize.
3. `cp run-finalize <slug>` flips `.planning/runs/<slug>/state.json` to
   `status: complete` and writes a minimal SUMMARY.md if absent.
4. `cp workflow inspect debug` surfaces the injected phase with a
   `[auto-injected]` marker (human form) and `auto_injected: true` (JSON).
5. Full test suite + audit stay green.

## Plans

- [x] 84-01: implement loader auto-inject + `cp run-finalize` CLI + inspect surface + tests

## Notes

<!-- Free-form during phase execution. -->
