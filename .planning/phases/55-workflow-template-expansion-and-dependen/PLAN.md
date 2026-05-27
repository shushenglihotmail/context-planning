---
phase: "55"
name: Workflow-template expansion and dependency rewriting
milestone: v1.3 Reusable Phase Templates
status: in-progress
created: 2026-05-27
base-commit: 8baffb751303d9ae1c536731545c3779b27b5a4a
expected-key-files:
  "55-01":
    - lib/workflow-template-loader.js
    - test/unit-workflow-template-loader.js
  "55-02":
    - lib/workflow-template-expand.js
    - test/unit-workflow-template-expand.js
  "55-03":
    - lib/workflow.js
    - test/unit-workflow-schema-v13.js
  "55-04":
    - templates/workflow-templates/
    - templates/workflows/_fixtures-v13/
    - test/integration-workflow-templates-v13.js
---

# Phase 55: Workflow-template expansion and dependency rewriting

**Milestone**: v1.3 Reusable Phase Templates
**Created**: 2026-05-27

## Goal

Expand `template:` entries (workflow-template inclusion) at load time:
load the named workflow template, materialize its phases into the
caller's `phases[]` array with `<group-id>--<internal-id>` namespace
prefixing, rewrite internal `after:` references with the same prefix,
attach the wrapper's `after:` to every entry phase of the group, and
rewrite any sibling phase's `after: <group-id>` to point at the
group's exit phases. After this phase, the Phase 55 guard error from
53-03 is gone for well-formed workflow-template references.

## Success Criteria

1. A standalone workflow template at
   `templates/workflow-templates/<name>.yaml` or
   `.planning/workflow-templates/<name>.yaml` loads via a new
   `loadWorkflowTemplate(name, opts)` API; project scope shadows
   builtin (DESIGN.md Q2).
2. A workflow that includes a workflow template via the v1.3
   `template:` wrapper resolves cleanly: the wrapper entry is replaced
   by the materialized group phases (prefixed ids), the group-handle
   id is erased, and the resulting graph passes `validate()` +
   `computeWaves()` end-to-end.
3. Dependency rewriting matches DESIGN.md §"How dependencies attach":
   - `after:` on the `template:` entry → prepended to every group
     entry phase (phases with no inbound edge from inside the group).
   - `after: <group-id>` on outside phases → rewritten to `after:
     [<every group exit phase>]`.
   - Internal `after:` references within the template body → prefixed
     to stay inside the expanded namespace.
4. Edge cases enforced per DESIGN.md: empty-group → load-time error;
   group-handle id collision with any other id → load-time error;
   prefixed phase id collision with any other id → load-time error;
   chain depth (workflow-template that itself includes another
   workflow template) capped at 3.
5. `{{name}}` substitution inside workflow-template bodies works
   identically to phase-template substitution (reuses
   `lib/template-substitute.js`). Existing v1.2 + Phase-53/54 tests
   stay green; new unit + integration tests cover loader, expansion,
   prefixing, dep rewriting, and edge cases.

## Plans

- [x] 55-01: Workflow-template loader.
  Create `lib/workflow-template-loader.js` exporting
  `loadWorkflowTemplate(name, opts)` + `resolveWorkflowTemplate(name,
  opts)`. Lookup order per DESIGN.md Q2: project
  (`.planning/workflow-templates/<name>.yaml`) shadows builtin
  (`templates/workflow-templates/<name>.yaml`). Returns `{ name,
  params, phases, sourcePath }`. Validates: `name` required;
  `params` array of `{name, default?}`; `phases` non-empty array;
  internal phase ids do not contain the `--` separator (reserved for
  namespace boundary); body fields permitted are the v1.2 phase
  fields plus optional inner `template:` (chained workflow-template
  ref handled by expander in 55-02). Forbids top-level `workflow:`
  and `version:` (workflow-template is not a runnable workflow on
  its own). Add `test/unit-workflow-template-loader.js` with
  happy-path, shadowing-with-warning, not-found, invalid-shape,
  reserved-`--`-id, and duplicate-internal-id cases.

