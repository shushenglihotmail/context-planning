---
phase: "40"
name: Core engine + custom tier
milestone: v1.0 Workflow Engine
status: complete
created: 2026-05-25
base-commit: 41cdc0b6e91bcf45e6aecf404f714993550cdacb
plan-status:
  40-01: complete
  40-02: complete
  40-03: complete
plan-started:
  40-01: 2026-05-25T17:30:00.000Z
  40-02: 2026-05-25T18:05:00.000Z
  40-03: 2026-05-25T17:30:00.000Z
plan-completed:
  40-01: 2026-05-25T18:00:00.000Z
  40-02: 2026-05-25T18:30:00.000Z
  40-03: 2026-05-25T17:45:00.000Z
expected-key-files:
  40-01:
    - lib/workflow.js
    - test/unit-workflow.js
    - test/fixtures/workflows/linear.yaml
    - test/fixtures/workflows/parallel.yaml
    - test/fixtures/workflows/cycle.yaml
    - test/fixtures/workflows/dangling-dep.yaml
    - test/fixtures/workflows/bad-yaml.yaml
    - test/fixtures/workflows/missing-id.yaml
  40-02:
    - lib/runtime.js
    - test/integration-runtime.js
    - test/fixtures/workflows/dev-mini.yaml
    - test/fixtures/workflows/debug-mini.yaml
    - test/fixtures/workflows/quick-mini.yaml
  40-03:
    - lib/custom.js
    - test/unit-custom.js
---

# Phase 40: Core engine + custom tier

**Milestone**: v1.0 Workflow Engine
**Created**: 2026-05-25

## Goal

Build the three `lib/` modules at the heart of the Workflow Engine: a YAML template loader/validator/wave-planner (`lib/workflow.js`), a stateful wave-walker that emits per-wave instructions (`lib/runtime.js`), and a custom-tier state manager for `.planning/custom/<slug>/` runs (`lib/custom.js`). Library code only — CLI entry points come in Phase 41.

## Success Criteria

1. `require('context-planning/lib/workflow')` exposes `loadTemplate`, `validate`, `computeWaves`, `resolveTemplate`; validation catches every error case in the milestone DESIGN.md error-handling table (cycle, dangling dep, non-string principles, id collision, bad YAML, missing required fields) with clear messages.
2. `require('context-planning/lib/runtime')` exposes `startRun`, `resumeRun`, `markPhaseComplete`, `retryPhase`, `abandonRun`; running a fixture template through `startRun` → repeated `markPhaseComplete` → end-of-run produces correct state files for all three binding tiers (`milestone`, `phase`, `custom`).
3. `require('context-planning/lib/custom')` exposes the full lifecycle interface; date-prefixed slugs with collision suffixes work; `listRuns()` returns runs sorted by `last_activity` descending; `pruneAbandoned()` is dry-run by default.
4. Wave instructions emitted by `runtime` include the constant preamble (PROJECT.md `## Constraints` + template `principles:`) followed by per-phase blocks formatted exactly as specified in the milestone DESIGN.md "Instruction format" section.
5. Test coverage ≥80% for each new file; full test suite passes on Ubuntu + Windows (existing CI matrix); no regressions to existing ~429-assertion test suite.

## Plans

- [ ] **40-01: `lib/workflow.js` + fixtures + unit tests** — Implement YAML template loader (`loadTemplate` returning `{meta, principles, defaults, phases}`), schema/DAG validator (`validate` covering all error rows from milestone DESIGN.md + topo-order warning + principles count warning), Kahn's-algorithm wave planner (`computeWaves`), and template resolver (`resolveTemplate` — project-local first, then built-in). Write 6 fixture YAML files in `test/fixtures/workflows/` covering the happy + failure cases (linear, parallel-wave, cycle, dangling-dep, bad-yaml, missing-id). `test/unit-workflow.js` with ~80 assertions exercises every public-interface contract + every validation error path + wave computation correctness.

- [ ] **40-02: `lib/runtime.js` + binding-tier integration + integration tests** — Implement the stateful wave-walker: `startRun` (resolves binding, scaffolds milestone/phase/custom shell, computes first wave, returns instruction), `resumeRun` (re-derives current wave from saved state), `markPhaseComplete` (records artifact, advances state, returns next-wave instruction or end-of-run), `retryPhase`, `abandonRun`. Wire `binds_to: milestone` through `lib/lifecycle.js` (calls `scaffoldMilestone` + `scaffoldPhase`), `binds_to: phase` through STATE.md current-phase resolution + append-to-PLAN/SUMMARY, `binds_to: custom` through `lib/custom.js`. Implement instruction format precisely per milestone DESIGN.md (preamble: PROJECT constraints + template principles; per-phase blocks: role/model/skill/persist_output/prompt; parallel-wave header when wave size >1). Include `dryRun: true` option for Phase 41's `--plan-only`. `test/integration-runtime.js` with ~30 assertions covers all three binding tiers using mini `dev`/`debug`/`quick` fixtures + instruction-format snapshot.

- [ ] **40-03: `lib/custom.js` + unit tests** — Implement custom-tier state lifecycle: `createRun` (date-prefixed slug with collision suffix `-2`/`-3`/…, creates dir + STATE.yaml), `listRuns` (scans `.planning/custom/*/STATE.yaml`, sorts by `last_activity` desc), `readState`/`writeState` (atomic write via existing `writeBatch` pattern from `lib/lifecycle.js`, auto-updates `last_activity`), `writePhaseSummary` (path = `<NN>-<phase-id>.md` where NN is topological order, zero-padded), `pruneAbandoned` (default `dryRun: true`; `{apply: true}` to delete), `runDir`. STATE.yaml shape matches phase DESIGN.md spec exactly. `test/unit-custom.js` with ~40 assertions covers slug generation + collision handling + atomic-write semantics + listing/sorting + prune dry-run vs apply.

## Notes

<!-- Free-form during phase execution. -->

- Phase architecture is fully specified in `.planning/phases/40-core-engine-custom-tier/DESIGN.md`. Implementers should treat that DESIGN.md's "Components" section as the public-interface contract — deviation requires a milestone-DESIGN update first.
- All three plans are independent at the file level but **sequential by dependency**: 40-02 depends on 40-01 (uses `computeWaves`) and 40-03 (uses `createRun`). Recommended order: 40-01 → 40-03 → 40-02.
- TDD discipline: write the test first, watch it fail, then implement (matches cp's existing convention).
- The three open questions in the phase DESIGN.md should be resolved during 40-02 implementation; record decisions in `REVIEW-LOG.md` or as a follow-up DESIGN.md edit.
- No CLI changes in this phase — `bin/cp.js` stays untouched. Phase 41 adds all CLI handlers.
