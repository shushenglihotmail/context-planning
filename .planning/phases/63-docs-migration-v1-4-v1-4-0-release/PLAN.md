---
phase: "63"
name: Docs + MIGRATION-v1.4 + v1.4.0 release
milestone: v1.4 Workflow-driven quick and milestone
status: in-progress
created: 2026-05-28
base-commit: 3ef63f6ed953fa2bb0a8f4bd4a2855e9390ec860
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

# Phase 63: Docs + MIGRATION-v1.4 + v1.4.0 release

**Milestone**: v1.4 Workflow-driven quick and milestone
**Created**: 2026-05-28

## Goal

{Describe what this phase delivers in 1-2 sentences.}

## Success Criteria

<!-- Observable from the user's perspective. -->
1. {behavior 1}
2. {behavior 2}

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [ ] 63-01: {brief description}
- [ ] 63-02: {brief description}
- [ ] 63-03: {brief description}

## Notes

<!-- Free-form during phase execution. -->
