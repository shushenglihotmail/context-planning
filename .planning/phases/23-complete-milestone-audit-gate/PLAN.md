---
phase: "23"
name: complete-milestone audit gate
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-21
base-commit: b78a188086460e411ebb8e6cc2686f808afe180c
expected-key-files:
  "23-01":
    - lib/lifecycle.js
    - bin/commands/complete-milestone.js
    - bin/commands/_usage.js
    - test/unit-lifecycle.js
    - test/dryrun-complete-milestone.js
---

# Phase 23: complete-milestone audit gate

**Milestone**: v0.8 Consistency
**Created**: 2026-05-21
**Base commit**: `b78a188`

## Goal

Block `cp complete-milestone` when `cp audit` reports HIGH (always) or
MEDIUM (default) findings. Add `--no-audit` and `--audit-warn` escape
hatches with mandatory stderr override notice on `--no-audit`.

## Success Criteria

1. `cp complete-milestone` runs `audit.runAudit` after verify, refuses
   with exit 2 and `reason: 'audit-failed'` when HIGH or MEDIUM exist.
2. `--audit-warn` allows MEDIUM-only milestones to ship (warning).
3. `--no-audit` bypasses the gate, emits override notice on stderr.
4. Fail-closed on audit error: `runAudit` throw → refuse with
   `reason: 'audit-error'`.
5. LOW-only findings ship normally with a warning.

## Plans

- [x] 23-01: Wire audit.runAudit into completeMilestone + CLI flags + tests

## Notes

Single-plan phase because the surgical scope is small (one library
function, one CLI wrapper, two test files). DESIGN.md is the
behavioural contract; tests are the verification surface.
