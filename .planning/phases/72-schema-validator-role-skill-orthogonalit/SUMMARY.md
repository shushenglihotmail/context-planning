---
phase: "72"
name: Schema validator role/skill orthogonality
milestone: v1.5 Role/skill semantics
status: complete
completed: 2026-05-28
---

# Phase 72: Schema validator role/skill orthogonality

## Outcome

`lib/workflow.js` `validate()` now treats `role` as persona-only and `skill`
as routing key or pinned provider literal. The validator catches the
v1.4-era confusion (`role: plan`) at template load time instead of letting
it leak into runtime instructions.

## Rules implemented

1. **role looks like a routing key → warning.** Example: `role: plan`
   warns "role is persona only; use skill: plan instead and set role to a
   persona (e.g. developer, tech-writer)".
2. **role + skill BOTH routing keys AND differ → error.** Example:
   `role: plan, skill: execute` rejects the template with "must agree
   (drop one or set role to a persona like 'developer')".
3. **role + skill BOTH routing keys, same value → warning only.** Same
   role-looks-like-routing-key warning; not a hard error since the intent
   is unambiguous.
4. **Persona role + any skill → clean.** No warnings.
5. **kind: scaffold skips the check.** Scaffold phases already get their
   own role/skill-ignored warnings; we don't double up.

## How "routing key" is determined

`getKnownRoutingKeys()` lazily derives the Set from
`provider.loadDefaults().cp.providers.superpowers.skills` keys (the
canonical routing vocabulary). Falls back to a hardcoded list
(`brainstorm, plan, execute, execute_simple, review, receive_review,
finish, worktree, tdd, debug, verify`) when defaults can't be loaded so
the validator never crashes.

## Files changed

- `lib/workflow.js`: `getKnownRoutingKeys()` lazy getter + orthogonality
  check inside `validateV12Schema`.
- `test/unit-workflow-schema-v14.js`: 7 new `check()` cases covering each
  rule above. Total 30 cases, all pass.

## Verification

- `node test/unit-workflow-schema-v14.js` → 30/30 pass.
- Full `npm test` → green (all ~80 test files pass).
- Manual smoke test exercising `validate()` directly confirmed warning
  text and error text match spec.

## Notes

- No runtime behaviour change yet; this is purely an authoring-time gate.
- Phase 73 will rewrite the templates (`quick.yaml`, `milestone.yaml`,
  `complete-milestone.yaml`) so they pass this validator cleanly with
  persona roles + routing-key skills.
