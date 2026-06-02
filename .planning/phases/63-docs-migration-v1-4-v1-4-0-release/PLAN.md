---
phase: "63"
name: Docs + MIGRATION-v1.4 + v1.4.0 release
milestone: v1.4 Workflow-driven quick and milestone
status: in-progress
created: 2026-05-28
base-commit: 3ef63f6ed953fa2bb0a8f4bd4a2855e9390ec860
expected_files:
  - CHANGELOG.md
  - MIGRATION-v1.4.md
  - README.md
  - bin/commands/abandon.js
  - bin/commands/checkpoint.js
  - bin/commands/classify.js
  - bin/commands/index.js
  - bin/commands/list.js
  - bin/commands/milestone-finalize.js
  - bin/commands/milestone-setup-check.js
  - bin/commands/project.js
  - bin/commands/quick-finalize.js
  - bin/commands/quick-setup.js
  - bin/commands/run.js
  - bin/commands/status.js
  - commands/cp/classify.md
  - commands/cp/complete-milestone.md
  - commands/cp/new-milestone.md
  - commands/cp/quick.md
  - commands/cp/run-supervised.md
  - lib/checkpoint.js
  - lib/classify.js
  - lib/milestone-helpers.js
  - lib/project-update.js
  - lib/quick-helpers.js
  - lib/run-lifecycle.js
  - lib/supervisor.js
  - lib/workflow.js
  - package.json
  - templates/workflows/complete-milestone.yaml
  - templates/workflows/milestone.yaml
  - templates/workflows/quick.yaml
  - test/dryrun-run-cli.js
  - test/dryrun-workflow-cli.js
  - test/integration-run-cli.js
  - test/integration-supervisor-flow.js
  - test/unit-autonomous.js
  - test/unit-checkpoint.js
  - test/unit-classify.js
  - test/unit-milestone-helpers.js
  - test/unit-project-update.js
  - test/unit-run-lifecycle.js
  - test/unit-supervisor-state.js
  - test/unit-workflow-schema-v14.js
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
