---
title: v1.8 Phase 96 — Validator hard-fail for bad materialize roadmap-phases
status: ready
---

# Problem

The milestone workflow shipped with `propose-phases` declaring
`materialize: roadmap-phases` but **no child phases under it**. This meant the
workflow proposed phases and then stopped — no execution layer existed. The
validator did not catch this: the misconfigured template still passed
`cp workflow validate milestone`.

We fixed the template in Phase 97. Phase 96 prevents the bug from recurring by
making the validator hard-fail any future `materialize: roadmap-phases` parent
that lacks an execution layer.

# Approach

Edit `lib/workflow.js` (around the existing `materialize` check at line 750).

New rule: a phase with `materialize: roadmap-phases` **must** declare at least
one child phase (some other phase with `parent: <this-id>`) **unless** the
workflow sets `meta.supervised: true` (because a supervisor agent dispatches
children at runtime, independent of static template definitions).

Logic:

```js
if (phase.materialize === 'roadmap-phases' && isParentPhase === false) {
  if (meta.supervised === true) {
    // OK — supervisor will dispatch dynamically
  } else {
    errors.push(
      `phase '${info.id}' has materialize: roadmap-phases but no child ` +
      `phases (need at least one phase with parent: ${info.id}, or set ` +
      `meta.supervised: true to let a supervisor dispatch dynamically)`
    );
  }
}
```

Wire this into `validateV12Schema` which already has access to
`isParentPhase` and `referencedParentIds`. Pass `meta` in (it's not currently
threaded — small refactor: add `meta` as a parameter, callers already have it).

# Done-When

- [ ] `lib/workflow.js`: new error for `materialize: roadmap-phases` parent
      with zero children and `supervised !== true`.
- [ ] New unit test in `test/unit-workflow-schema-v14.js`:
      - parent with `materialize: roadmap-phases` + child + not supervised → OK
      - parent with `materialize: roadmap-phases` + no child + `supervised: true` → OK
      - parent with `materialize: roadmap-phases` + no child + not supervised → ERROR
- [ ] `node bin/cp.js workflow validate milestone` still exits 0 (template
      already has children after P97).
- [ ] `node bin/cp.js workflow validate quick` still exits 0.
- [ ] `node bin/cp.js workflow validate dev` still exits 0 (any other built-in too).
- [ ] `npm test` shows 125+ passing (3 new tests), 0 failing.
- [ ] One atomic commit `feat(workflow): hard-fail bad materialize roadmap-phases (v1.8 P96)`.

# Notes

- The check must run inside `validateV12Schema` (where `isParentPhase` is
  computed) rather than the per-phase loop at line 750, because that loop
  doesn't know about other phases' `parent:` references.
- Actually, `isParentPhase` IS already computed in `validateV12Schema` based on
  `referencedParentIds`. The simplest move: add the new error right next to the
  existing `warnings.push('materialize but is not a parent phase')` branch.
