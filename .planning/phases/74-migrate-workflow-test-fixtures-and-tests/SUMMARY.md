# Phase 74 — Migrate workflow test fixtures and tests

**Status:** complete
**Date:** 2025

## What changed

1. **Test-fixtures audit (74-01).** `test/fixtures/workflows/` uses persona-style roles (`planner`, `implementer`, `brainstormer`). All pass the new orthogonality validator from Phase 72 — no migration needed. Intentional negative fixtures (bad-yaml/cycle/dangling-dep/missing-id) left untouched.

2. **New integration test (74-02).** Added `test/integration-v15-builtin-templates.js` with 7 cases that load every shipped v1.5 template through `loadTemplate → computeWaves → formatInstruction` and assert:
   - clean load + validate
   - no leaked `${config.…}` or unresolved `{{…}}` on role/skill lines
   - persona roles + routing-key (or `cp:manual/…`) skills
   - STOP gate present in `quick.yaml` design phase prompt

3. **Root-cause fix to quick.yaml + milestone.yaml.** The new integration test surfaced a latent bug from v1.4: those two templates only declared `description:` on each phase, but `formatInstruction` emits `prompt:` (not `description:`). The STOP gate copied into `design.description` in Phase 73 never reached the supervisor. Added explicit `prompt:` blocks to every non-scaffold phase in both files. The design phase's prompt now carries the STOP / wait-for-user-confirmation gate verbatim — this is the actual end-to-end fix for the original v1.4 cp-quick bug.

4. **Wired test into npm test (74-03).** Inserted the new integration test after `integration-format-instruction-skills.js` in `package.json`. Full `npm test` green.

## Files touched

- `templates/workflows/quick.yaml` — added `prompt:` to `design` and `execute` phases; STOP gate in design prompt.
- `templates/workflows/milestone.yaml` — added `prompt:` to `brainstorm`, `propose-project-updates`, `propose-phases`.
- `test/integration-v15-builtin-templates.js` — NEW (7 cases).
- `package.json` — added integration test to `npm test` chain.

## Verification

- `node test/integration-v15-builtin-templates.js` → 7/7 pass.
- `npm test` → all suites green.
- `cp audit --json` → 0 HIGH / 0 MEDIUM.

## Commits

- `phase 74-02: add prompt fields to quick.yaml and milestone.yaml, integration test for v1.5 built-in templates`

## Why this matters

This phase closes the v1.5 implementation loop. Phases 70–73 fixed the config-token / skill-routing / orthogonality / persona-vs-routing-key surface. But the original user-reported symptom (`cp-quick` agent jumps to implementation on a terse description) would have persisted because the STOP gate never reached the supervisor. Phase 74 closes that gap and adds regression coverage so it cannot return.
