---
phase: "32"
name: map-codebase auto-init
milestone: v0.9 Onboarding
status: in-progress
created: 2026-05-21
base-commit: e6c1831894796431792116565e1404f30c549c1b
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

# Phase 32: map-codebase auto-init

**Milestone**: v0.9 Onboarding
**Created**: 2026-05-21

## Goal

`/cp-map-codebase` becomes a one-command start for users in case 2 (existing
code, no `.planning/` yet). The skill detects missing `.planning/` and
auto-invokes `cp init` first with an explicit notice, then proceeds with
the normal mapping flow. No silent side-effects.

## Success Criteria

1. Running `/cp-map-codebase` in a repo without `.planning/` prints a clear
   notice like `ℹ .planning/ not found — initialising before mapping…`
   and then runs `cp init` before scaffolding the codebase docs.
2. Running `/cp-map-codebase` in a repo that already has `.planning/`
   behaves exactly as before — no regression for case 1/3 users.
3. The skill's "Brownfield bootstrap" note at the bottom is updated to
   reflect the new single-command order; no stale `cp init` → `/cp-map-codebase`
   instruction remains.
4. All four installers (copilot, claude, cursor, aider) ship the updated
   skill — verified via existing installer tests.

## Plans

- [x] 32-01: skill rewrite — add Step 0 (auto-init), update brownfield note,
       refresh installer-test fixtures if they pin specific skill content

## Notes

- This phase touches ONLY `commands/cp/map-codebase.md` (source of truth)
  plus any unit tests that assert on skill content. Installers re-read
  from `commands/cp/` so no installer.js edits are needed.
- Decision: print notice before invoking `cp init`, not after — users
  should see what's happening before files appear.