- [x] 55-02: Expansion engine + dependency rewriting.
  Create `lib/workflow-template-expand.js` exporting
  `expandWorkflowTemplate(wrapperEntry, opts)` returning `{ phases,
  warnings }`. Algorithm:
  1. Load template via 55-01 loader.
  2. Merge declared params + caller `args:`; substitute `{{name}}`
     throughout each phase body via `lib/template-substitute.js`
     (reused). Required-param + unused-arg semantics identical to
     54-03.
  3. Prefix every internal phase id with `<group-id>--`. Rewrite
     every internal `after:` reference (and `depends_on:`) that
     points at another internal id with the same prefix. References
     to OUTSIDE ids (i.e., not matching any internal id) are left
     alone — they're already valid in the calling workflow's
     namespace.
  4. Identify entry phases (no inbound internal `after:` /
     `depends_on:` edge) and exit phases (no outbound internal edge).
  5. If wrapper has `after:` → prepend (deduplicated) to every entry
     phase's `after:`.
  6. Empty-group → throw `empty-group` error citing the group handle.
  7. Chained workflow-template ref inside body: recurse up to depth 3.
  Add `test/unit-workflow-template-expand.js` covering prefixing,
  internal vs external after refs, single-phase group degenerate
  case, entry/exit detection, after-on-wrapper attachment,
  empty-group error, chain-depth, and dup-prefixed-id detection
  (when caller passes a group-id that already exists as a phase id).

- [x] 55-03: loadTemplate() wiring + external `after: <group-id>` rewriting.
  Wire `expandWorkflowTemplate()` into `lib/workflow.js`'s
  `loadTemplate()` AFTER phase-template resolution and BEFORE
  validate(). For each phase entry where `_wrapperKind === 'template'`:
  - call expander; splice result.phases into the parent array at the
    wrapper's index (replacing the wrapper); record the wrapper's
    `id` (group handle) + computed exit-phase ids in an
    `exitsByGroup` map.
  After all wrappers expand, do a second pass over the materialized
  phases array: for each phase, walk `after:` (and `depends_on:`)
  and rewrite any reference matching a group handle into the
  corresponding exit-phase ids. Collision detection (group-handle id
  vs other ids, prefixed ids vs other ids) emits errors via
  `_resolverErrors`. Remove the Phase 55 guard from validate()'s
  template-entry branch. Update existing `test/unit-workflow-schema-v13.js`
  template-entry tests to assert the guard is gone for well-formed
  refs and that field-rules still fire for malformed wrappers.

- [x] 55-04: Fixtures + e2e integration.
  Create `templates/workflow-templates/review-and-address.yaml` (the
  worked example from DESIGN.md §"Worked example", with `scope`
  param). Add `_fixtures-v13/` subdir with `chain-1.yaml` /
  `chain-2.yaml` for depth tests and `empty-group.yaml`. Create
  workflow fixtures under `templates/workflows/_fixtures-v13/`:
  `uses-workflow-template.yaml` (the canonical example: plan +
  template:review + execute with `after: review`),
  `wf-chain-ok.yaml`, `wf-chain-exceeded.yaml`,
  `wf-empty-group.yaml`, `wf-group-id-collision.yaml`. Add
  `test/integration-workflow-templates-v13.js` exercising each via
  `loadTemplate()` + `validate()` + `computeWaves()`. Verify the
  worked example resolves to exactly the phase list shown in
  DESIGN.md §"Worked example — caller above resolves to".

## Notes

- The `template:` keyword is overloaded by structural position
  (DESIGN.md Q3): inside a `phase:` wrapper → phase-template ref
  (Phase 54); as the top-level key of a list entry → workflow-template
  inclusion (this phase). The two kinds are already disambiguated
  in `lib/workflow.js` via the `_wrapperKind` non-enumerable marker.
- The `--` separator is reserved for the namespace boundary; the
  loader rejects internal phase ids containing `--`.
- After this phase, the only remaining v1.3 work is CLI surfacing
  (Phase 56), dev.yaml dogfooding (Phase 57), and docs/release
  (Phase 58).
- Run `npm test` at the end of each plan.

