---
phase: "54"
name: Template resolution and args substitution
milestone: v1.3 Reusable Phase Templates
status: in-progress
created: 2026-05-27
base-commit: cb64e37f09662a56562b156902c8a605412fd315
expected-key-files:
  "54-01":
    - lib/phase-template-loader.js
    - test/unit-phase-template-loader.js
  "54-02":
    - lib/template-substitute.js
    - test/unit-template-substitute.js
  "54-03":
    - lib/workflow.js
    - lib/phase-template-resolver.js
    - test/unit-phase-template-resolver.js
  "54-04":
    - templates/phase-templates/_fixtures-v13/
    - test/integration-phase-templates-v13.js
---

# Phase 54: Template resolution and args substitution

**Milestone**: v1.3 Reusable Phase Templates
**Created**: 2026-05-27

## Goal

Resolve **phase-template references** (`phase:` wrappers with an inner
`template:` block) at load time: locate the phase-template definition,
merge declared params + caller args, substitute `{{name}}` throughout
the body, and splice the resolved phase into the workflow. After this
phase, the Phase 54 guard error from 53-03 is gone for well-formed
phase-template references. Workflow-template inclusion (multi-phase
groups) remains guarded — Phase 55 handles that.

## Success Criteria

1. A standalone phase-template file under `templates/phase-templates/`
   or `.planning/phase-templates/` loads via a new
   `loadPhaseTemplate(name, opts)` API. Project-scope shadows builtin
   (per DESIGN.md Q2).
2. `{{name}}` substitution works across all phase fields per
   DESIGN.md Q1: strings, array elements, numeric/boolean casts.
   Missing required args (no `default:`) → load-time error citing the
   param name. Unused caller args → warning.
3. A workflow that references a phase template via the v1.3 wrapper
   loads cleanly: the Phase 54 guard error is gone, the resolved phase
   appears in the `phases[]` array at the original index, and the
   inner `template:` block is removed.
4. Field-rules enforcement runs **after** resolution against the
   resolved phase — overrides at the wrapper level still fail (per
   DESIGN.md Q4 "no merge" rule, enforced in 53-03).
5. Existing v1.2 and Phase-53 unit + integration tests stay green; new
   tests cover the loader, substitution engine, resolver, and
   integration fixtures.

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [x] 54-01: Phase-template definition format + loader.
  Define the YAML shape for a phase-template file (`name`, optional
  `params: [{name, default?}]`, plus a single phase body). Implement
  `loadPhaseTemplate(name, opts)` in a new module
  `lib/phase-template-loader.js`. Search order per DESIGN.md Q2:
  1) inline (Phase 55), 2) `.planning/phase-templates/<name>.yaml`,
  3) `templates/phase-templates/<name>.yaml`. Validate the template's
  own field-rules (no top-level `id:` on a phase template — `id` is
  supplied by the caller; no inner `template:` inside the body for
  this plan — recursive chaining lands in 54-03). Add
  `test/unit-phase-template-loader.js` with happy-path + shadowing +
  not-found + invalid-shape cases.

- [x] 54-02: `{{name}}` substitution engine.
  Implement `substituteArgs(value, args, opts)` in a new module
  `lib/template-substitute.js`. Recursively walks any JSON-like value;
  in strings, replaces `{{name}}` tokens (whitespace-tolerant inside
  braces). Whole-string `{{name}}` may resolve to a non-string when
  the target field declares a numeric/boolean type (handled by the
  resolver, not the engine itself — the engine returns the raw
  substituted string and the resolver casts). Tracks every arg
  referenced (for unused-args warning). Errors on undeclared `{{var}}`
  citing the call site. Add `test/unit-template-substitute.js`
  covering string/array/object walks, missing-arg error, multiple
  refs in one string, escape edge-cases.

- [ ] 54-03: Resolver integration into `loadTemplate()`.
  Add `lib/phase-template-resolver.js` exporting
  `resolvePhaseTemplate(phaseEntry, opts)` which: loads the named
  phase template, merges declared params (`default:` values) with
  caller `args:`, substitutes throughout the resolved body, sets
  `id:` from the wrapper, copies `after:` from the wrapper, applies
  numeric/boolean casts at the field boundary, and returns the
  resolved phase object (no `_wrapperKind`, no inner `template:`).
  Wire it into `lib/workflow.js`'s `loadTemplate()` pipeline so phase
  entries with inner `template:` are replaced **before** validate()
  runs. Removes the Phase 54 guard error from 53-03 (the
  isPhaseTemplateRef branch — only fires now if resolution itself
  fails, which surfaces a different error). Enforce depth cap 3 for
  phase-template chaining. Update `test/unit-workflow-schema-v13.js`
  to assert the guard error is gone after resolution. Add
  `test/unit-phase-template-resolver.js` for the merge/cast logic.

- [ ] 54-04: Integration fixtures + end-to-end coverage.
  Create `templates/phase-templates/` with one shipping template
  (`reviewer.yaml` — a parameterized code-review phase) plus a
  `_fixtures-v13/` subdir containing
  `chain-depth-ok.yaml`, `chain-depth-exceeded.yaml`,
  `missing-required-arg.yaml`, `unused-arg.yaml`. Add a fixture
  workflow `templates/workflows/_fixtures-v13/uses-phase-template.yaml`
  that references the shipped phase template. New integration test
  `test/integration-phase-templates-v13.js` exercises each fixture
  via `loadTemplate()` and asserts the expected resolved shape /
  errors / warnings. Confirm `lib/runtime.js` and
  `lib/runtime-fanout.js` see the resolved phase, not the wrapper.

## Notes

- Workflow-template inclusion (multi-phase groups) is NOT touched
  here. The Phase 55 guard error from 53-02 stays in place.
- The shipping phase template (`templates/phase-templates/reviewer.yaml`)
  is a real, useful template — not a fixture. Phase 57 will adopt it
  in `dev.yaml`.
- Depth-cap-3 means: `loadTemplate()` may recurse at most 3 levels of
  phase-template-references before throwing. Counted per-chain, not
  globally.
- `{{name}}` substitution applies only inside the template body —
  caller-supplied `id:` and `after:` are NOT substituted (they are
  authored at the call site directly).
- Run `npm test` at the end of each plan; the phase as a whole must
  leave the full suite green.

