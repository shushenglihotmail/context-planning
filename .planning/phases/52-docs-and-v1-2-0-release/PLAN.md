---
phase: "52"
name: Docs + MIGRATION-v1.2.md + v1.2.0 release
milestone: v1.2 Unified Phase Model
status: pending
plan-status:
  52-01: pending
  52-02: pending
  52-03: pending
created: 2026-05-26
base-commit: 3cc9262
expected_files:
  - CHANGELOG.md
  - MIGRATION-v1.2.md
  - README.md
  - bin/commands/autonomous.js
  - bin/commands/init.js
  - bin/commands/run.js
  - bin/commands/status.js
  - bin/commands/workflow.js
  - commands/cp/autonomous.md
  - commands/cp/capture.md
  - commands/cp/execute-phase.md
  - commands/cp/map-codebase.md
  - commands/cp/new-milestone.md
  - commands/cp/new-project.md
  - commands/cp/plan-phase.md
  - commands/cp/progress.md
  - commands/cp/quick.md
  - commands/cp/workflow-customize.md
  - lib/autonomous.js
  - lib/custom.js
  - lib/fanout.js
  - lib/lifecycle.js
  - lib/milestone.js
  - lib/runtime-fanout.js
  - lib/runtime.js
  - lib/workflow.js
  - package.json
  - templates/quick-DESIGN.md
  - templates/quick-PLAN.md
  - templates/quick-STATE.md
  - templates/workflows/debug.yaml
  - templates/workflows/dev.yaml
  - templates/workflows/quick.yaml
  - test/dryrun-progress.js
  - test/dryrun-workflow-cli.js
  - test/fixtures/workflows/quick-mini.yaml
  - test/integration-fanout-v12.js
  - test/integration-runtime.js
  - test/unit-autonomous.js
  - test/unit-custom.js
  - test/unit-fanout.js
  - test/unit-runtime-fanout.js
  - test/unit-workflow-schema-v12.js
  - test/unit-workflow.js
---

# Phase 52: Docs + MIGRATION-v1.2.md + v1.2.0 release

**Milestone**: v1.2 Unified Phase Model
**Created**: 2026-05-26

## Goal

Document the v1.2 model end-to-end, write the migration guide, refresh
README/CHANGELOG, bump to 1.2.0, tag, and push commits ready for npm publish.

## Success Criteria

1. `MIGRATION-v1.2.md` covers persist rename, custom->quick collapse, cp-plan-phase removal, parent/after/max_children schema, fold-into-DESIGN behavior.
2. README.md + CHANGELOG.md reflect v1.2 schema, storage diagram, CLI table.
3. `package.json` is at `1.2.0`; commit + tag `v1.2.0` pushed.

## Plans

- [x] 52-01: MIGRATION-v1.2.md - persist rename, custom->quick collapse, cp-plan-phase removal, parent:/after:/max_children: schema, fold-into-DESIGN behavior.
- [x] 52-02: CHANGELOG.md + README.md updates (workflow YAML examples with new schema; new tier-file storage diagram; updated CLI table).
- [x] 52-03: Bump package.json to 1.2.0; commit; tag v1.2.0 (publish to npm is user-driven).

## Notes
