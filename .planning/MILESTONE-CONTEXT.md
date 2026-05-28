# Milestone Context — v1.5 Role/skill semantics

**Status:** active
**Started:** 2026-05-28
**Slug:** `v1-5-role-skill-semantics`

## Goal

Make workflow phases use `role` (persona) and `skill` (procedure /
routing key) as orthogonal, well-defined concepts, and make every
workflow template work out of the box with zero user configuration.

## Why now

While dogfooding `cp-quick` (v1.4) on another repo, the harness skipped
its design/clarification gate on a one-line task description and jumped
to implementing. Root cause: `quick.yaml`'s design phase declares
`skill: "{{design_skill}}"` whose default is
`${config.provider.quick_design_skill}` — a config key that no provider
defines, and a token the runtime never interpolates. So no real skill
binds, and the persona-shaped `role: planner` doesn't pick up the slack.

## Out of scope

- Adding new provider skills.
- Migration tooling for external custom workflows (we have no customers).
- UI / docs site updates beyond in-repo README + DESIGN docs.

## Constraints

- GSD shape compatibility (`cp gsd-import` must remain clean).
- Zero runtime deps in `bin/` / `lib/`.
- Node-only; no external services.
- Pre-customer → breaking schema changes OK; migrate in-repo fixtures.

## Key decisions (locked in DESIGN.md)

1. `role` = persona (free-form, optional).
2. `skill` = routing key by default; literal provider skill name if it
   matches a registered one (pinned escape hatch).
3. Workflow param defaults must be **literal routing keys** that exist
   in every provider's `skills:` map.
4. `${config.<dot.path>}` interpolation is supported in param defaults
   but resolved at run time; unresolved tokens are a hard error.

## Provides

- A workflow schema where role and skill are orthogonal and self-evident.
- Workflow templates (`quick.yaml`, `milestone.yaml`,
  `complete-milestone.yaml`) that work after a bare `cp init`.
- A runtime that emits resolved skill names into supervisor
  instructions (no `{{...}}` or `${config.…}` leaks).
- Validator warnings that catch the misuse pattern.

## Affects

- `lib/workflow-template-expand.js`
- `lib/runtime.js`
- `lib/workflow.js`
- `templates/workflows/*.yaml`
- `test/fixtures/workflows/*.yaml`
- `test/unit-*.js`
- `test/dryrun-workflow-cli.js`
- `.planning/milestones/v1-4-…/DESIGN.md` (doc-only follow-up note)
