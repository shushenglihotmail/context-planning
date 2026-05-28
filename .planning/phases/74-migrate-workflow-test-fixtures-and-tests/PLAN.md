---
phase: "74"
name: Migrate workflow test fixtures and tests
milestone: v1.5 Role/skill semantics
status: in-progress
created: 2026-05-28
base-commit: 0e745ab6b21bd229e38b97ca23b8cb96bc43d01d
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

# Phase 74: Migrate workflow test fixtures and tests

**Milestone**: v1.5 Role/skill semantics
**Created**: 2026-05-28

## Goal

Add end-to-end test coverage proving the v1.5 stack delivers what the
milestone promised: when the supervisor opens a phase from the new
`quick.yaml` / `milestone.yaml`, the instruction contains a real skill
name (no `${config.…}`, no unresolved `{{...}}`), an explicit STOP/wait
gate on the design phase, and persona role. Also audit test fixtures.

## Success Criteria

1. New `test/integration-v15-builtin-templates.js` loads each shipped
   v1.5 template, expands params, formats a per-phase supervisor
   instruction, and asserts:
   - No `${config.` substring anywhere in the instruction.
   - No unresolved `{{…}}` token in skill/role lines.
   - `quick.yaml` design phase instruction contains the STOP gate text.
   - role is the persona literal (`tech-writer`, `developer`,
     `product-thinker`); skill is either the routing-key result
     (`writing-plans`/`subagent-driven-development`/`brainstorming`) or
     manual provider fallback.
2. Fixtures audit confirms no `test/fixtures/workflows/*.yaml` uses a
   routing-key value (`plan`, `execute`, `brainstorm`, ...) as `role:`;
   any that did are migrated.
3. `npm test` chain wires the new file and the full suite stays green.

## Plans

### 74-01 — Audit + migrate test fixtures

- Grep `test/fixtures/workflows/` for `role: <routing-key>`. Phase 73
  audit showed fixtures use `-er`-suffix personas (`planner`,
  `implementer`, `brainstormer`) which are NOT routing keys, so likely
  no migration. Re-confirm and document.

### 74-02 — End-to-end built-in template integration test

- Create `test/integration-v15-builtin-templates.js`.
- For each of `quick.yaml`, `milestone.yaml`:
  - Build a tmpdir project with default config (superpowers provider).
  - `loadTemplate` → `computeWaves` → for each phase, call the same
    `formatInstruction` codepath used in production (or directly verify
    rendered skill/role values).
  - Assert no `${config.` substring.
  - Assert no unresolved `{{...}}` in role/skill.
  - Assert `quick.yaml` `design` description retains the STOP gate.

### 74-03 — Wire test into npm test and run full suite

### 74-04 — SUMMARY

## Notes

- `${config.provider.*}` literals in `test/unit-workflow-toplevel-params.js`
  and `test/unit-workflow-template-expand.js` are intentional regression
  protection for Phase 70's interpolation feature; leave them alone.
- `roundtrip-gsd.js` round-trip mentioned in DESIGN is a v1.6 concern
  (depends on gsd-import behavior unchanged in v1.5).
