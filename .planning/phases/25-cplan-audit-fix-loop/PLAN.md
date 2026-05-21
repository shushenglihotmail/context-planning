---
phase: "25"
name: cplan audit --fix loop
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-21
base-commit: acd0dade25a666536e2e4427218b7a321f460467
expected-key-files:
  "25-01":
    - lib/audit-fix.js
    - test/unit-audit-fix.js
  "25-02":
    - bin/commands/audit.js
    - bin/commands/_usage.js
    - test/dryrun-audit-fix.js
    - package.json
---

# Phase 25: cplan audit --fix loop

**Milestone**: v0.8 Consistency
**Created**: 2026-05-21
**Base commit**: `acd0dad`

## Goal

Add `cp audit --fix` with classify → present → apply atomic loop.
Auto-fixes state-stale and summary-without-tick today; pluggable
fixer registry for phase 26 to extend.

## Success Criteria

1. `cp audit --fix` classifies findings into auto/manual/skip.
2. Auto-fixes execute with one atomic commit per finding (subject
   `cp(audit-fix): <id> <location>`).
3. `--max N` caps fixes (default 5).
4. `--severity high|medium|all` filters before classify (default all).
5. `--dry-run` plans without mutating.
6. Loop stops on fixer error; reports `failed`.
7. Exit 0 (clean or all fixed), 1 (any failed), 2 (manual remain).

## Plans

- [x] 25-01: lib/audit-fix.js classify + applyFixes + 2 fixers + unit tests
- [ ] 25-02: --fix CLI flag wiring + dryrun integration tests

## Notes

Pluggable fixer registry — phase 26 will append reconcile/supersede/
deviate entries. Keep registry surface stable.
