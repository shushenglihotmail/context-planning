---
phase: "82"
name: prompt-scrub-and-config-fallbacks
milestone: v1.6 Workflow Contract Hardening
status: in-progress
created: 2026-05-29
base-commit: b747e240b8a69223c9517ebacc159704070a9536
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

# Phase 82: prompt-scrub-and-config-fallbacks

**Milestone**: v1.6 Workflow Contract Hardening
**Created**: 2026-05-29

## Goal

Implement D3 (expand CONFIG_FALLBACKS with 5 missing role-keys → Superpowers
skill names) and D4 (6 inline prompt-scrub edits across 4 orchestrator skills)
from the v1.6 design spec. No new files, smallest blast radius of the v1.6
phases.

## Success Criteria

1. `CONFIG_FALLBACKS` in `lib/workflow-template-expand.js` contains the 5 new rows
   (`test_skill`, `debug_skill`, `verify_skill`, `execute_plan_skill`,
   `finish_branch_skill`) plus the original 5 — 10 rows total.
2. The 6 prompt edits from the spec's Change 4 table are applied verbatim
   (intent-equivalent) to `cp-quick`, `cp-workflow-run`, `cp-new-project`,
   `cp-execute-phase` SKILL.md files.
3. `npm test` still passes (no broken assertions; no new tests needed for prose
   edits, though new fallback rows may want a unit test).

## Plans

- [x] 82-01: Apply D3 CONFIG_FALLBACKS expansion + D4 prompt-scrub edits + unit test for new fallback rows.

## Notes

<!-- Free-form during phase execution. -->
