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
- [ ] 51-02: Refactor `bin/commands/quick.js` - scaffold `quick/<slug>/{DESIGN.md, STATE.md}`; remove quick-PLAN.md path; update cp-quick skill.
- [ ] 51-03: Collapse `.planning/custom/` into `.planning/quick/`; alias `binds_to: custom` -> quick; read-only back-compat for both old roots with deprecation warning.
- [ ] 51-04: Deprecate `cp-plan-phase` skill (one-line nudge to `cp run dev` or configured workflow); audit and update other cp-* skills that referenced it as a prereq.
- [ ] 51-05: Smart-gate + scope/argv parity tests for both autonomous and quick (~50 assertions).

## Notes
