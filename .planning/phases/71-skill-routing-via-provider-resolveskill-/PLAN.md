---
phase: "71"
name: Skill routing via provider.resolveSkill in runtime
milestone: v1.5 Role/skill semantics
status: in-progress
created: 2026-05-28
base-commit: cc6c49b2164ee494697fb88edd3f8678049f3593
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

# Phase 71: Skill routing via provider.resolveSkill in runtime

**Milestone**: v1.5 Role/skill semantics
**Created**: 2026-05-28

## Goal

Make `phase.skill` routable through `provider.resolveSkill()` so workflow
authors can write either a routing key (`plan`, `execute`, `brainstorm`, …)
or a literal provider skill name (`writing-plans`, …). The runtime emits
the resolved skill into supervisor instructions with a `(source: …)`
annotation for debuggability.

## Success Criteria

1. A phase with `skill: plan` produces supervisor output `skill: writing-plans (source: routing-key)` under the superpowers provider.
2. A phase with `skill: writing-plans` produces `skill: writing-plans (source: pinned)` (no double-lookup).
3. A phase with `skill: nonsense-no-such-thing` produces `skill: nonsense-no-such-thing (source: pass-through)` and emits a warning during expansion (manual provider can still serve it).
4. A phase without a `skill:` field continues to print `skill: (absent)`.
5. `role:` is no longer consulted by skill routing (it is persona only).
6. All existing tests still pass; new tests cover routing, pinning, and pass-through.

## Plans

### 71-01 — `resolvePhaseSkill` helper in `lib/runtime.js`

Add `resolvePhaseSkill(phaseSkill, cfg, opts)` returning `{name, source}` where
`source ∈ {"routing-key", "pinned", "pass-through", "absent"}`:

- `phaseSkill == null` → `{name: null, source: "absent"}`.
- Look up active provider via `cfg.cp.workflow_provider` (default `superpowers`).
- If `phaseSkill` is a key in `cp.providers.<active>.skills` → call
  `provider.resolveSkill(phaseSkill, projectDir)` → use `.skill` →
  `{name: resolved, source: "routing-key"}`.
- Else if `phaseSkill` appears as a *value* in any provider's `skills` map
  (i.e. it's already a literal provider skill name) → `{name: phaseSkill, source: "pinned"}`.
- Else → `{name: phaseSkill, source: "pass-through"}` + push warning if `opts.warningsOut`.

Files: `lib/runtime.js`.

### 71-02 — Wire `resolvePhaseSkill` into `formatInstruction`

In `formatInstruction` per-phase block, replace the bare `skill: <value>`
line with `skill: <resolved.name> (source: <resolved.source>)`. Load cfg
once at the top of `formatInstruction`. Preserve `(absent)` semantics.

Files: `lib/runtime.js`.

### 71-03 — Unit tests for `resolvePhaseSkill`

New `test/unit-resolve-phase-skill.js`. Cases:
- routing-key under superpowers (plan → writing-plans).
- pinned literal (writing-plans → writing-plans, source pinned).
- pass-through unknown (nonsense → nonsense + warning captured).
- absent (`null` → name null source absent).
- routing-key under manual fallback when superpowers not installed
  (plan → `cp:manual/plan`).

Wire into `package.json` test chain.

Files: `test/unit-resolve-phase-skill.js`, `package.json`.

### 71-04 — Integration test: `formatInstruction` emits resolved skill

New `test/integration-format-instruction-skills.js` (or extend the
existing `integration-workflow-skills.js`). Build a minimal template with
two phases (one routing-key, one pinned, one absent). Run through
`formatInstruction`. Assert the emitted text contains:

- `  skill: writing-plans (source: routing-key)`
- `  skill: subagent-driven-development (source: pinned)`
- `  skill: (absent)` for the no-skill phase

Wire into `package.json`.

Files: `test/integration-format-instruction-skills.js`, `package.json`.

### 71-05 — Full `npm test` + SUMMARY.md

Run full suite, fix any regressions surfaced (especially
`integration-workflow-skills.js`, `dryrun-workflow-cli.js`). Write
`.planning/phases/71-…/SUMMARY.md`. Commit.

Files: `SUMMARY.md`.

## Notes

- DESIGN.md `Components → lib/runtime.js` section is the authoritative
  spec; this PLAN.md just decomposes it.
- We deliberately do NOT change `role` routing — role is persona-only as
  of v1.5. Phase 72 (schema validator) enforces this orthogonality.
- The "pinned" detection requires scanning ALL providers' skill values,
  not just the active one, so a custom-config skill name in a YAML still
  rounds-trips correctly when the active provider changes.
