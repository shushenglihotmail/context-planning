---
phase: 96
plan: 96-01
title: "v1.8 Phase 96 — Validator hard-fails bad materialize roadmap-phases"
status: done
commit: f4b79c8
end-commit: f4b79c89e4f766e19d1ce37204a41d0dff394544
date: 2026-05-31
---

# Summary

Closed the validator loophole that let the v1.7-shipped `milestone.yaml`
silently slip through with a `materialize: roadmap-phases` parent and no
execution layer. After this phase, any future workflow template that
declares `materialize: roadmap-phases` **must** either:

1. declare at least one child phase (some phase with `parent: <this-id>`), or
2. set `meta.supervised: true` so the supervisor agent can dispatch
   children at runtime.

Templates failing both checks now hard-fail `cp workflow validate`.

## What changed

- **`lib/workflow.js#validateV12Schema`** — added a hard error next to
  the existing `materialize but is not a parent phase` warning. Threads
  `meta` through so the supervised escape hatch is respected.
- **`test/unit-workflow-schema-v14.js`** — 3 new assertions:
  - parent + `materialize: roadmap-phases` + child + unsupervised → OK
  - parent + `materialize: roadmap-phases` + no child + `supervised: true` → OK
  - parent + `materialize: roadmap-phases` + no child + unsupervised → ERROR

## Verification

- `node bin/cp.js workflow validate milestone` → exit 0 (P97 added children).
- `node bin/cp.js workflow validate quick` → exit 0.
- `node bin/cp.js workflow validate dev` → exit 0.
- `npm test` → all green (3 new tests pass, 0 failing).
- One atomic commit `f4b79c8`.

## Dependency

Sequenced after Phase 97 in the ROADMAP (`Depends on: 97`) because the
template fix had to land before the validator went strict, else
`npm test` would have broken on the very template the validator
protects.
