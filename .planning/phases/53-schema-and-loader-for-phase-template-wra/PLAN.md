---
phase: "53"
name: Schema and loader for phase/template wrappers
milestone: v1.3 Reusable Phase Templates
status: in-progress
created: 2026-05-27
base-commit: 8c2668510e9c73c48c8b61d3d967359268e556e7
expected-key-files:
  "53-01":
    - lib/workflow.js
    - test/unit-workflow-schema-v13.js
  "53-02":
    - lib/workflow.js
    - test/unit-workflow-schema-v13.js
  "53-03":
    - lib/workflow.js
    - test/unit-workflow-schema-v13.js
  "53-04":
    - test/integration-workflow-v13.js
---

# Phase 53: Schema and loader for phase/template wrappers

**Milestone**: v1.3 Reusable Phase Templates
**Created**: 2026-05-27

## Goal

Teach the workflow loader (`lib/workflow.js`) to recognize the v1.3 YAML
wrapper shapes (`phase:` and `template:`), auto-wrap v1.2 bare entries
into synthetic `phase:` objects, and apply the field-rules table from
DESIGN.md Q3/Q4 — without yet resolving any templates. This phase
defines the *schema surface*; templates remain unresolved (Phase 54
handles phase-template resolution, Phase 55 handles workflow-template
expansion).

## Success Criteria

1. A v1.2 workflow file (bare phase entries) loads with **zero
   behavior change** — bare entries are auto-wrapped internally; the
   public output of `loadTemplate()` + `validate()` + `computeWaves()`
   matches the v1.2 baseline exactly.
2. A v1.3 workflow file using `phase:` wrappers (no templates yet)
   loads and validates equivalently to its v1.2 bare form.
3. A `template:`-wrapped entry parses without crash; validator
   surfaces an error `"template entry resolution not yet
   implemented"` until Phase 55 lands (load-time guard so Phase 53
   tests can assert structure).
4. Field-rules table from DESIGN.md Q3/Q4 enforced: forbidden field
   on a `template:` entry, or on a `phase:` entry that has an inner
   `template:`, → load-time error citing the YAML path.
5. New test file `test/unit-workflow-schema-v13.js` passes; existing
   `test/unit-workflow*.js` continues to pass unchanged.

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [x] 53-01: Add wrapper-recognition + auto-wrap helper.
  Introduce `unwrapPhaseEntry(entry, index)` that returns
  `{ kind: 'phase'|'template', body, sourcePath }`. Update
  `loadTemplate()` / `normalisePhase()` to route through it. Bare
  entries (no top-level `phase:`/`template:` key) wrap silently. Add
  unit tests for all three input shapes (bare, `phase:` wrapper,
  `template:` wrapper) confirming identical internal representation
  for the phase-wrapped/bare pair.

- [ ] 53-02: Wire `validate()` to the wrapper model.
  `validate()` walks wrapped phases. For `kind: 'phase'`, behavior
  unchanged from v1.2. For `kind: 'template'`, validator emits guard
  error `"template entry resolution not yet implemented (Phase 55)"`.
  Existing v1.2 fixtures continue passing. Add tests for the v1.3
  `phase:` wrapped form matching v1.2 outcomes.

- [ ] 53-03: Field-rules enforcement (DESIGN.md Q3/Q4 table).
  - `template:` entry: only `id` (required), `name` (required), `args`
    (optional), `after` (optional). Any other key → error citing
    `phases[i].<field>`.
  - `phase:` entry with inner `template:`: only `id`, `template`,
    `after` at the phase level. Inner `template:` must be an object
    with `name` (string) + optional `args` (object). Inline overrides
    of phase fields → error.
  - `phase:` entry without inner `template:`: behaves as a v1.2 phase.
  Add error-path unit tests for each violation class.

- [ ] 53-04: Integration fixtures + adapter coverage.
  Create `templates/workflows/_fixtures-v13/`:
  `bare-v12.yaml`, `wrapped-phase.yaml`,
  `template-include-stub.yaml`,
  `error-template-with-prompt.yaml`,
  `error-phase-template-override.yaml`. Add
  `test/integration-workflow-v13.js` that loads each via
  `loadTemplate()` and asserts the expected ok/errors. Confirm
  `lib/runtime.js` and `lib/runtime-fanout.js` show no behavioral
  change against v1.2 fixtures.

## Notes

- Phase 53 does NOT implement template resolution. The `template:`
  guard error is by design.
- Auto-wrap is internal: the YAML on disk is never rewritten.
- Naming `unit-workflow-schema-v13.js` mirrors
  `unit-workflow-schema-v12.js`.
- Run `npm test` at the end of each plan; the phase as a whole must
  leave the full suite green.
