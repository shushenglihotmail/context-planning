---
phase: "66"
name: Docs + MIGRATION-v1.4.md + v1.4.0 release
milestone: v1.4 Workflow-driven quick and milestone
status: in-progress
created: 2026-05-27
base-commit: 396305fc9533c8a64ad802ca8d4e8ac074639458
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

# Phase 66: Docs + MIGRATION-v1.4.md + v1.4.0 release

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

- [ ] 66-01: {brief description}
- [ ] 66-02: {brief description}
- [ ] 66-03: {brief description}

## Notes

<!-- Free-form during phase execution. -->
