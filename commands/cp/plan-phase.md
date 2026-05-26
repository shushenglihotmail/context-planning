---
name: cp-plan-phase
description: DEPRECATED in v1.2 — phase planning is now folded into the workflow runtime. Use /cp-autonomous or `cp run <workflow> "<milestone>"` instead.
argument-hint: "<phase number>"
requires: []
deprecated: true
---

# /cp-plan-phase  *(deprecated)*

This skill is **deprecated as of v1.2** and will be removed in v1.3.

## Why

Plan generation used to require a dedicated step:

```
/cp-plan-phase 1
  -> scaffolds PLAN.md from the provider's plan skill
  -> human reviews
/cp-execute-phase 1
  -> walks PLAN.md tasks
```

In v1.2 the workflow runtime (`cp run`) folds planning *into* each
phase. The built-in `dev` workflow has a `plan` phase whose only job
is to produce a `DESIGN.md` for the next stage — there is no
separate "scaffold a PLAN.md" pre-step to invoke.

## What to do instead

For a milestone-bound phase (the normal path):

```
cp run dev "<milestone name>"            # start the run if needed
cp run resume <run-slug>                 # get the next phase instruction
# (the provider's plan skill is invoked from inside the dev workflow)
cp run mark-complete <run-slug> <phase-id> < summary
```

Or drive the whole milestone end-to-end via the autonomous skill:

```
/cp-autonomous
```

For ad-hoc work that doesn't fit a phase, use the quick tier:

```
/cp-quick "<short task description>"
```

## Migration alias

If a caller invokes `/cp-plan-phase N`, treat it as a request to
plan phase N and gently redirect:

1. Ask the user whether they meant `/cp-autonomous` (full milestone
   drive) or `cp run resume <slug>` (single phase advance).
2. Do **not** create the legacy `.planning/phases/NN-slug/PLAN.md`
   file. The dev workflow's `plan` phase produces `DESIGN.md`.
3. If the user insists on the legacy shape, point them at the
   v1.1 release notes and the `cp run` migration in
   `MIGRATION-v1.2.md`.

## Will this come back?

No. The planning step is now part of every workflow's prompt
contract. Custom workflows can attach their own plan phase via
the v1.2 schema (parent/child phases — see
`templates/workflows/dev.yaml`).
