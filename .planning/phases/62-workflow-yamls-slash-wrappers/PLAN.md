---
phase: "62"
name: Workflow YAMLs + slash wrappers
milestone: v1.4 Workflow-driven quick and milestone
status: in-progress
created: 2026-05-28
base-commit: 7d5fe648c81230ca4e4cea0aa85549e3eb278651
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

# Phase 62: Workflow YAMLs + slash wrappers

**Milestone**: v1.4 Workflow-driven quick and milestone
**Created**: 2026-05-28

## Goal

Author the three workflow YAML files defined in DESIGN.md
(`milestone.yaml`, `quick.yaml`, `complete-milestone.yaml`) and rewrite
the three slash-command SKILL.md wrappers to delegate to `cp run
<workflow>` instead of carrying inline orchestration.

## Success Criteria

1. `templates/workflows/milestone.yaml` exists and validates against the
   workflow grammar (`cp workflow validate templates/workflows/milestone.yaml`
   returns ok).
2. `templates/workflows/quick.yaml` exists and validates.
3. `templates/workflows/complete-milestone.yaml` exists and validates.
4. `commands/cp/new-milestone.md` is rewritten as a thin delegation to
   `cp run milestone "$ARGUMENTS"`.
5. `commands/cp/quick.md` is rewritten as a thin delegation to
   `cp run quick "$ARGUMENTS"`.
6. `commands/cp/complete-milestone.md` is rewritten as a thin delegation
   to `cp run complete-milestone "$ARGUMENTS"`.
7. `cp init` continues to copy commands/cp/* to .github/skills/cp-*/
   without error.
8. Full `npm test` green; audit HIGH=0.

## Plans

- [x] 62-01: Author templates/workflows/milestone.yaml
- [x] 62-02: Author templates/workflows/quick.yaml + complete-milestone.yaml
- [x] 62-03: Rewrite slash command wrappers (new-milestone, quick, complete-milestone)

## Notes

<!-- Free-form during phase execution. -->
