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

{Describe what this phase delivers in 1-2 sentences.}

## Success Criteria

<!-- Observable from the user's perspective. -->
1. {behavior 1}
2. {behavior 2}

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [ ] 57-01: {brief description}
- [ ] 57-02: {brief description}
- [ ] 57-03: {brief description}

## Notes

<!-- Free-form during phase execution. -->
