---
title: Integration fixtures + loader roundtrip coverage
outcome: Created templates/workflows/_fixtures-v13/ with five fixtures (bare-v12, wrapped-phase, template-include-stub, error-template-with-prompt, error-phase-template-override). Added test/integration-workflow-v13.js with 6 cases exercising each fixture through the public loadTemplate() + validate() path, plus a regression assert that the canonical quick.yaml workflow still loads cleanly. Wired the integration file into the npm test chain. Full suite (now including v1.3 fixtures) green.
key-decisions:
  - Fixtures live under templates/workflows/_fixtures-v13/ so they share the resolution path with shipping workflows but are namespaced for test-only use.
  - Integration tests assert ONLY the absence of field-rules violations on the well-formed template-include-stub.yaml fixture, so future Phase 55 work can flip the guard off without forcing test rewrites.
  - "The error fixtures pin the exact violation classes (forbidden prompt: on template inclusion; phase-level role/prompt overrides on a phase-template reference) to lock down DESIGN.md Q3/Q4 semantics."
  - "expected-vs-actual drift: 3 expected-but-untouched (test/integration-workflow-v13.js, lib/workflow.js, test/unit-workflow-schema-v13.js)"
key-files:
  - path: templates/workflows/_fixtures-v13/bare-v12.yaml
    change: created
    note: v1.2 baseline
  - path: templates/workflows/_fixtures-v13/wrapped-phase.yaml
    change: created
    note: "phase: wrapper roundtrip"
  - path: templates/workflows/_fixtures-v13/template-include-stub.yaml
    change: created
    note: happy-path workflow-template inclusion
  - path: templates/workflows/_fixtures-v13/error-template-with-prompt.yaml
    change: created
    note: "rejects forbidden prompt: on template inclusion"
  - path: templates/workflows/_fixtures-v13/error-phase-template-override.yaml
    change: created
    note: rejects phase-level overrides on a template reference
  - path: test/integration-workflow-v13.js
    change: created
    note: 6 integration cases via loadTemplate()
  - path: package.json
    change: modified
    note: added integration-workflow-v13.js to test chain
phase: 53
plan: 53-04
completed: 2026-05-27
end-commit: bc3ccb4b613f0c31e90c1a363e156466212179a9
---
# Summary 53-04

Plan 53-04 completed.
