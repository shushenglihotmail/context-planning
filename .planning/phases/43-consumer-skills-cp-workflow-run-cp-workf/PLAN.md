---
phase: "43"
name: Consumer skills: cp-workflow-run, cp-workflow-list, cp-workflow-resume
milestone: v1.1 Workflow Skills
status: in-progress
created: 2026-05-25
base-commit: 122e21c2893a4786d2a29a24a8e621abf7efdc62
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

# Phase 43: Consumer skills: cp-workflow-run, cp-workflow-list, cp-workflow-resume

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

- [ ] 43-01: {brief description}
- [ ] 43-02: {brief description}
- [ ] 43-03: {brief description}
- [ ] 43-04: {brief description}

## Notes

<!-- Free-form during phase execution. -->
