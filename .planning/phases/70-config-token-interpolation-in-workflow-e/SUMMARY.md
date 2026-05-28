---
phase: 70
slug: config-token-interpolation-in-workflow-e
milestone: v1-5-role-skill-semantics
status: complete
duration: 1 session
---

# Phase 70 — Config-token interpolation in workflow templates

## What shipped

Fixed the v1.4 cp-quick bug where `${config.provider.quick_design_skill}` and
`${config.provider.execute_skill}` literals reached the supervisor unsubstituted.
Two independent gaps were closed:

1. **`interpolateConfigTokens` primitive** (`lib/workflow-template-expand.js`).
   Resolves `${config.<dot.path>}` tokens against a loaded config object.
   When the path is absent, consults a hard-coded `CONFIG_FALLBACKS` table
   mapping each canonical superpowers skill role to its default skill name.
   Unknown paths with no fallback throw a clear error citing the template.

2. **Top-level `params:` processing** (`lib/workflow.js loadTemplate`).
   The loader now reads `source.params`, interpolates each default via the
   primitive (best-effort `.planning/config.json` load through a new
   `loadConfigSafe` helper), then substitutes `{{name}}` tokens throughout
   every top-level phase body using the existing `template-substitute.js`
   engine. Substitution opts into a new `allowUndeclared: true` mode so
   runtime tokens like `{{task_description}}` and `{{slug_with_date}}`
   pass through untouched for later substitution by `cp run`.

`mergeArgs` (already used by inline workflow-template inclusion) also gets
the interpolation pass so nested templates referencing `${config...}` in
param defaults now work the same way.

## Why the expanded scope

Phase 70 was originally framed as "add the primitive". Tracing the actual
quick.yaml bug revealed that the v1.4 loader never reads top-level `params:`
at all — the array is parsed but silently dropped. A primitive alone would
have been dead code. The expanded fix delivers a working zero-config quick
workflow end-to-end.

## CONFIG_FALLBACKS table

```
provider.quick_design_skill → writing-plans
provider.plan_skill         → writing-plans
provider.execute_skill      → subagent-driven-development
provider.brainstorm_skill   → brainstorming
provider.review_skill       → requesting-code-review
```

These mirror the canonical superpowers skill names so a fresh project with
no `.planning/config.json` still resolves the documented quick.yaml roles.

## Files touched

- `lib/workflow-template-expand.js` — primitive + CONFIG_FALLBACKS + cfg
  threaded through `expandGroup` → `mergeArgs` + `loadConfigSafe` helper
  for top-level expansion entry.
- `lib/workflow.js` — top-level `params:` block, interpolation, lenient
  substitution, `t.params` exposed for inspection, local `loadConfigSafe`.
- `lib/template-substitute.js` — new `opts.allowUndeclared` flag (existing
  strict callers unchanged).
- `.planning/milestones/v1-5-role-skill-semantics/DESIGN.md` — documented
  fallback table + loader-processing rationale (70-01).
- `test/unit-workflow-template-expand.js` — 8 new cases for the primitive.
- `test/unit-workflow-toplevel-params.js` (new) — 7 integration cases
  covering the loader path end-to-end.
- `package.json` — new test file wired into the chain.

## Verification

- Full `npm test` green (all suites pass).
- Manual smoke: `loadTemplate('quick')` returns phase bodies with
  `skill: writing-plans` and `skill: subagent-driven-development`
  resolved, `{{task_description}}` and `{{slug_with_date}}` preserved.

## What this enables for later phases

- Phase 73 can rewrite `templates/workflows/quick.yaml` (and milestone /
  complete-milestone) with confidence that `${config...}` and `{{...}}`
  both work at the top level.
- Phase 71 (skill routing through `provider.resolveSkill` in runtime
  `formatInstruction`) can assume the loader hands it already-substituted
  phase bodies — it only has to dereference resolved skill names, not
  unwrap tokens.

## Commits

- 70-00 PLAN.md
- 70-01 DESIGN.md fallback table + loader-processing note
- 70-02 `interpolateConfigTokens` primitive + CONFIG_FALLBACKS
- 70-03 Wire primitive into `mergeArgs` for nested templates
- 70-04 Top-level `params:` processing in `loadTemplate` + `allowUndeclared`
- 70-05 Unit tests (primitive + loader integration)
- 70-06 SUMMARY + full-suite verification
