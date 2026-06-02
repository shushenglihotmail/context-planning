---
phase: "61"
name: Reserved CLI verbs
milestone: v1.4 Workflow-driven quick and milestone
status: in-progress
created: 2026-05-28
base-commit: e5c03bc5d9c1e33983d87cfd650ef9f9f8d51c4a
expected_files:
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
  - test/integration-supervisor-flow.js
  - test/unit-checkpoint.js
  - test/unit-classify.js
  - test/unit-milestone-helpers.js
  - test/unit-project-update.js
  - test/unit-run-lifecycle.js
  - test/unit-supervisor-state.js
  - test/unit-workflow-schema-v14.js
---

# Phase 61: Reserved CLI verbs

**Milestone**: v1.4 Workflow-driven quick and milestone
**Created**: 2026-05-28

## Goal

Add Set 1 of v1.4's reserved CLI helpers — declarative engine verbs
that the new milestone workflow YAML calls via `kind: scaffold`:
`cp project update`, `cp milestone-setup-check`, `cp milestone-finalize`.
Then add Set 2 — quick-task + run-lifecycle verbs: `cp quick-setup`,
`cp quick-finalize`, `cp abandon`, `cp list`, `cp status <run-id>`.

## Success Criteria

1. `cp project update --from <json>` applies declarative PROJECT.md mutations idempotently.
2. `cp milestone-setup-check <slug>` validates prerequisites (PROJECT.md exists, doctor green) with a clear non-zero exit + actionable message on failure.
3. `cp milestone-finalize <slug>` updates STATE.md and prints a deterministic next-step banner.
4. `cp quick-setup --task <txt>` scaffolds `.planning/quick/<YYYY-MM-DD>-<slug>/` with DESIGN.md + STATE.md.
5. `cp quick-finalize <slug>` writes SUMMARY.md, updates project STATE.md.
6. `cp abandon <run-id>` soft-abandons a workflow run (state→abandoned, never touches git).
7. `cp list` enumerates runs; `cp status <run-id>` reports a single run's state.
8. All new verbs have unit tests, all wired into `npm test`, audit HIGH=0.

## Plans

- [x] 61-01: cp project update + milestone-setup-check + milestone-finalize
- [x] 61-02: cp quick-setup + quick-finalize + abandon + list + status

## Notes

<!-- Free-form during phase execution. -->
