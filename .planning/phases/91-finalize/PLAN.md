---
phase: "91"
name: finalize
milestone: Template parameterization whitelist
status: in-progress
created: 2026-05-29
base-commit: 14214d90a10037e9bbb6e9d8d2ac21e5d0882744
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

# Phase 91: finalize

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

<!-- No plans yet. Add via `cp scaffold-plan` (coming in v0.4) or edit by hand. -->

## Notes

<!-- Free-form during phase execution. -->
