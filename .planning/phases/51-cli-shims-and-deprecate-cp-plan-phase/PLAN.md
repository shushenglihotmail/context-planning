---
phase: "51"
name: CLI shims + deprecate cp-plan-phase
milestone: v1.2 Unified Phase Model
status: pending
plan-status:
  51-01: pending
  51-02: pending
  51-03: pending
  51-04: pending
  51-05: pending
created: 2026-05-26
base-commit: 3cc9262
expected_files:
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

# Phase 51: CLI shims + deprecate cp-plan-phase

**Milestone**: v1.2 Unified Phase Model
**Created**: 2026-05-26

## Goal

Make `cp autonomous` and `cp quick` thin shims that call `cp run <workflow>`,
collapse the `.planning/custom/` tree into `.planning/quick/`, deprecate
the cp-plan-phase skill, and prove parity with a smart-gate test suite.

## Success Criteria

1. `cp autonomous` for an in-progress milestone calls `cp run <workflow>` per pending phase.
2. `cp quick "<task>"` scaffolds `.planning/quick/<slug>/{DESIGN.md, STATE.md}` (no PLAN.md scaffold).
3. `.planning/custom/` is read-only with deprecation warning; new writes go to `.planning/quick/`.
4. cp-plan-phase skill prints a deprecation notice and exits cleanly.
5. Smart-gate + scope/argv parity tests pass (~50 assertions); `npm test` green.

## Plans

- [x] 51-01: Refactor `bin/commands/autonomous.js` - for each pending milestone-phase, call `cp run <workflow>`; drop cp-plan-phase invocations.
- [x] 51-02: Refactor `bin/commands/quick.js` - scaffold `quick/<slug>/{DESIGN.md, STATE.md}`; remove quick-PLAN.md path; update cp-quick skill.
- [x] 51-03: Collapse `.planning/custom/` into `.planning/quick/`; alias `binds_to: custom` -> quick; read-only back-compat for both old roots with deprecation warning.
- [x] 51-04: Deprecate `cp-plan-phase` skill (one-line nudge to `cp run dev` or configured workflow); audit and update other cp-* skills that referenced it as a prereq.
- [x] 51-05: Smart-gate + scope/argv parity tests for both autonomous and quick (~50 assertions).

## Notes
