---
phase: "95"
name: docs-and-release
milestone: Template parameterization whitelist
status: in-progress
created: 2026-05-29
base-commit: e5d525c84293bdb5a6f03734b17527cb0847ac9b
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

# Phase 95: docs-and-release

**Milestone**: Template parameterization whitelist
**Created**: 2026-05-29

## Goal

{Describe what this phase delivers in 1-2 sentences.}

## Success Criteria

<!-- Observable from the user's perspective. -->
1. {behavior 1}
2. {behavior 2}

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [x] 95-01: {brief description}
- [x] 95-02: {brief description}

## Notes

<!-- Free-form during phase execution. -->
