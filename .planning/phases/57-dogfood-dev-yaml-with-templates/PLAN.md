---
phase: "57"
name: Dogfood dev.yaml with templates
milestone: v1.3 Reusable Phase Templates
status: in-progress
created: 2026-05-27
base-commit: 2fee5902b42511c5d3ce55b5b7aa231171528853
# expected-key-files (optional, v0.8 P5) — declare what each plan
# intends to touch. `cp write-summary` will diff against the actual
# `key-files` and warn on drift (soft) or block (with --strict-expected).
# Two shapes accepted:
#   1. Flat array — phase-wide expected list:
#        expected-key-files:
#          - lib/foo.js
#          - test/foo.js
#   2. Object keyed by plan id — per-plan expectations:
#        expected-key-files:
#          {{NN}}-01:
#            - lib/foo.js
#          {{NN}}-02:
#            - bin/cli.js
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

- [ ] 57-01: Ship `feature-plan` + `feature-execute` phase-templates
- [ ] 57-02: Ship `_examples/dev-templated.yaml` workflow using the templates
- [ ] 57-03: Integration test asserting templated example produces equivalent resolved phases

## Notes

We chose NOT to rewrite the production `dev.yaml` because it is the
canonical bootstrap workflow that drives cp's own milestones; breaking
it would block every cp user. The example file demonstrates the value
without risk. A follow-up milestone can migrate `dev.yaml` once the
templates have soaked in field use.

