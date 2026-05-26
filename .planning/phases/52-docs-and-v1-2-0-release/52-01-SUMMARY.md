---
phase-id: "52"
title: MIGRATION-v1.2.md
outcome: Wrote MIGRATION-v1.2.md (325 lines, ~11KB) covering all v1.2 schema and CLI changes with v1.1->v1.2 diff blocks, deprecation table, fan-out section with depends_on inter-child ordering, fold-into-DESIGN explanation, .planning/custom -> .planning/quick recipe, and quick cheatsheet. Documents one-release alias path for every rename so v1.1 inputs keep loading.
key-decisions:
  - All renames documented as one-release deprecation aliases (removed in v1.3) — never as immediate breaks — matching the back-compat invariants enforced by the test suite.
  - Fan-out section documents the depends_on inter-child ordering refinement (today's design decision) as the primary v1.2 fan-out feature; array-order fallback is explained as the safety net for partial fills.
  - Cheatsheet table at the bottom lists every old->new pairing on one page for fast scanning; full prose explanations precede it for migrators who want context.
  - Did NOT touch CHANGELOG.md or README.md (those are 52-02). Did NOT bump package.json or tag (those are 52-03). Stayed in-scope.
key-files:
  - path: MIGRATION-v1.2.md
    change: added
    note: 325 lines / 11KB — full v1.1 -> v1.2 migration guide
phase: 52
plan: 52-01
completed: 2026-05-26
end-commit: 4ee83bef0a1bbea8685f23142000e56c2cfc6129
---
# Summary 52-01

Plan 52-01 completed.
