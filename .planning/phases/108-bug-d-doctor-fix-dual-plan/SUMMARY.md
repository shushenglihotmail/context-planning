Bug D complete via SDD (2 commits).

Commits:
- 1e2dbc9 feat(doctor): add --fix-dual-plan autofix (Bug D)
- 5d9b19c docs(plan-108): reconcile dual-plan heuristic with shipped behavior

Change: cp doctor --fix-dual-plan now archives the loser of dual-plan pairs (size/mtime rule, not the original delete-short-form-loser rule from the draft PLAN.md). Files moved to .planning/.archive/<phase-id>/<ISO-ts>-<basename>; never deleted. Without the flag, warn-only behavior preserved.

Files: lib/audit-fix.js (+56), bin/commands/doctor.js (+20), test/dryrun-doctor.js (+97), .planning/phases/108/PLAN.md (reconciled).

Tests: 55 dryrun-doctor (+5 new sections, +27 assertions). Full npm test green. Idempotent verified.

Reviews: Spec+quality (Haiku) flagged heuristic deviation from draft PLAN.md. Resolved by reconciling PLAN.md to shipped behavior (commit 5d9b19c) because the size/mtime rule is safer — draft would have deleted the larger detailed plan in the common case where a Haiku planner wrote over an empty stub. Quality checks: idempotent, Windows-safe timestamps, .archive/ excluded from rescans, no regressions in audit-fix or libs tests.
