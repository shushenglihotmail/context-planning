---
phase: "71"
name: Skill routing via provider.resolveSkill in runtime
milestone: v1.5 Role/skill semantics
status: complete
created: 2026-05-28
completed: 2026-05-28
base-commit: cc6c49b2164ee494697fb88edd3f8678049f3593
key-files:
  - lib/runtime.js
  - test/unit-resolve-phase-skill.js
  - test/integration-format-instruction-skills.js
  - package.json
---

# Phase 71 — Skill routing via provider.resolveSkill in runtime

## What shipped

`lib/runtime.js` now treats every phase's `skill:` field as a *routable
identifier* rather than a literal:

- **`resolvePhaseSkill(phaseSkill, opts)`** classifies the value into one
  of four sources:
  - `absent` — no skill field.
  - `routing-key` — the value matches a key in the active provider's
    `skills` map (e.g. `plan`, `execute`, `brainstorm`). The resolved
    name comes from `provider.resolveSkill(role)`, which also handles
    fall-back to the `manual` provider when superpowers isn't installed.
  - `pinned` — the value already names a provider skill literally
    (e.g. `writing-plans`, `subagent-driven-development`,
    `cp:manual/plan`). Returned as-is, no lookup.
  - `pass-through` — neither of the above. Returned as-is and a warning
    is pushed onto `opts.warningsOut` (and surfaced on stderr by
    `formatInstruction` unless `silenceWarnings: true`).
- **`formatInstruction`** now emits `skill: <name> (source: <source>)`
  instead of the raw value, so authors can immediately see whether the
  workflow framework recognised their skill key.

Role is now persona-only: nothing in this phase consults `phase.role`
to pick a skill. Phase 72 will enforce the orthogonality at the schema
level.

## Why

Before v1.5, workflow authors had to hand-type provider-specific skill
names into YAML (`skill: writing-plans`), forcing them to know which
provider was active and breaking the moment that provider was swapped.
The Phase 70 + Phase 71 pairing lets templates instead say
`skill: plan` and have it route correctly under any installed provider
— *or* pin a literal name when they really want a specific
implementation. Both styles round-trip cleanly.

## How to verify

```
node test/unit-resolve-phase-skill.js
node test/integration-format-instruction-skills.js
npm test
```

All previously-passing tests still pass. Two new test files (11 new
checks total) are wired into the npm test chain.

## Plans

- 71-01 `resolvePhaseSkill` helper in `lib/runtime.js` ✓
- 71-02 wire helper into `formatInstruction` ✓
- 71-03 unit tests for `resolvePhaseSkill` ✓
- 71-04 integration test for `formatInstruction` skill rendering ✓
- 71-05 full `npm test` green + SUMMARY ✓

## Follow-ups

- Phase 72: schema validator enforces role/skill orthogonality (role
  must not look like a routing key; skill must be a string).
- Phase 73: rewrite `quick.yaml`, `milestone.yaml`,
  `complete-milestone.yaml` to the new conventions (use routing keys
  + `${config.…}` defaults).
- Phase 74: migrate `test/fixtures/workflows/*.yaml`.
- Phase 75: docs + CHANGELOG + v1.5.0 release.
