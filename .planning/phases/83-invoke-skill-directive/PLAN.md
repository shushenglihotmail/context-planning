---
phase: "83"
name: invoke-skill-directive
milestone: v1.6 Workflow Contract Hardening
status: in-progress
created: 2026-05-29
base-commit: 48beeb0f1579582fb82780dc6faa64c8f190b888
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

# Phase 83: invoke-skill-directive

**Milestone**: v1.6 Workflow Contract Hardening
**Created**: 2026-05-29

## Goal

Land v1.6 design change D2: the agent-facing wave block emits `invoke skill: <name>` as a binding directive instead of `skill: <name> (source: ...)`, and prints a one-time per-wave contract legend explaining the directive. Provenance is moved behind a new `cp run --verbose` flag.

## Success Criteria

1. Default (`cp run <wf>`) output uses `invoke skill: <name>` per phase, `skill: (none)` when absent, and no `(source: …)` annotation.
2. A contract legend (verbatim from spec §Change 1) prints once above the per-phase blocks of every wave.
3. `cp run --verbose <wf>` (and the same flag on `resume`) restores `skill: <name> (source: <source>)` and `skill: (absent)` for routing debugging.
4. Existing integration test `integration-format-instruction-skills.js` is updated to assert both modes; all unit + integration tests pass.

## Plans

- [x] 83-01: implement D2 invoke-skill directive in runtime + CLI verbose flag, update format-instruction-skills tests for dual-mode output

## Notes

<!-- Free-form during phase execution. -->
