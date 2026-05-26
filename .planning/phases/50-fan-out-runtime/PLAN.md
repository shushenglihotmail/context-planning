---
phase: "50"
name: Fan-out runtime
milestone: v1.2 Unified Phase Model
status: in-progress
plan-status:
  50-01: in-progress
  50-02: pending
  50-03: pending
  50-04: pending
created: 2026-05-26
base-commit: 3cc9262
---

# Phase 50: Fan-out runtime (parent: field, sibling pairing, max_children, 1-level limit)

**Milestone**: v1.2 Unified Phase Model
**Created**: 2026-05-26

## Goal

Wire the v1.2 parent/child phase model into the runtime: extend template
validation, build the fan-out expander, shape the agent prompt for
list-output parents, and prove the whole loop with integration tests
against a new `dev-v2` template.

## Success Criteria

1. Templates declaring `parent:`, child-level `after:`, `max_children:`,
   `min_children:` validate cleanly; invalid combinations (missing parent,
   grandchildren, max < min) fail with actionable errors.
2. `lib/fanout.js#expandPhases(phases, parentOutputs)` returns the
   materialised child phases ordered by sibling pairwise dependencies.
3. Runtime enforces `count <= max_children` and `count >= min_children`
   on parent's structured-list output; clear error on violation.
4. `dev-v2` built-in template runs end-to-end in a unit-level integration
   test with parent expanding to N children, each persisting individually.
5. `npm test` is green; no regressions across 49-01..49-04 test files.

## Plans

- [ ] 50-01: Workflow YAML schema extension — `parent:`, child-level `after:`, `max_children:` (default 20), `min_children:` (default 1); validation rules (parent must exist, no grandchildren, max >= min).
- [ ] 50-02: `lib/fanout.js` — expand child phases over parent's structured list output; pairwise sibling dep resolver; subtree-wait semantics for top-level deps on a parent.
- [ ] 50-03: Runtime agent contract — list-output prompt shaping ("produce up to N items"); enforce count <= max_children (error if exceeded); enforce count >= min_children.
- [ ] 50-04: Integration tests against a new built-in `dev-v2` template using fan-out (~25 assertions).

## Notes

