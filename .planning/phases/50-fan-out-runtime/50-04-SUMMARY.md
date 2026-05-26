---
subsystem: tooling
tags:
  - runtime
  - fanout
  - v1.2
  - depends_on
  - integration
requires:
  - 50-01
  - 50-02
  - 50-03
provides:
  - resolveItemOrder
  - cross-item-subtree-wait
  - dev-v2 template
affects:
  - lib/runtime-fanout.js
  - lib/fanout.js
  - templates/workflows/dev-v2.yaml
  - test/integration-fanout-v12.js
  - test/unit-runtime-fanout.js
  - test/unit-fanout.js
  - .planning/phases/50-fan-out-runtime/DESIGN.md
  - package.json
tech-stack:
  added: []
  patterns:
    - all-or-nothing-dag-resolution
    - subtree-wait-after-edges
    - agent-declared-runtime-dag
key-files:
  created:
    - templates/workflows/dev-v2.yaml
    - test/integration-fanout-v12.js
  modified:
    - lib/runtime-fanout.js
    - lib/fanout.js
    - test/unit-runtime-fanout.js
    - test/unit-fanout.js
    - .planning/phases/50-fan-out-runtime/DESIGN.md
    - package.json
    - lib/workflow.js
key-decisions:
  - "All-or-nothing DAG rule: only switch to optimised parallel order when every item declares depends_on (incl. [])"
  - Partial depends_on silently falls back to array order to avoid ambiguous ordering bugs
  - Cross-item ordering implemented as `after` edges on expanded children; executor scheduler needs no new primitive
  - Field name `depends_on` chosen on items (matches phase-level vocabulary; clearer to agents than `after`)
  - Schema unchanged — DAG is runtime data the agent supplies, not template config
patterns-established:
  - Runtime contract amendments amplify the parent agent's expressive power without changing workflow YAML schema
  - All-or-nothing resolution surfaces a clear opt-in path to parallelism (agent annotates everything) and a safe default (sequential)
requirements-completed:
  - REQ-V1.2-runtime-contract
  - REQ-V1.2-integration-coverage
duration: 55min
phase: "50"
plan: 50-04
completed: 2026-05-25
end-commit: b8b8011
---
# 50-04: integration tests for v1.2 fan-out (with mid-phase amendment)

## Accomplishments

- Wrote `templates/workflows/dev-v2.yaml`: parent `plan` fans out to per-feature
  `child-plan` → `child-execute` pairs, exercising the v1.2 contract end-to-end.
- Wrote `test/integration-fanout-v12.js`: 25 assertions covering the full pipeline
  (`loadTemplate` → `validate` → `phasesFromTemplate` → `buildParentPrompt` →
  `parseParentOutput` → `enforceChildCount` → `resolveItemOrder` → `expandPhases`)
  across three scenarios (array mode default, full DAG mode, partial fallback)
  plus error paths (cycle, unknown id, bad shape, count bounds).
- Wired the new test into `package.json`'s test chain.
- Filled `.planning/phases/50-fan-out-runtime/DESIGN.md` with the formal
  amendment decision (was previously a stub).

## Task Commits

- `d088f16` feat(50-04): runtime depends_on contract + DESIGN.md amendment
- `d7a39b2` feat(50-04): cross-item subtree-wait in lib/fanout.js#expandPhases
- `b8b8011` test(50-04): integration coverage for v1.2 fan-out via dev-v2 template

## Files Created

- `templates/workflows/dev-v2.yaml`
- `test/integration-fanout-v12.js`

## Files Modified

- `lib/runtime-fanout.js` — new `resolveItemOrder` export, prompt now teaches
  the all-or-nothing `depends_on` rule, parser validates `depends_on` shape.
- `lib/fanout.js` — `expandPhases` now adds cross-item `after` edges (array
  mode chains item N → N-1; DAG mode honours per-item `depends_on`).
- `test/unit-runtime-fanout.js` — +17 assertions (42 total).
- `test/unit-fanout.js` — 1 amended (existing sibling test now also asserts
  the new chain) + 11 new assertions (36 total).
- `.planning/phases/50-fan-out-runtime/DESIGN.md` — status `accepted`,
  Decision / Architecture / Alternatives sections filled.
- `package.json` — wired `integration-fanout-v12` into test chain.

## Decisions Made

(See DESIGN.md for full rationale.)

- **All-or-nothing item DAG.** Items either *all* declare `depends_on` (DAG
  mode, optimised topo order) or *none* / *partial* (sequential array order).
  Eliminates ambiguity from missing fields.
- **`depends_on` on items, not `after`.** Matches phase-level vocabulary and
  reads as a semantic statement to the agent ("this item depends on…").
- **No schema change.** The DAG is a runtime artefact the agent produces;
  workflow authors don't have to predict cross-feature ordering at design time.
- **Cross-item edges as `after` on expanded children.** Executor scheduler
  honours `after` already; no new primitive needed. Item B's whole subtree
  waits for every expanded child of every item in B's `depends_on`.

## Deviations

**Mid-phase amendment to the parent agent contract.** Discussed with the
user after 50-03 shipped: the original 50-01..50-03 contract had no way to
express inter-item dependencies, which is a common real-world need for
fan-out planning ("feature B builds on feature A"). Extended the contract
under 50-04 rather than reopening 50-02/50-03's already-committed code:

1. Prompt + parser additions (commit `d088f16`).
2. Expander wiring (commit `d7a39b2`).
3. Integration test against `dev-v2` (commit `b8b8011`).

The one existing assertion that changed (`unit-fanout.js` "child sibling
after-deps are paired per item id") was updated in place to reflect the new
default-mode chaining. All other 50-01..50-03 tests remain green untouched.

## Issues

None. Full `npm test` green after each commit.

## Next Phase Readiness

- Phase 51 (CLI shims + deprecate cp-plan-phase) can proceed.
  `bin/commands/autonomous.js` and `bin/commands/quick.js` refactors now have
  a fully-tested fan-out runtime to call into.
- `dev-v2.yaml` is a candidate replacement for `dev.yaml` once Phase 51 wires
  `cp run dev-v2` into the milestone autonomous loop.
- Open question recorded in DESIGN.md: should `resolveItemOrder` *warn* (not
  silently fall back) when partial mode includes non-empty `depends_on`
  arrays? Deferred — the prompt guidance should make this rare.
