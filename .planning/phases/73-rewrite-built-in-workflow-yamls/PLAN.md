---
phase: "73"
name: Rewrite built-in workflow YAMLs
milestone: v1.5 Role/skill semantics
status: in-progress
created: 2026-05-28
base-commit: a688a75523fed986def2f8620284afd4f681f3a4
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

# Phase 73: Rewrite built-in workflow YAMLs

**Milestone**: v1.5 Role/skill semantics
**Created**: 2026-05-28

## Goal

Rewrite `templates/workflows/quick.yaml` and `templates/workflows/milestone.yaml` to the v1.5 shape: persona roles, routing-key skills, no `${config.provider.*_skill}` defaults. `complete-milestone.yaml` is audited and left as-is (all phases are kind=scaffold; no role/skill to migrate).

## Success Criteria

1. `quick.yaml` and `milestone.yaml` load cleanly under the v1.5 validator (no warnings, no errors).
2. Param defaults are literal routing keys (`plan`, `execute`, `brainstorm`), not `${config.provider.*}` tokens.
3. `role:` values are personas (`developer`, `tech-writer`, `product-thinker`); `skill:` values are routing keys via `{{param}}` substitution.
4. `quick.yaml` `design` phase description explicitly tells the supervisor to STOP and wait for user confirmation of DESIGN.md before marking complete.
5. `npm test` stays green (workflow validator tests and any fixture-based tests).

## Plans

### 73-01 — Rewrite quick.yaml

- Replace `design_skill` default `${config.provider.quick_design_skill}` → `plan`.
- Replace `execute_skill` default `${config.provider.execute_skill}` → `execute`.
- Add `design_role` param (default `tech-writer` — design phase is about writing the DESIGN doc, not coding) and `execute_role` param (default `developer`).
- Change `design` phase `role: planner` → `role: "{{design_role}}"`, skill stays `{{design_skill}}`.
- Change `execute` phase `role: implementer` → `role: "{{execute_role}}"`, skill stays `{{execute_skill}}`.
- Append explicit STOP/wait-for-user gate to `design` phase description.

### 73-02 — Rewrite milestone.yaml

- Replace `brainstorm_skill` default `${config.provider.brainstorm_skill}` → `brainstorm`.
- Replace `plan_skill` default `${config.provider.plan_skill}` → `plan`.
- Add `brainstorm_role` (default `product-thinker`) and `plan_role` (default `developer`) params.
- Change `brainstorm` phase `role: brainstormer` → `role: "{{brainstorm_role}}"`.
- Change `propose-project-updates` and `propose-phases` phases `role: planner` → `role: "{{plan_role}}"`.

### 73-03 — Audit complete-milestone.yaml and other templates

- Confirm complete-milestone.yaml has no role/skill (all kind=scaffold) — leave as-is.
- Grep templates/workflows/ for any other `${config.provider.*_skill}` or persona-as-routing-key violations; fix if found.

### 73-04 — Verify with validator + npm test

- Run a small node script that loads each templates/workflows/*.yaml through `loadTemplate` + `validate` and asserts ok=true, warnings=[].
- Run full `npm test`.

### 73-05 — Write SUMMARY.md

## Notes

- Routing keys (`plan`, `execute`, `brainstorm`, `review`, ...) are the stable vocabulary defined in `templates/config.json` superpowers/manual provider skills maps.
- Personas chosen: `tech-writer` for design/docs work, `developer` for code work, `product-thinker` for scope brainstorming.
- We keep `{{param}}` substitution (not bare literals) so users can override per-invocation without editing the template.
