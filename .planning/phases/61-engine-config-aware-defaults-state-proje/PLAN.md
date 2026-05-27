---
phase: "61"
name: Engine: config-aware defaults + STATE/PROJECT CLI helpers
milestone: v1.4 Workflow-driven quick and milestone
status: in-progress
created: 2026-05-27
base-commit: 9b6adfd58d2807917c1aa8d142dd60237aacc825
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

# Phase 61: Engine: config-aware defaults + STATE/PROJECT CLI helpers

**Milestone**: v1.4 Workflow-driven quick and milestone
**Created**: 2026-05-27

## Goal

{Describe what this phase delivers in 1-2 sentences.}

## Success Criteria

<!-- Observable from the user's perspective. -->
1. {behavior 1}
2. {behavior 2}

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [ ] 61-01: {brief description}
- [ ] 61-02: {brief description}
- [ ] 61-03: {brief description}
- [ ] 61-04: {brief description}

## Notes

<!-- Free-form during phase execution. -->
