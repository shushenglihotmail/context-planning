---
phase: "45"
name: Refactor cp-quick + cp-autonomous to shims
milestone: v1.1 Workflow Skills
status: in-progress
created: 2026-05-25
base-commit: a595c7e04713a5ce8130ec241419ead59fe6ef5d
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

# Phase 45: Refactor cp-quick + cp-autonomous to shims

**Milestone**: v1.1 Workflow Skills
**Created**: 2026-05-25

## Goal

{Describe what this phase delivers in 1-2 sentences.}

## Success Criteria

<!-- Observable from the user's perspective. -->
1. {behavior 1}
2. {behavior 2}

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [ ] 45-01: {brief description}
- [ ] 45-02: {brief description}
- [ ] 45-03: {brief description}

## Notes

<!-- Free-form during phase execution. -->
