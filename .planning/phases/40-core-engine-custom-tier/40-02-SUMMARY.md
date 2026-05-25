---
subsystem: tooling
tags:
  - workflow
  - runtime
  - wave-walker
  - instruction-emitter
  - milestone-tier
  - phase-tier
  - custom-tier
requires:
  - workflow.loadTemplate
  - workflow.validate
  - workflow.computeWaves
  - custom.createRun
  - custom.writeState
  - custom.writePhaseSummary
  - lifecycle.scaffoldMilestone
  - lifecycle.scaffoldPhase
  - lifecycle.writeFile
provides:
  - runtime.startRun
  - runtime.resumeRun
  - runtime.markPhaseComplete
  - runtime.retryPhase
  - runtime.abandonRun
  - runtime.formatInstruction
affects:
  - lib/runtime.js
  - test/integration-runtime.js
  - test/fixtures/workflows/
  - package.json
tech-stack:
  added: []
  patterns:
    - binding-tier dispatch (milestone|phase|custom)
    - wave-aware state advancement (partial-wave completion handled cleanly)
    - single instruction-formatter shared across all three tiers
    - RUN.yaml as the per-run state file for milestone/phase tiers (mirrors custom-tier STATE.yaml)
key-files:
  created:
    - lib/runtime.js
    - test/integration-runtime.js
    - test/fixtures/workflows/dev-mini.yaml
    - test/fixtures/workflows/debug-mini.yaml
    - test/fixtures/workflows/quick-mini.yaml
  modified:
    - package.json
key-decisions:
  - markPhaseComplete takes summaryText as a function argument; Phase 41 CLI will read stdin and pass through — keeps the lib pure
  - startRun supports dryRun:true returning waves[i].instruction without writing state — Phase 41's --plan-only relies on this
  - Module name is runtime.js (broader than wave-walker.js; matches typical workflow-engine terminology)
  - "retryPhase rolls back current_wave to the phase's wave (not just removes from completed[]) — spec interpretation: re-emitting a past-wave instruction requires actually returning there"
  - "Per-run state files: custom-tier uses STATE.yaml (existing convention); milestone-tier uses .planning/milestones/<slug>/RUN.yaml; phase-tier uses .planning/phases/<dir>/.workflow-runs/<slug>.yaml. Lookup by slug walks all three locations."
  - "Instruction format: omit `Global directives` preamble entirely when both constraints and principles are absent; omit `[parallel]` header for single-phase waves"
  - scaffoldPhase audit gate (prior-phase-incomplete) bypassed via force:true when scaffolding milestone-bound phases — empty plan list would otherwise block 2nd+ phase
patterns-established:
  - "Wave instruction format (see lib/runtime.js formatInstruction): Global directives preamble (project constraints + workflow principles, both optional) → `Wave N of M — K phase(s)` header → optional `[parallel]` block → per-phase blocks with `(absent)` literal for absent fields → closing `cp run mark-complete` line"
  - "Three-tier binding resolution: detect by trying custom.readState first, then scanning .planning/phases/*/.workflow-runs/, then .planning/milestones/<slug>/RUN.yaml — throw RunNotFound if none match"
requirements-completed: []
duration: 21min
end-commit: 3dd0f8a
phase: 40
plan: 40-02
completed: 2026-05-25
---
# Summary 40-02

## Goal

Implement `lib/runtime.js` — the stateful wave-walker that drives a workflow
run end-to-end. For each wave, emit an instruction string for the running
agent; when the agent reports completion, advance state. Wires all three
binding tiers (`milestone`, `phase`, `custom`). Plus 3 mini fixtures and a
comprehensive integration test.

## Outcome

Shipped. `lib/runtime.js` exposes the six public functions specified in the
phase DESIGN.md contract; 67 assertions pass standalone and in the full
`npm test` chain (`integration-runtime: 67 passed`). All three binding tiers
exercised end-to-end. No regressions across the 31-file test suite.

## Task Commits

- `78d47ec` test(40-02): add runtime mini fixtures
- `560f1a7` test(40-02): add integration-runtime test (67 assertions)
- `b72aefe` feat(40-02): implement lib/runtime.js — stateful wave-walker
- `3dd0f8a` test(40-02): wire integration-runtime.js into npm test chain

## Files Created

- `lib/runtime.js` — module (~6 public + several internal functions)
- `test/integration-runtime.js` — 67 assertions across 8 sections
- `test/fixtures/workflows/dev-mini.yaml` — milestone-bound 5-phase template (with parallel wave)
- `test/fixtures/workflows/debug-mini.yaml` — custom-bound 4-phase template
- `test/fixtures/workflows/quick-mini.yaml` — custom-bound 3-phase minimal template

## Files Modified

- `package.json` — added `node test/integration-runtime.js` to the npm test chain.

## Decisions Made

**Resolved open questions from phase DESIGN.md:**

- **`markPhaseComplete(slug, phaseId, summaryText, opts?)`** — summary arrives as a function argument. Phase 41's CLI will read stdin and pass it through. Keeps the lib layer pure and synchronous.
- **`startRun(template, {dryRun: true})`** — computes the full wave plan + per-wave instructions without mutating any state file. `waves[]` in the return includes `.instruction` per wave. Phase 41's `cp run --plan-only` consumes this.
- **Module name: `runtime.js`** (not `wave-walker.js`). Broader, matches typical workflow-engine terminology.

**Other decisions:**

- **Per-run state file locations:**
  - `custom` tier: `.planning/custom/<slug>/STATE.yaml` (existing convention).
  - `milestone` tier: `.planning/milestones/<slug>/RUN.yaml`.
  - `phase` tier: `.planning/phases/<phaseDir>/.workflow-runs/<slug>.yaml`.
  - `resumeRun(slug)` walks all three locations to detect binding.
- **`retryPhase` rolls back `current_wave`** to the phase's wave, not just `completed[].remove(phaseId)`. Necessary if we've already advanced past the phase's wave — caller intent is "go back to here".
- **Instruction format omits preamble entirely** when both constraints and principles are absent; omits the `[parallel]` header on single-phase waves; renders absent per-phase fields as the literal string `(absent)` to keep the format unambiguous.
- **`scaffoldPhase` audit gate bypass** — when scaffolding milestone-bound phases at run start, pass `force: true` to bypass the `prior-phase-incomplete` audit (no plans created yet → `ticked = []` would block 2nd+ phase).

## Deviations

- `retryPhase` semantics deviate slightly from the spec wording ("re-emit the current wave's instruction") — implementation rolls back `current_wave` to the phase's wave. Intent-preserving interpretation; documented above.
- No other deviations.

## Issues

None blocking. A few discovery notes worth recording for future work:

- `scaffoldMilestone` creates `DESIGN.md` from `templates/DESIGN.md` as a side effect — convenient because the directory then exists for `RUN.yaml` write.
- `scaffoldPhase` calls `state.regenerate(root)` after every invocation; the test's `freshProject()` had to include a `Progress:` line in STATE.md and a `## Phases` section in ROADMAP.md to make regeneration succeed silently.

## Next Phase Readiness

Phase 40 is complete. All three core modules ship:
- `lib/workflow.js` (40-01) — template loader/validator/wave planner.
- `lib/custom.js` (40-03) — custom-tier state manager.
- `lib/runtime.js` (40-02) — stateful wave-walker tying it all together.

Phase 41 can now build the CLI surface (`cp run`, `cp workflow ls/show/validate/diagram/init/new/import/brainstorm`) as thin wrappers over these libs, plus ship the built-in templates (`templates/workflows/dev.yaml`, `debug.yaml`, `quick.yaml`).
