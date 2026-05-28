---
phase: "73"
name: Rewrite built-in workflow YAMLs
milestone: v1.5 Role/skill semantics
status: complete
completed: 2026-05-28
---

# Phase 73: Rewrite built-in workflow YAMLs

## Outcome

`templates/workflows/quick.yaml` and `templates/workflows/milestone.yaml`
now follow the v1.5 shape:

- **No more `${config.provider.*_skill}` defaults.** Param defaults are
  literal routing keys (`plan`, `execute`, `brainstorm`) — the exact
  v1.4-era bug that triggered this milestone.
- **`role:` is persona, `skill:` is routing key**, both parameterised
  via `{{param}}` so a caller can override either.
- **`quick.yaml` `design` phase has an explicit STOP/wait gate** in its
  description so the supervisor cannot jump straight to implementation
  on a terse task description.

## Files changed

### `templates/workflows/quick.yaml`
- `design_skill` default: `${config.provider.quick_design_skill}` → `plan`
- `execute_skill` default: `${config.provider.execute_skill}` → `execute`
- New params: `design_role` (default `tech-writer`), `execute_role`
  (default `developer`)
- `design` phase: `role: planner` → `role: "{{design_role}}"`;
  description gains explicit STOP-wait-for-user paragraph
- `execute` phase: `role: implementer` → `role: "{{execute_role}}"`

### `templates/workflows/milestone.yaml`
- `brainstorm_skill` default: `${config.provider.brainstorm_skill}` →
  `brainstorm`
- `plan_skill` default: `${config.provider.plan_skill}` → `plan`
- New params: `brainstorm_role` (default `product-thinker`),
  `plan_role` (default `developer`)
- `brainstorm` phase: `role: brainstormer` → `role: "{{brainstorm_role}}"`
- `propose-project-updates`, `propose-phases`: `role: planner` →
  `role: "{{plan_role}}"`

### `templates/workflows/complete-milestone.yaml`
- Audited: all phases are `kind: scaffold` (no role/skill). No changes.

### `templates/workflows/dev.yaml`, `debug.yaml`
- Audited: roles are persona-style with `-er` suffix (`planner`,
  `implementer`, `debugger`) which are NOT in the routing-key vocabulary
  (`plan`, `execute`, `debug`, ...). They pass the v1.5 validator
  cleanly. No changes.

## Verification

- Loaded each built-in template through `loadTemplate` + `validate`:
  - `quick.yaml`: ok=true, 0 warnings, 0 errors
  - `milestone.yaml`: ok=true, 0 errors (2 pre-existing
    `materialize`/`max_children` warnings on `propose-phases` —
    unrelated to v1.5)
  - `complete-milestone.yaml`, `dev.yaml`, `debug.yaml`: ok=true, 0
    warnings, 0 errors
- Full `npm test` → green (all ~80 test files pass).

## Notes

- The pre-existing milestone.yaml warnings on `propose-phases` are
  about the materialize/max_children parent-phase contract and predate
  v1.5. Tracked separately if needed; not in scope here.
- Fixtures under `templates/workflows/_fixtures-v13/` and
  `_examples/` still use older patterns — those belong to Phase 74
  (migrate test fixtures).
