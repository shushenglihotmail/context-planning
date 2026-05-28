---
phase: "73"
name: Rewrite built-in workflow YAMLs
milestone: v1.5 Role/skill semantics
status: in-progress
created: 2026-05-28
base-commit: a688a75523fed986def2f8620284afd4f681f3a4
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

# Phase 73: Rewrite built-in workflow YAMLs

**Milestone**: v1.5 Role/skill semantics
**Created**: 2026-05-28

## Goal

{Describe what this phase delivers in 1-2 sentences.}

## Success Criteria

<!-- Observable from the user's perspective. -->
1. {behavior 1}
2. {behavior 2}

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

<!-- No plans yet. Add via `cp scaffold-plan` (coming in v0.4) or edit by hand. -->

## Notes

<!-- Free-form during phase execution. -->
