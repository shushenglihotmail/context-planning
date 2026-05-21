---
phase: "26"
name: Repair commands
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-22
base-commit: 15c8f1e19c0861b20d4c9324de4ff387f88434f6
expected-key-files:
  "26-01":
    - lib/reconcile.js
    - lib/audit-fix.js
    - bin/commands/reconcile.js
    - bin/commands/_usage.js
    - test/unit-reconcile.js
    - test/dryrun-reconcile.js
    - package.json
  "26-02":
    - lib/lifecycle.js
    - bin/commands/supersede.js
    - bin/commands/deviate.js
    - bin/commands/_usage.js
    - test/unit-supersede-deviate.js
    - test/dryrun-supersede-deviate.js
    - package.json
  "26-03":
    - bin/commands/scaffold-phase.js
    - bin/commands/_usage.js
    - test/dryrun-scaffold-continue.js
    - .planning/codebase/STRUCTURE.md
    - CHANGELOG.md
    - package.json
---

# Phase 26: Repair commands

**Milestone**: v0.8 Consistency
**Created**: 2026-05-22
**Base commit**: `15c8f1e`

## Goal

Ship four repair verbs (reconcile / supersede / deviate / scaffold-phase
--continue) and wire reconcile into the audit-fix FIXERS registry so the
most common drift findings auto-fix.

## Success Criteria

1. `cp reconcile <phaseNum> --infer-shas` fills missing `base-commit` and
   `end-commit` in PLAN.md via commit-log inference; atomic commit per phase.
2. `cp reconcile <phaseNum> --plan NN-MM --accept` rewrites a plan's
   `expected-key-files` to match actual `git diff base..end` set.
3. `cp audit --fix` automatically applies reconcile for
   `missing-base-commit` and `missing-end-commit` findings.
4. `cp supersede <planId> --by <newId>` replaces `- [ ]` / `- [x]` with
   `- [~]` and records a "Superseded by" note.
5. `cp deviate <phaseNum> --summary "<text>"` appends a dated deviation
   block to PLAN.md `## Notes`.
6. `cp scaffold-phase N --continue` bypasses the prior-summary gate and
   stamps `Continues from phase N-1` in the new phase Notes.
7. All four verbs honor `--dry-run` and `--json`; all atomic-commit with
   `cp(<verb>): ...` subject.
8. CHANGELOG Unreleased + STRUCTURE.md updated.

## Plans

- [x] 26-01: `cp reconcile` + reconcile-backed FIXERS for missing SHAs
- [x] 26-02: `cp supersede` + `cp deviate` lifecycle helpers + CLIs
- [ ] 26-03: `scaffold-phase --continue` + docs + legacy backfill dogfood

## Notes

Phase 29 will run `cp reconcile --infer-shas --all` as a one-shot backfill
to clean up the 62 legacy MEDIUM findings; phase 26 ships the underlying
machinery only (no `--all` flag yet — that's phase 29).
