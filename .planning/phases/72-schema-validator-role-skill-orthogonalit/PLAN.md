---
phase: "72"
name: Schema validator role/skill orthogonality
milestone: v1.5 Role/skill semantics
status: in-progress
created: 2026-05-28
base-commit: 6f85990b7d8890e2988b50aee1e4040c52ea9c5e
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

# Phase 72: Schema validator role/skill orthogonality

**Milestone**: v1.5 Role/skill semantics
**Created**: 2026-05-28

## Goal

Enforce role/skill orthogonality in the workflow schema validator so a
phase can't accidentally use a routing key as its `role:` (persona) or
contradict itself by setting both `role:` and `skill:` to different
routing keys.

## Success Criteria

1. A phase with `role: plan` (a known routing key) emits a validator
   warning explaining role is persona-only.
2. A phase with `kind: skill`, `role: plan`, `skill: writing-plans`
   (different from the role's resolution) validates cleanly — role is
   persona, skill is the routing/literal selector.
3. A phase with `kind: skill`, `role: plan`, `skill: execute` (both
   are routing keys *and* disagree) emits an error (likely author
   confusion).
4. Existing `kind: scaffold` checks unchanged.
5. `KNOWN_ROUTING_KEYS` is derived from the templates/config.json
   default superpowers provider so additions stay in sync.

## Plans

### 72-01 — Validator: role/skill orthogonality in `lib/workflow.js`

- Add a module-level `KNOWN_ROUTING_KEYS` constant (Set) built lazily
  from `provider.loadDefaults()`'s superpowers skills keys.
- In the `kind: skill` validator branch:
  - If `phase.role` is a known routing key, push a warning:
    `phase '<id>' role '<role>' looks like a routing key — role is persona only; use skill: <role> instead`.
  - If both `phase.role` and `phase.skill` are known routing keys
    AND they differ, push an error:
    `phase '<id>' has role '<role>' and skill '<skill>' both as routing keys — they must agree (drop one or set role to a persona)`.
- Keep existing scaffold checks intact.

Files: `lib/workflow.js`.

### 72-02 — Unit tests

Extend `test/unit-workflow-schema-v14.js` with three new `check()`
cases covering the success criteria above. Use the same scaffold
helpers already in that file.

Files: `test/unit-workflow-schema-v14.js`.

### 72-03 — Full `npm test` + SUMMARY.md

Run full suite. Write `.planning/phases/72-…/SUMMARY.md`.

Files: `SUMMARY.md`.

## Notes

- We deliberately do NOT validate that role is a "real" persona — it
  is free-form (developer, tech-writer, designer, etc.). We only
  validate the *negative* case where it collides with the routing-key
  vocabulary.
- Pinned-literal skills (e.g. `skill: writing-plans`) are unaffected;
  the agreement check only fires when both fields are routing keys.
