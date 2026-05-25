---
phase: "52"
name: cp-quick as thin shim over cp run (state migration)
milestone: v1.2 Unified Phase Model
status: in-progress
created: 2026-05-25
base-commit: bbe9ac4843c3926566e1d8ec3136637c3c2499fe
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

# Phase 52: cp-quick as thin shim over cp run (state migration)

**Milestone**: v1.2 Unified Phase Model
**Created**: 2026-05-25

## Goal

{Describe what this phase delivers in 1-2 sentences.}

## Success Criteria

<!-- Observable from the user's perspective. -->
1. {behavior 1}
2. {behavior 2}

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [ ] 52-01: {brief description}
- [ ] 52-02: {brief description}
- [ ] 52-03: {brief description}
- [ ] 52-04: {brief description}

## Notes

<!-- Free-form during phase execution. -->
