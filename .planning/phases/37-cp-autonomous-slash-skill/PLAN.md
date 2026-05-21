---
phase: "37"
name: /cp-autonomous slash skill
milestone: v0.10 Autonomy
status: in-progress
created: 2026-05-21
base-commit: 417bf09dd0dbc4be4e2fdcff7e5a14901f2ef7dc
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

# Phase 37: /cp-autonomous slash skill

**Milestone**: v0.10 Autonomy
**Created**: 2026-05-21

## Goal

{Describe what this phase delivers in 1-2 sentences.}

## Success Criteria

<!-- Observable from the user's perspective. -->
1. {behavior 1}
2. {behavior 2}

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [ ] 37-01: {brief description}

## Notes

<!-- Free-form during phase execution. -->
