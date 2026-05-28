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

Ship v1.4 to users: refreshed docs that describe supervised workflows
and the new CLI verbs, a MIGRATION-v1.4.md guide for v1.3 users, and
the v1.4.0 release bump.

## Success Criteria

1. README documents `/cp-quick`, `/cp-new-milestone`,
   `/cp-complete-milestone` as workflow-driven; `cp run`, `cp abandon`,
   `cp list`, `cp status <run-id>` verbs are documented.
2. `MIGRATION-v1.4.md` exists at repo root and explains the v1.3 → v1.4
   upgrade path for workflow YAMLs (`after:` → `depends_on:`,
   `supervised:` flag) and any deprecated CLI shapes.
3. `package.json` version is `1.4.0`; `cp --version` prints `1.4.0`.

## Plans

- [x] 63-01: README + CLI help refresh for v1.4 supervised workflows
- [x] 63-02: Author MIGRATION-v1.4.md (v1.3 → v1.4 upgrade guide)
- [x] 63-03: Bump package.json to 1.4.0; verify `cp --version`; release notes

## Notes

<!-- Free-form during phase execution. -->
