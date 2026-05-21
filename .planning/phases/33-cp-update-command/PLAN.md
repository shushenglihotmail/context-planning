---
phase: "33"
name: cp update command
milestone: v0.9 Onboarding
status: in-progress
created: 2026-05-21
base-commit: e4f431c8bd443eadbe527fac2b9ae2453ba9565d
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

# Phase 33: cp update command

**Milestone**: v0.9 Onboarding
**Created**: 2026-05-21

## Goal

{Describe what this phase delivers in 1-2 sentences.}

## Success Criteria

<!-- Observable from the user's perspective. -->
1. {behavior 1}
2. {behavior 2}

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [ ] 33-01: {brief description}
- [ ] 33-02: {brief description}

## Notes

<!-- Free-form during phase execution. -->
