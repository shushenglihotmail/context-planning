---
phase: "62"
name: Workflow YAMLs + slash wrappers
milestone: v1.4 Workflow-driven quick and milestone
status: in-progress
created: 2026-05-28
base-commit: 7d5fe648c81230ca4e4cea0aa85549e3eb278651
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
- [ ] 62-03: Rewrite slash command wrappers (new-milestone, quick, complete-milestone)

## Notes

<!-- Free-form during phase execution. -->
