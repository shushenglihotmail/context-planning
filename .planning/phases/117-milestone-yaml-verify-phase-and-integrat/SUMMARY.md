---
phase_id: 117
title: milestone-yaml-verify-phase-and-integration-tests
status: complete
milestone: v1-10-skill-routing-verify-gate
invoked_skill: (inline-fallback)
---

# SUMMARY — Phase 117: milestone verify-gate wiring + integration tests

## What shipped

**`templates/workflows/milestone.yaml`** — DAG and defaults update:

1. Two new params: `verify_command` (default `""`) and `verify_skip`
   (default `""`).
2. New `verify` phase between the fanout (`propose-phases` → child-plan
   → child-execute) and `review`:
   ```yaml
   - phase:
       id: verify
       kind: scaffold
       depends_on: [ propose-phases ]
       command: "cp run-verify {{milestone_slug}} {{verify_skip}}"
   ```
3. `review.depends_on` rewired: `[propose-phases]` → `[verify]`. Review
   cannot run until tests pass.
4. `review_skill` default changed: `"code-review"` (a literal that
   existed in no routing map nor any SP catalog — root cause of the v4.7
   "skill missing" complaints) → `"review"` (the established routing key
   that resolves cleanly to `requesting-code-review` via the superpowers
   provider config). No fuzzy sigil needed — the routing path was already
   there, the default was just wrong.

**`test/integration-milestone-verify-gate.js`** — 8 assertions:
- milestone.yaml loads + `workflow.validate()` is ok.
- verify phase exists, `kind: scaffold`.
- verify.command references `cp run-verify` and substitutes `{{milestone_slug}}`.
- review.depends_on includes `verify`.
- `review_skill` default is `"review"` (not `"code-review"`).
- `verify_command` and `verify_skip` params declared.
- Wave ordering: verify wave strictly before review wave.
- Wave ordering: propose-phases strictly before verify.

All 8 pass.

## Verification (full)

- `integration-milestone-verify-gate`: **8 / 8 pass**
- `unit-workflow`: 83 / 83 pass (regression, no schema breakage)
- `integration-fanout-milestone-v18`: 17 / 17 pass (no breakage to the
  milestone fanout integration scenario, which exercises the same template)
- `integration-runtime`: 68 / 68 pass (no breakage to wave-walker)

## Behavioral impact

For **new** milestone runs:
- After every milestone's child-execute phases complete, `cp run-verify`
  runs the project's test command.
- If tests pass → review proceeds.
- If tests fail → review is blocked (DAG dependency violation); user
  sees real failing test output and must fix before the run advances.
- If no test command is configured / detected → warn-only, exit 0
  (review proceeds; same as old behavior, but now with a clear hint
  on how to opt in).

For **in-flight** milestone runs (those already past `propose-phases`):
- The template change does not retroactively rewrite RUN.yaml.
- Existing runs continue with the old DAG; new runs use the new DAG.

For **users who don't want the gate**:
- Set `verify_skip: --skip` as a template param at `cp run` time, or
- Set `behavior.test_command: ""` and accept the warn-and-proceed path.

## Scope adherence

Did NOT touch (per PLAN explicit non-goals):
- `lib/runtime.js`, `lib/verify.js`, `lib/provider.js`
- Config refresh (no `behavior.test_command` default added — explicit opt-in)
- Any other workflow template (`quick.yaml`, `phase.yaml`, etc.)

## Files touched

- `templates/workflows/milestone.yaml` (+14 lines net)
- `test/integration-milestone-verify-gate.js` (new)
- `package.json` (+1 test entry)

## Next: phase 118 — docs sweep + CHANGELOG + npm publish v1.10.0.
