---
phase: "49"
name: Unified Phase type + reader abstractions
milestone: v1.2 Unified Phase Model
status: in-progress
created: 2026-05-25
base-commit: 8f40fc160238d0635f06556f8f66c80153ac7813
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

# Phase 49: Unified Phase type + reader abstractions

**Milestone**: v1.2 Unified Phase Model
**Created**: 2026-05-25

## Goal

Introduce a single `Phase` data type used by both the milestone layer
(ROADMAP.md parser) and the workflow layer (template YAML parser),
without changing any runtime behavior. This is the foundation for
phases 50-52 — once both layers speak the same shape, the cp-autonomous
and cp-quick shims become straightforward.

## Success Criteria

<!-- Observable from the user's perspective. -->

1. New file `lib/types.js` exports a JSDoc `@typedef` for `Phase` plus
   a runtime `validatePhase(obj)` helper that returns
   `{ok: boolean, errors: string[]}`.
2. New function `lib/milestone.js#readPhases(roadmapMd, opts?)` parses
   ROADMAP.md and returns `Phase[]` matching the unified shape, with
   milestone-specific extension fields (`plans`, `workflow?`,
   `summary?`).
3. Existing `lib/workflow.js` parsers (template → wave decomposition)
   continue to work; a thin `phasesFromTemplate(template)` adapter is
   added that returns the unified `Phase[]` shape. No existing call
   sites change — both shapes coexist for one milestone.
4. New test file `test/unit-types.js` (~20 assertions) covers the
   typedef contract via `validatePhase`.
5. New test file `test/unit-milestone-reader.js` (~30 assertions)
   covers `readPhases` against fixture ROADMAP.md content including:
   in-progress and collapsed milestones, phases with/without plans
   lists, phases with and without the future `workflow:` annotation.
6. `npm test` exit code 0 with zero regressions in any pre-existing
   test file (108+ existing files must stay green).
7. No CLI surface changes. No public API removals. `bin/commands/*`
   not touched.

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [ ] 49-01: `lib/types.js` — define the `Phase` JSDoc typedef and the `validatePhase(obj)` runtime check (returns `{ok, errors}`); ship `test/unit-types.js` with ~20 assertions covering required-field validation, status enum, depends_on array shape, and the layer-specific extension fields (milestone vs workflow).
- [ ] 49-02: `lib/milestone.js#readPhases(roadmapMd, opts?)` — new exported function that parses ROADMAP.md and emits `Phase[]` shape-conforming to `validatePhase`. Must handle: in-progress milestone (`### 🚧 ...`), shipped/collapsed milestones (`<details>` blocks), phases with explicit plans list, phases without plans, and tolerate the future `workflow:` annotation if present in a phase heading or frontmatter. New `test/unit-milestone-reader.js` (~30 assertions) including fixture ROADMAPs covering all four shapes.
- [ ] 49-03: `lib/workflow.js#phasesFromTemplate(template)` — new adapter that takes the existing template object and returns `Phase[]` matching the unified shape. Does NOT remove or change existing `computeWaves`, `readTemplate`, etc. Adds ~10 parity assertions to existing `test/unit-workflow.js` (or new `test/unit-workflow-phase-adapter.js`) proving the adapter output passes `validatePhase`.

## Notes

- The unified `Phase` typedef stays in JSDoc form (no TypeScript
  introduction) per project convention.
- Milestone-extension fields (`plans`, `workflow?`, `summary?`,
  `base-commit?`) and workflow-extension fields (`role`, `model?`,
  `persist_output?`) are documented in the same typedef as optional
  members. `validatePhase` only enforces the common required fields
  (`id`, `depends_on`, `status`); a future stricter
  `validateMilestonePhase` / `validateWorkflowPhase` can layer on top
  if needed.
- This phase deliberately ships READ-ONLY adapters. Phase 50 wires
  the `workflow:` field into milestone-phase frontmatter and the
  scaffold-phase CLI. Phase 51-52 then refactor cp-autonomous /
  cp-quick to consume the unified shape.
- Backward-compat: existing call sites of `roadmap.js` parsing
  continue to work. `readPhases` is additive — it lives alongside,
  not in place of, current callsites. Phase 50+ migrate callers one
  at a time.
